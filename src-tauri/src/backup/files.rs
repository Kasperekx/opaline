use super::models::DumpFormat;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

pub(crate) struct PreparedFile {
    pub file: tempfile::NamedTempFile,
    pub format: DumpFormat,
    pub bytes: u64,
    pub digest: String,
    pub text_preview: String,
}

// Only remove pg_dump's framing, never backslash sequences from SQL strings or COPY data.
// A fresh, unpredictable outer key keeps psql metacommands (including reconnect / shell) disabled.
pub(crate) fn restricted_sql(text: &str, key: &str) -> Result<String, String> {
    if text.contains('\0') {
        return Err("SQL dump contains NUL bytes.".into());
    }
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let meaningful = |line: &&str| !line.trim().is_empty() && !line.trim_start().starts_with("--");
    let first = lines.iter().position(meaningful);
    let last = lines.iter().rposition(meaningful);
    let mut omit = None;
    if let Some(first) = first {
        if let Some(original_key) = lines[first].trim().strip_prefix("\\restrict ") {
            if original_key.is_empty()
                || !original_key.chars().all(|c| c.is_ascii_alphanumeric())
                || last.is_none_or(|last| {
                    last <= first || lines[last].trim() != format!("\\unrestrict {original_key}")
                })
            {
                return Err(
                    "Invalid psql restriction framing. Review this trusted dump before restoring."
                        .into(),
                );
            }
            omit = Some((first, last.unwrap()));
        }
    }
    let mut result = format!("\\restrict {key}\n");
    for (index, line) in lines.iter().enumerate() {
        if !omit.is_some_and(|(first, last)| index == first || index == last) {
            result.push_str(line);
        }
    }
    result.push_str(&format!("\n\\unrestrict {key}\n"));
    Ok(result)
}

#[cfg(test)]
pub(crate) fn snapshot(path: &Path) -> Result<PreparedFile, String> {
    snapshot_with_cancel(path, || false)
}

pub(crate) fn snapshot_with_cancel(
    path: &Path,
    cancelled: impl Fn() -> bool,
) -> Result<PreparedFile, String> {
    let started = std::time::Instant::now();
    let check = || {
        if cancelled() {
            Err("Dump inspection cancelled.".to_string())
        } else if started.elapsed() > std::time::Duration::from_secs(3600) {
            Err("Dump inspection exceeded the 1 hour safety timeout.".to_string())
        } else {
            Ok(())
        }
    };
    check()?;
    let mut source = std::fs::File::open(path).map_err(|_| "Cannot open the selected dump.")?;
    let metadata = source
        .metadata()
        .map_err(|_| "Cannot inspect the dump file.")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 100 * 1024 * 1024 * 1024 {
        return Err("Choose a non-empty regular dump file, at most 100 GiB.".into());
    }
    let mut magic = [0u8; 5];
    source
        .read_exact(&mut magic)
        .map_err(|_| "The dump is too short or unreadable.")?;
    source
        .seek(SeekFrom::Start(0))
        .map_err(|_| "Cannot read the dump.")?;
    let format = if &magic == b"PGDMP" {
        DumpFormat::Custom
    } else {
        DumpFormat::Sql
    };
    let mut file = tempfile::NamedTempFile::new()
        .map_err(|_| "Cannot create a private dump snapshot. Check free space.")?;
    let mut digest = Sha256::new();
    let mut text_preview = String::new();
    let bytes;
    if format == DumpFormat::Sql {
        let mut data = Vec::new();
        source
            .take(64 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|_| "Cannot read SQL dump.")?;
        if data.len() > 64 * 1024 * 1024 {
            return Err("Plain SQL restore is limited to 64 MiB. Use a custom archive for larger databases.".into());
        }
        check()?;
        digest.update(&data);
        bytes = data.len() as u64;
        let text = std::str::from_utf8(&data).map_err(|_| {
            "Unknown dump format. Choose a PostgreSQL custom archive or UTF-8 SQL script."
        })?;
        if text.trim_start().starts_with(['{', '[']) {
            return Err(
                "This is not a PostgreSQL dump. JSON/CSV data imports are separate operations."
                    .into(),
            );
        }
        text_preview = text.chars().take(12000).collect();
        let key = uuid::Uuid::new_v4().simple().to_string();
        let sql = restricted_sql(text, &key)?;
        file.write_all(sql.as_bytes())
            .map_err(|_| "Cannot prepare SQL snapshot. Check free space.")?;
    } else {
        let mut count = 0;
        let mut buffer = [0u8; 65536];
        loop {
            check()?;
            let size = source
                .read(&mut buffer)
                .map_err(|_| "Cannot read archive.")?;
            if size == 0 {
                break;
            }
            count += size as u64;
            if count > 100 * 1024 * 1024 * 1024 {
                return Err("Archive exceeds 100 GiB.".into());
            }
            digest.update(&buffer[..size]);
            file.write_all(&buffer[..size])
                .map_err(|_| "Cannot create private archive snapshot. Check free space.")?;
        }
        bytes = count;
    }
    file.as_file()
        .sync_all()
        .map_err(|_| "Cannot flush private dump snapshot.")?;
    check()?;
    Ok(PreparedFile {
        file,
        format,
        bytes,
        digest: format!("{:x}", digest.finalize()),
        text_preview,
    })
}
