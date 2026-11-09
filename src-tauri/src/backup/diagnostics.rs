// PostgreSQL stderr can include SQL, row values, paths and credentials. Only
// return fixed messages: matching a diagnostic never makes its text safe to show.
const UNKNOWN: &str = "The PostgreSQL tool reported an error. Check the backup's compatibility, required objects and database privileges. Raw tool output is hidden because it can contain data or credentials.";
const CONNECTION_FAILED: &str = "The database connection failed. Check the host and port, server availability, network access and the server's connection rules or limits.";

pub(super) fn diagnostic(bytes: &[u8]) -> &'static str {
    let text = String::from_utf8_lossy(bytes).to_lowercase();
    let mut connection_failed = false;
    for line in text.lines() {
        let line = line.trim_start();
        if [
            "detail:",
            "context:",
            "hint:",
            "command was:",
            "statement:",
            "line ",
        ]
        .iter()
        .any(|prefix| line.starts_with(prefix))
        {
            continue;
        }
        // libpq reports each resolved address and prefixes only the first, so a
        // refused address (often ::1) can precede the failure that explains it.
        let next_address = connection_failed && line.starts_with("connection to server");
        // Tools run with LC_ALL=C. Ignore verbose progress and SQL continuation
        // lines; recognize server ERROR/FATAL and the clients' error prefixes.
        if !next_address
            && ![
                "error:",
                "fatal:",
                "pg_dump: error:",
                "pg_restore: error:",
                "psql:",
            ]
            .iter()
            .any(|prefix| line.starts_with(prefix))
        {
            continue;
        }
        if connection_failed && !next_address {
            break;
        }
        let message = if next_address {
            line
        } else {
            let Some((_, message)) = line
                .split_once("error:")
                .or_else(|| line.split_once("fatal:"))
            else {
                continue;
            };
            message
        };
        match classify(message) {
            Some(CONNECTION_FAILED) => connection_failed = true,
            Some(message) => return message,
            None => {}
        }
    }
    if connection_failed {
        CONNECTION_FAILED
    } else {
        UNKNOWN
    }
}

