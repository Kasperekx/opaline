use super::models::{QueryErrorKind, QueryExecutionError};
use sqlparser::{ast::Statement, dialect::PostgreSqlDialect, parser::Parser};

// Fail closed for unsupported syntax. PostgreSQL READ ONLY enforces writes inside CTEs/functions.
// Transaction and session controls are never passed through, so SQL cannot escape our boundary.
pub(crate) fn validate(sql: &str) -> Result<(), QueryExecutionError> {
    let invalid = || {
        QueryExecutionError::simple(QueryErrorKind::Validation,
        "Read-only connections accept SELECT / WITH, SHOW and EXPLAIN of queries only. Transaction controls and writes are blocked.")
    };
    if sql.len() > 1_000_000 {
        return Err(invalid());
    }
    let statements = Parser::parse_sql(&PostgreSqlDialect {}, sql).map_err(|_| invalid())?;
    if statements.is_empty() || !statements.iter().all(allowed) {
        return Err(invalid());
    }
    Ok(())
}

fn allowed(statement: &Statement) -> bool {
    match statement {
        Statement::Query(_) | Statement::ShowVariable { .. } => true,
        Statement::Explain { statement, .. } => allowed(statement),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_only_rejects_session_and_transaction_escape() {
        for sql in [
            "COMMIT; DELETE FROM users",
            "SET transaction_read_only = off",
            "BEGIN READ WRITE",
            "DO $$ BEGIN DELETE FROM users; END $$",
            "EXPLAIN ANALYZE DELETE FROM users",
            "COPY users FROM STDIN",
            "RESET ALL",
            "DISCARD ALL",
        ] {
            assert!(validate(sql).is_err(), "{sql}");
        }
        for sql in [
            "SELECT 1",
            "WITH x AS (SELECT 2) SELECT * FROM x",
            "SHOW transaction_read_only",
            "EXPLAIN SELECT 1",
        ] {
            assert!(validate(sql).is_ok(), "{sql}");
        }
    }
}
