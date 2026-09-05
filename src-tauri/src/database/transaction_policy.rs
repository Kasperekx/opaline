use super::models::{QueryErrorKind, QueryExecutionError};
use sqlparser::{
    dialect::PostgreSqlDialect,
    tokenizer::{Token, Tokenizer},
};

// Tokenize rather than splitting on ';': comments, quoted identifiers and dollar-quoted
// function bodies must not change statement boundaries. PostgreSQL remains the parser.
pub(crate) fn validate(sql: &str) -> Result<(), QueryExecutionError> {
    let invalid = || {
        QueryExecutionError::simple(QueryErrorKind::Validation,
        "Each Run uses an application-owned transaction. BEGIN, COMMIT, ROLLBACK, SAVEPOINT and prepared transactions are not supported across runs. Remove transaction controls from this script.")
    };
    if sql.len() > 1_000_000 {
        return Err(invalid());
    }
    let tokens = Tokenizer::new(&PostgreSqlDialect {}, sql)
        .tokenize()
        .map_err(|_| invalid())?;
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
            assert!(validate(sql).is_err(), "{sql}");
        }
        for sql in [
            "select '; COMMIT'; select 2",
            "select $$; COMMIT$$",
            "-- BEGIN\nselect 1",
            "select \"COMMIT\" from x",
            "CREATE FUNCTION x() RETURNS void AS $$ BEGIN RETURN; END $$ LANGUAGE plpgsql",
        ] {
            assert!(validate(sql).is_ok(), "{sql}");
        }
    }
}
