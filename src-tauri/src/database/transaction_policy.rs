use super::models::{QueryErrorKind, QueryExecutionError};
use sqlparser::{
    dialect::PostgreSqlDialect,
    tokenizer::{Token, Tokenizer},
};

#[derive(Clone, Copy, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExecutionMode {
    #[default]
    Atomic,
    Autocommit,
}

pub(crate) fn validate_mode(sql: &str, mode: ExecutionMode) -> Result<(), QueryExecutionError> {
    let tokens = tokenize(sql)?;
    validate_transaction_controls(&tokens)?;
    if mode == ExecutionMode::Autocommit {
        let mut statements = 0;
        let mut inside = false;
        for token in tokens {
            match token {
                Token::Whitespace(_) => {}
                Token::SemiColon => inside = false,
                _ if !inside => {
                    statements += 1;
                    inside = true;
                }
                _ => {}
            }
        }
        if statements != 1 {
            return Err(QueryExecutionError::simple(QueryErrorKind::Validation,
                "Autocommit runs exactly one statement at a time. Select one statement, or switch to Atomic for a multi-statement script. Nothing was executed."));
        }
    }
    Ok(())
}

// Tokenize rather than splitting on ';': comments, quoted identifiers and dollar-quoted
// function bodies must not change statement boundaries. PostgreSQL remains the parser.
fn tokenize(sql: &str) -> Result<Vec<Token>, QueryExecutionError> {
    if sql.len() > 1_000_000 {
        return Err(QueryExecutionError::simple(
            QueryErrorKind::Validation,
            "SQL exceeds the 1 MB limit.",
        ));
    }
    Tokenizer::new(&PostgreSqlDialect {}, sql)
        .tokenize()
        .map_err(|_| {
            QueryExecutionError::simple(
                QueryErrorKind::Validation,
                "Cannot identify the SQL statement.",
            )
        })
}

fn validate_transaction_controls(tokens: &[Token]) -> Result<(), QueryExecutionError> {
    let invalid = || {
        QueryExecutionError::simple(QueryErrorKind::Validation,
        "Manual BEGIN, COMMIT, ROLLBACK, SAVEPOINT and prepared transactions are not supported across runs. Remove transaction controls; choose Atomic or explicit single-statement Autocommit.")
    };
    let mut start = true;
    for token in tokens {
        match token {
            Token::Whitespace(_) => {}
            Token::SemiColon => start = true,
            Token::Word(word) if start => {
                let keyword = word.value.to_ascii_uppercase();
                if word.quote_style.is_none()
                    && matches!(
                        keyword.as_str(),
                        "BEGIN"
                            | "START"
                            | "COMMIT"
                            | "END"
                            | "ROLLBACK"
                            | "ABORT"
                            | "SAVEPOINT"
                            | "RELEASE"
                            | "PREPARE"
                    )
                {
                    return Err(invalid());
                }
                start = false;
            }
            _ => start = false,
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn autocommit_requires_one_real_statement_without_transaction_controls() {
        for sql in [
            "VACUUM",
            "CREATE DATABASE sample",
            "SELECT ';'; -- comment",
            "SELECT $$a;b$$",
            "/* hi */ SELECT 1;;",
        ] {
            assert!(
                validate_mode(sql, ExecutionMode::Autocommit).is_ok(),
                "{sql}"
            );
        }
        for sql in [
            "",
            "-- comment",
            ";;",
            "SELECT 1; SELECT 2",
            "COMMIT",
            "BEGIN; VACUUM",
        ] {
            assert!(
                validate_mode(sql, ExecutionMode::Autocommit).is_err(),
                "{sql}"
            );
        }
        assert!(validate_mode("SELECT 1; SELECT 2", ExecutionMode::Atomic).is_ok());
    }
    #[test]
    fn blocks_transaction_escape_but_not_literals_or_comments() {
        for sql in [
            "BEGIN; SELECT 1",
            "select 1; /* guard */ COMMIT",
            "END AND CHAIN",
            "PREPARE TRANSACTION 'x'",
            "ROLLBACK TO SAVEPOINT x",
            "START TRANSACTION",
            "ABORT",
        ] {
            assert!(validate_mode(sql, ExecutionMode::Atomic).is_err(), "{sql}");
        }
        for sql in [
            "select '; COMMIT'; select 2",
            "select $$; COMMIT$$",
            "-- BEGIN\nselect 1",
            "select \"COMMIT\" from x",
            "CREATE FUNCTION x() RETURNS void AS $$ BEGIN RETURN; END $$ LANGUAGE plpgsql",
        ] {
            assert!(validate_mode(sql, ExecutionMode::Atomic).is_ok(), "{sql}");
        }
    }
}