fn classify(message: &str) -> Option<&'static str> {
    let has = |phrases: &[&str]| phrases.iter().any(|phrase| message.contains(phrase));
    Some(
        if has(&[
            "password authentication failed",
            "no password supplied",
            "authentication failed",
        ]) {
            "Authentication failed. Check the connection password or saved credential, then reconnect."
        } else if has(&[
            "certificate verify failed",
            "certificate verification failed",
            "server certificate",
            "root certificate",
            "ssl certificate",
            "ssl error",
            "server does not support ssl",
            "tls handshake",
        ]) {
            "TLS verification failed. Check the connection hostname, trusted CA and server TLS configuration. Keep certificate verification enabled."
        } else if has(&[
            "server version mismatch",
            "unsupported version",
            "version of pg_dump",
            "version of pg_restore",
        ]) {
            "The PostgreSQL client is incompatible with the server or backup version. Select supported matching client tools; cross-major restores need a separate migration workflow."
        } else if has(&["text format dump", "please use psql"]) {
            "This file is a plain SQL dump. Use the SQL restore workflow instead of custom-archive restore."
        } else if has(&[
            "not appear to be a valid archive",
            "did not find magic string",
            "unrecognized file format",
            "end of file",
            "corrupt",
            "could not uncompress",
            "could not decompress",
        ]) {
            "The backup archive is invalid or incomplete. Select a complete PostgreSQL backup and verify that it can be read."
        } else if has(&["no space left", "disk quota exceeded"]) {
            "Not enough disk space. Check free space and quotas on both the backup destination and database server."
        } else if has(&[
            "input/output error",
            "read-only file system",
            "could not fsync",
            "could not flush",
        ]) {
            "A storage read or write failed. Check filesystem permissions, storage health and available space on the backup destination and database server."
        } else if has(&[
            "permission denied",
            "must be owner",
            "must be superuser",
            "only superuser",
            "insufficient privilege",
        ]) {
            "Permission denied. Check the connection role's database privileges and permissions on the backup file or destination."
        } else if message.contains("role ") && message.contains("does not exist") {
            "A required database role is missing. Have an administrator provide the role, or restore without preserving ownership and privileges."
        } else if has(&[
            "extension control file",
            "could not load library",
            "could not access file",
        ]) || (message.contains("extension ")
            && has(&[
                "not available",
                "not installed",
                "does not exist",
                "no installation script",
            ]))
        {
            "A required PostgreSQL extension or library is unavailable. Install a compatible version on the target server before restoring."
        } else if message.contains("already exists") {
            "An archive object already exists in the target. Choose a new empty database or review the existing-object restore options."
        } else if has(&[
            "connection refused",
            "connection timed out",
            "timeout expired",
            "could not translate host name",
            "could not resolve hostname",
            "no route to host",
            "network is unreachable",
            "server closed the connection",
            "connection reset",
            "ssl syscall error",
            "no pg_hba.conf entry",
            "too many clients",
            "remaining connection slots",
        ]) || (message.contains("connection to server") && message.contains("failed"))
        {
            CONNECTION_FAILED
        } else if message.contains("does not exist") {
            "A required database object is missing. Check the target database and use a complete dump that includes the required schema and dependencies."
        } else if message.contains("violates") && message.contains("constraint") {
            "Restored data violates a database constraint. Check that the dump's schema and data agree, and review any existing target rows."
        } else {
            return None;
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actionable_messages_cover_common_backup_and_restore_failures() {
        for (stderr, advice) in [
            ("pg_dump: error: connection failed: FATAL: password authentication failed for user \"private-role\"", "saved credential"),
            ("pg_restore: error: connection failed: server certificate for \"private-host\" does not match host name", "trusted CA"),
            ("pg_dump: error: aborting because of server version mismatch", "matching client tools"),
            ("pg_restore: error: unsupported version (1.99) in file header", "matching client tools"),
            ("pg_restore: error: input file appears to be a text format dump. Please use psql.", "SQL restore workflow"),
            ("pg_restore: error: input file does not appear to be a valid archive", "invalid or incomplete"),
            ("pg_restore: error: could not read from input file: end of file", "invalid or incomplete"),
            ("pg_dump: error: could not write to output file: No space left on device", "free space and quotas"),
            ("pg_restore: error: could not write: Disk quota exceeded", "free space and quotas"),
            ("pg_dump: error: could not fsync file: Input/output error", "storage health"),
            ("pg_restore: error: could not execute query: ERROR: must be owner of table private_table", "database privileges"),
            ("pg_restore: error: could not execute query: ERROR: permission denied to create extension \"private_extension\"", "database privileges"),
            ("pg_restore: error: could not execute query: ERROR: role \"private-role\" does not exist", "without preserving ownership"),
            ("pg_restore: error: could not execute query: ERROR: role \"certificate\" does not exist", "without preserving ownership"),
            ("pg_restore: error: could not execute query: ERROR: extension \"private_extension\" is not available", "compatible version"),
            ("pg_restore: error: could not open extension control file \"/private/path\": No such file or directory", "compatible version"),
            ("pg_restore: error: could not execute query: ERROR: relation \"private_table\" already exists", "new empty database"),
            ("pg_dump: error: connection to server at \"private-host\", port 5432 failed: Connection refused", "host and port"),
            ("pg_dump: error: could not translate host name \"private-host\" to address", "host and port"),
            ("pg_restore: error: could not execute query: ERROR: relation \"private_table\" does not exist", "schema and dependencies"),
            ("psql:/private/backup.sql:21: ERROR: new row for relation \"private_table\" violates check constraint \"private_check\"", "database constraint"),
        ] {
            let result = diagnostic(stderr.as_bytes());
            assert!(result.contains(advice), "Wrong advice for {stderr}: {result}");
            assert!(!result.contains("private"), "Diagnostic leaked source details");
        }
    }

    #[test]
    fn a_later_address_explains_a_refused_connection() {
        let attempt = |cause: &str| {
            format!(
                "psql: error: connection to server at \"private-host\" (::1), port 5432 failed: Connection refused\n\
                 \tIs the server running on that host and accepting TCP/IP connections?\n\
                 connection to server at \"private-host\" (127.0.0.1), port 5432 failed: {cause}\n"
            )
        };
        assert!(
            diagnostic(attempt("SSL error: certificate verify failed").as_bytes())
                .starts_with("TLS verification failed.")
        );
        assert!(diagnostic(
            attempt("FATAL:  password authentication failed for user \"private-role\"").as_bytes()
        )
        .starts_with("Authentication failed."));
        assert_eq!(
            diagnostic(attempt("Connection refused").as_bytes()),
            CONNECTION_FAILED
        );
    }

    #[test]
    fn only_address_attempts_refine_a_connection_failure() {
        let output = b"pg_restore: error: connection to server at \"private-host\", port 5432 failed: Connection refused\n\
                       pg_restore: error: could not execute query: ERROR: permission denied\n";
        assert_eq!(diagnostic(output), CONNECTION_FAILED);
    }

    #[test]
    fn diagnostic_never_returns_raw_sql_rows_credentials_or_paths() {
        for error in [
            "ERROR: role \"private-role\" does not exist",
            "ERROR: extension \"private_extension\" is not available",
            "ERROR: duplicate key value violates unique constraint \"private_constraint\"",
            "ERROR: unknown fixture failure",
        ] {
            let stderr = format!(
                "pg_restore: error: could not execute query: {error}\n\
                 DETAIL: Key (password)=(SECRET_VALUE) already exists.\n\
                 CONTEXT: COPY private_table, line 3: customer@example.com\n\
                 Command was: INSERT INTO private_table VALUES ('SECRET_VALUE');\n\
                 /private/backup.sql postgres://private-role:SECRET_VALUE@private-host/db\n"
            );
            let result = diagnostic(stderr.as_bytes());
            for private in [
                "private",
                "SECRET_VALUE",
                "customer@example.com",
                "INSERT",
                "postgres://",
                "Key (",
            ] {
                assert!(!result.contains(private), "Leaked {private}");
            }
        }
    }

    #[test]
    fn verbose_progress_and_error_like_details_do_not_override_the_failure() {
        let output = b"pg_restore: creating TABLE private_table\n\
                       pg_restore: error: unknown fixture failure\n\
                       DETAIL: ERROR: role private_role does not exist\n\
                       CONTEXT: ERROR: permission denied\n\
                       Command was: SELECT 'ERROR: no space left';\n\
                       SELECT 'ERROR: no space left';\n";
        assert_eq!(diagnostic(output), UNKNOWN);
        assert_eq!(diagnostic(b"\xff\xfe unrecognized output"), UNKNOWN);
        assert_eq!(diagnostic(b""), UNKNOWN);
    }
}
