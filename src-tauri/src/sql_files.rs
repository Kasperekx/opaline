use serde::Serialize;
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
};
use tauri_plugin_fs::FsExt;
use tokio::sync::Mutex;

const MAX_SQL_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub(crate) struct SqlFiles(Mutex<HashMap<String, OpenFile>>);
struct OpenFile {
    path: PathBuf,
    content: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SqlDocument {
    id: String,
    path: String,
    content: String,
}

fn read_sql(path: &Path) -> Result<String, String> {
    if path
        .extension()
        .and_then(|p| p.to_str())
        .is_none_or(|e| !e.eq_ignore_ascii_case("sql"))
    {
        return Err("Choose a .sql file.".into());
    }
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|_| "Cannot read SQL file.")?;
    let mut bytes = Vec::new();
    file.take(MAX_SQL_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read SQL file.")?;
    if bytes.len() > MAX_SQL_BYTES {
        return Err("SQL files are limited to 1 MiB in the editor. Use Restore for dumps.".into());
    }
    String::from_utf8(bytes).map_err(|_| "SQL file must be UTF-8.".into())
}

fn write_sql(path: &Path, content: &str, expected: Option<&str>) -> Result<(), String> {
    if content.len() > MAX_SQL_BYTES {
        return Err("SQL files are limited to 1 MiB in the editor.".into());
    }
    if path
        .extension()
        .and_then(|p| p.to_str())
        .is_none_or(|e| !e.eq_ignore_ascii_case("sql"))
    {
        return Err("Use the .sql extension.".into());
    }
    if let Some(expected) = expected {
        if read_sql(path)? != expected {
            return Err("File changed outside Opaline. Your draft is safe. Use Save as to keep both versions, or reopen the file in another tab to compare.".into());
        }
    }
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid file path.")?)
        .map_err(|_| "Cannot create temporary SQL file.")?;
    temp.write_all(content.as_bytes())
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|_| "Cannot save SQL file. Your draft is unchanged.")?;
    // Recheck immediately before replacement; never deliberately overwrite an external edit.
    if let Some(expected) = expected {
        if read_sql(path)? != expected {
            return Err("File changed while saving. Use Save as to preserve both versions.".into());
        }
    }
    temp.persist(path)
        .map_err(|_| "Cannot replace SQL file. Your draft is unchanged.")?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn open_sql_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SqlFiles>,
) -> Result<SqlDocument, String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose the SQL file in the native Open dialog first.".into());
    }
    let mut files = state.0.lock().await;
    if files.len() >= 240 {
        return Err("Too many open SQL files. Close a file tab first.".into());
    }
    let file_path = PathBuf::from(&path);
    let content = tokio::task::spawn_blocking(move || read_sql(&file_path))
        .await
        .map_err(|_| "Cannot read SQL file.")??;
    let id = uuid::Uuid::new_v4().to_string();
    files.insert(
        id.clone(),
        OpenFile {
            path: path.clone().into(),
            content: content.clone(),
        },
    );
    Ok(SqlDocument { id, path, content })
}

#[tauri::command]
pub(crate) async fn save_sql_file(
    id: Option<String>,
    path: Option<String>,
    content: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SqlFiles>,
) -> Result<SqlDocument, String> {
    let mut files = state.0.lock().await;
    let (file_path, expected) = if let Some(path) = path {
        if !app.fs_scope().is_allowed(&path) {
            return Err("Choose a destination in the native Save dialog first.".into());
        }
        (PathBuf::from(path), None)
    } else {
        let file = files
            .get(id.as_deref().ok_or("Choose Save as first.")?)
            .ok_or("File handle expired. Use Save as.")?;
        (file.path.clone(), Some(file.content.clone()))
    };
    if id.is_none() && files.len() >= 240 {
        return Err("Too many open SQL files.".into());
    }
    let path_copy = file_path.clone();
    let content_copy = content.clone();
    tokio::task::spawn_blocking(move || write_sql(&path_copy, &content_copy, expected.as_deref()))
        .await
        .map_err(|_| "Cannot save SQL file.")??;
    let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    files.insert(
        id.clone(),
        OpenFile {
            path: file_path.clone(),
            content: content.clone(),
        },
    );
    Ok(SqlDocument {
        id,
        path: file_path.to_string_lossy().into(),
        content,
    })
}

#[tauri::command]
pub(crate) async fn release_sql_file(
    id: String,
    state: tauri::State<'_, SqlFiles>,
) -> Result<(), String> {
    state.0.lock().await.remove(&id);
    Ok(())
}

#[tauri::command]
pub(crate) fn validate_sql_format(original: String, formatted: String) -> Result<(), String> {
    use sqlparser::{dialect::PostgreSqlDialect, parser::Parser};
    if original.len() > MAX_SQL_BYTES || formatted.len() > MAX_SQL_BYTES {
        return Err("Formatting is limited to 1 MiB.".into());
    }
    let before = Parser::parse_sql(&PostgreSqlDialect {}, &original).map_err(|_| {
        "This PostgreSQL syntax cannot be safely formatted yet. The editor was not changed."
    })?;
    let after = Parser::parse_sql(&PostgreSqlDialect {}, &formatted)
        .map_err(|_| "Formatted SQL failed validation. The editor was not changed.")?;
    if before != after {
        return Err("Formatting would change the parsed SQL. The editor was not changed.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sql_files_detect_external_changes_and_preserve_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("query.sql");
        write_sql(&path, "select 1;", None).unwrap();
        write_sql(&path, "select 2;", Some("select 1;")).unwrap();
        assert!(write_sql(&path, "select 3;", Some("select 1;")).is_err());
        assert_eq!(read_sql(&path).unwrap(), "select 2;");
        assert!(write_sql(&path, &"x".repeat(MAX_SQL_BYTES + 1), None).is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn formatting_must_preserve_ast() {
        assert!(validate_sql_format(
            "select 'a', 9223372036854775807;".into(),
            "SELECT\n 'a',\n 9223372036854775807;".into()
        )
        .is_ok());
        assert!(validate_sql_format("select 'a';".into(), "select 'b';".into()).is_err());
    }
}
