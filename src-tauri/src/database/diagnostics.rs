//! Actionable diagnostics for app-generated database operations.
//!
//! PostgreSQL's Error Display is usually just "db error". Conversely, its raw
//! DETAIL/CONTEXT/message can contain entire rows, parameters or trigger output.
//! Classify by SQLSTATE and include object identifiers, never values or SQL.
use std::error::Error as StdError;
use tokio_postgres::Error;

pub(crate) fn database_error(operation: &str, error: Error) -> String {
    if let Some(db) = error.as_db_error() {
        let (reason, next_step) = guidance(db.code().code());
        let mut diagnostic = format!(
            "{operation}: {reason}\n{next_step}\nSQLSTATE {}",
            db.code().code()
        );
        for (label, value) in [
            ("Schema", db.schema()),
            ("Table", db.table()),
            ("Column", db.column()),
            ("Constraint", db.constraint()),
        ] {
            if let Some(value) = value {
                let name: String = value
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(128)
                    .collect();
                diagnostic.push_str(&format!(" · {label}: {name}"));
            }
        }
        return diagnostic;
    }

    if error.is_closed() {
        return format!("{operation}: The database connection is closed. Reconnect, then reload the data. If a write was in progress, verify its outcome before retrying it.");
    }
    // Inspect typed causes without copying connection strings or OS error text.
    let mut source = error.source();
    while let Some(cause) = source {
        if let Some(io) = cause.downcast_ref::<std::io::Error>() {
            let hint = match io.kind() {
                std::io::ErrorKind::ConnectionRefused => "The server refused the connection. Check that PostgreSQL is running and that the host and port are correct.",
                std::io::ErrorKind::TimedOut => "The network connection timed out. Check the server, network and firewall before reconnecting.",
                std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::UnexpectedEof => "The connection was interrupted. Reconnect and reload; verify any in-progress write before retrying it.",
                _ => "A connection I/O error occurred. Check the server and network, then reconnect. Verify any in-progress write before retrying it.",
            };
            return format!("{operation}: {hint}");
        }
        source = cause.source();
    }
    format!("{operation}: The PostgreSQL client could not complete the operation. Check connection and TLS settings. If it persists, report the operation and server version; do not include credentials or row values.")
}

fn guidance(code: &str) -> (&'static str, &'static str) {
    match code {
        "42501" => ("Access denied by PostgreSQL.", "Check the connected role's schema, table and sequence privileges. A restore may retain ownership or grants from the source database."),
        "42P01" | "3F000" => ("The requested table or schema does not exist.", "Refresh database objects and reopen the table. Check that this connection targets the restored database."),
        "42703" => ("A referenced column no longer exists.", "Reset saved filters and sorting, then reload the table. Its structure may have changed since this view was saved."),
        "42883" | "42704" => ("A required function, operator or database object is unavailable.", "If this follows sorting or filtering, reset those settings. Otherwise check database extensions and types. If SQL works in another client, report this operation with the SQLSTATE and server version."),
        "54023" => ("The generated query exceeds PostgreSQL's function argument limit.", "Open a query selecting fewer columns and report this table's column count. This is a client query limitation, not proof of a damaged restore."),
        "0A000" => ("This operation is not supported by PostgreSQL for this object.", "Check the relation type and server version. Try a direct SQL query and report the failing Opaline operation."),
        "42601" => ("PostgreSQL rejected the query syntax.", "If this occurred while browsing a table, report the operation and server version. Do not repeat the restore based on this error alone."),
        "22P02" | "22007" | "22008" | "22003" => ("A value is incompatible with the column type or allowed range.", "Check edited values and active filters against the column's type, including enum labels and date formats."),
        "23502" => ("A required column has no value.", "Supply a non-NULL value or use the column's default, then review the pending changes."),
        "23505" => ("A primary key or unique constraint would be violated.", "Use a unique value. If generated IDs conflict after restore, have the sequence checked before retrying."),
        "23503" => ("A foreign key constraint would be violated.", "Check that the referenced row exists and that no dependent rows prevent this change."),
        "23514" => ("A check constraint rejected a value.", "Review the named constraint in Structure and correct the pending values."),
        "22001" => ("A value is too long for its column.", "Check the column's maximum length and shorten the pending value before saving."),
        "42804" | "42846" => ("The requested value or conversion is incompatible with the column type.", "Review the column type and requested conversion in Structure or SQL before applying the change."),
        "2BP01" => ("Other database objects depend on this object.", "Inspect its dependencies before changing or deleting it. Do not enable cascading deletion without reviewing the affected objects."),
        "42P07" | "42710" | "42701" => ("A database object with this name already exists.", "Refresh the database structure and choose a different name, or edit the existing object."),
        "25006" => ("The database transaction is read-only.", "Check the connection's read-only setting and whether this server is a replica."),
        "55P03" => ("A required database lock could not be acquired.", "Check other active transactions or maintenance jobs, then retry after the lock is released."),
        "40P01" | "40001" => ("The transaction conflicted with another transaction.", "Reload current data and review pending changes before retrying. No automatic retry was attempted."),
        "57014" => ("PostgreSQL cancelled the operation or its statement timeout expired.", "Check active queries and locks. For a large table, reduce the page size or use a more selective filter."),
        "28P01" | "28000" => ("PostgreSQL rejected authentication.", "Check the connection credentials and server authentication rules, then reconnect."),
        "3D000" => ("The selected database does not exist.", "Check the database name in this connection profile and the restore destination."),
        "53100" => ("The database server has run out of disk space.", "Free space on the database server before retrying. Local free disk space alone will not resolve this."),
        "53200" | "53300" | "53400" => ("The database server has reached a resource limit.", "Check server memory, active connections and configured limits before retrying."),
        "57P01" | "57P02" | "57P03" => ("The database server is shutting down, recovering or unavailable.", "Wait for the server to become available, then reconnect. Verify any interrupted write before retrying."),
        "XX001" | "XX002" => ("PostgreSQL reported damaged data or an index.", "Ask the database administrator to inspect server logs and storage. Do not repeat writes or restore automatically."),
        _ if code.starts_with("08") => ("The database connection failed.", "Check the server and network, then reconnect. Verify any in-progress write before retrying it."),
        _ => ("PostgreSQL rejected the operation.", "Use the SQLSTATE below to inspect the server logs or report the issue. Server messages containing SQL or row values are not included in this diagnostic."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_failures_have_distinct_recovery_guidance() {
        for code in [
            "42501", "42P01", "42703", "42883", "54023", "22P02", "23505", "23503", "57014",
            "53100", "28P01", "08006",
        ] {
            let (reason, hint) = guidance(code);
            assert!(!reason.is_empty());
            assert!(!hint.is_empty());
            assert_ne!(reason, guidance("ZZ999").0);
        }
        assert!(guidance("42501").1.contains("privileges"));
        assert!(guidance("42703").1.contains("sorting"));
        assert!(guidance("23505").1.contains("sequence"));
        assert!(guidance("ZZ999").1.contains("Server messages"));
    }
}
