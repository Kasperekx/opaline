use crate::{database::table_data::quote_identifier, state::DatabaseSession};
use std::time::Duration;
use tokio::sync::watch;

struct CreationGuard<'a> {
    session: &'a DatabaseSession,
    finished: bool,
}

impl Drop for CreationGuard<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.session.invalidate();
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                let token = self.session.client.cancel_token();
                let tls = self.session.tls.clone();
                runtime.spawn(async move {
                    let _ = tokio::time::timeout(
                        Duration::from_secs(5),
                        crate::database::postgres::cancel_with_tls(&token, tls),
                    )
                    .await;
                });
            }
        }
    }
}

pub(crate) fn validate_name(name: &str) -> Result<(), String> {
    if name.trim() != name
        || name.is_empty()
        || name.len() > 63
        || name.chars().any(char::is_control)
    {
        return Err("Use a database name of 1–63 UTF-8 bytes, without control characters or leading/trailing whitespace.".into());
    }
    Ok(())
}

// CREATE DATABASE cannot be part of the restore transaction. Never reuse an
// existing database and never automatically DROP a database after a failed restore.
pub(crate) async fn create(
    session: &DatabaseSession,
    name: &str,
    mut cancel: watch::Receiver<bool>,
) -> Result<(), String> {
    validate_name(name)?;
    if session.info.read_only {
        return Err("Database creation requires write access.".into());
    }
    if *cancel.borrow() {
        return Err("Cancelled before database creation. Nothing was created.".into());
    }
    let sql = format!(
        "CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'",
        quote_identifier(name)
    );
    let mut guard = CreationGuard {
        session,
        finished: false,
    };
    let outcome = tokio::select! {
        result = tokio::time::timeout(Duration::from_secs(30), session.client.batch_execute(&sql)) => Some(result),
        _ = cancel.changed() => None,
    };
    match outcome {
        Some(Ok(Ok(()))) => {
            guard.finished = true;
            Ok(())
        }
        Some(Ok(Err(error))) if error.as_db_error().is_some() => {
            guard.finished = true;
            let code = error.code().map(|code| code.code()).unwrap_or("unknown");
            Err(format!("Could not create the new database (SQLSTATE {code}). Check CREATEDB permission and choose a name that does not already exist. Restore was not started."))
        }
        _ => {
            Err(format!("Creation of database {name:?} was not confirmed. It may exist. Reconnect and inspect before retrying. Restore was not started; no database was automatically dropped."))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn database_names_cannot_be_truncated_or_contain_control_characters() {
        for name in [
            "",
            " x",
            "x ",
            "a\0b",
            "a\nb",
            &"x".repeat(64),
            &"ż".repeat(32),
        ] {
            assert!(validate_name(name).is_err());
        }
        for name in ["new database", "odd\"name", "żółć", &"x".repeat(63)] {
            assert!(validate_name(name).is_ok());
        }
    }
}
