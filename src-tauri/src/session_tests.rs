use crate::{
    commands::query,
    database::{
        models::{ConnectionConfig, SslMode},
        postgres,
    },
    profiles::models::{Environment, SessionInfo},
    state::AppState,
};

async fn session(state: &AppState, name: &str, read_only: bool) -> String {
    let config = ConnectionConfig {
        name: name.into(),
        host: "127.0.0.1".into(),
        port: std::env::var("OPALINE_TEST_POSTGRES_PORT")
            .unwrap()
            .parse()
            .unwrap(),
        database: "postgres".into(),
        username: "postgres".into(),
        password: "opaline_test".into(),
        ssl_mode: SslMode::Disable,
        ca_path: None,
        read_only,
    };
    assert_ne!(config.port, 5432, "Only a disposable server is allowed");
    let (client, connection) = postgres::connect(&config).await.unwrap();
    let info = SessionInfo {
        id: name.into(),
        profile_id: name.into(),
        workspace_id: "test".into(),
        environment: Environment::Local,
        read_only,
        connection,
    };
    state.add(client, info, None).await.unwrap();
    name.into()
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn explicit_autocommit_supports_maintenance_and_never_replays_or_batches_writes() {
    use crate::database::transaction_policy::ExecutionMode::Autocommit;
    let state = AppState::default();
    let writer = session(&state, "autocommit-writer", false).await;
    let observer = session(&state, "autocommit-observer", false).await;
    let reader = session(&state, "autocommit-reader", true).await;
    let table = format!("ac_{}", uuid::Uuid::new_v4().simple());
    query::execute(
        &state,
        &writer,
        &format!("CREATE TABLE {table}(id int)"),
        None,
        None,
    )
    .await
    .unwrap();
    for sql in [
        format!("INSERT INTO {table} VALUES (1)"),
        format!("VACUUM {table}"),
    ] {
        query::execute_with_mode(&state, &writer, &sql, None, None, Autocommit)
            .await
            .unwrap();
    }
    let count = query::execute(
        &state,
        &observer,
        &format!("SELECT count(*) FROM {table}"),
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(count.result_sets[0].rows[0][0].as_deref(), Some("1"));
    assert!(query::execute_with_mode(
        &state,
        &writer,
        &format!("INSERT INTO {table} VALUES (2); SELECT 1"),
        None,
        None,
        Autocommit
    )
    .await
    .is_err());
    assert!(
        query::execute_with_mode(&state, &reader, "VACUUM", None, None, Autocommit)
            .await
            .is_err()
    );
    // Validation failures preserve the session; server errors in autocommit do not.
    query::execute(&state, &reader, "SELECT 1", None, None)
        .await
        .unwrap();
    let database = format!("ac_db_{}", uuid::Uuid::new_v4().simple());
    query::execute_with_mode(
        &state,
        &writer,
        &format!("CREATE DATABASE {database}"),
        None,
        None,
        Autocommit,
    )
    .await
    .unwrap();
    query::execute_with_mode(
        &state,
        &writer,
        &format!("DROP DATABASE {database}"),
        None,
        None,
        Autocommit,
    )
    .await
    .unwrap();
    let error = query::execute_with_mode(&state, &writer, "SELECT 1/0", None, None, Autocommit)
        .await
        .unwrap_err();
    assert!(error.message.contains("no application rollback"));
    assert!(state.client(&writer).await.is_err());
    let count = query::execute(
        &state,
        &observer,
        &format!("SELECT count(*) FROM {table}"),
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(count.result_sets[0].rows[0][0].as_deref(), Some("1"));
    query::execute(
        &state,
        &observer,
        &format!("DROP TABLE {table}"),
        None,
        None,
    )
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn dropping_a_running_query_invalidates_the_session_and_rolls_back_atomic_work() {
    let state = AppState::default();
    let writer = session(&state, "dropped-writer", false).await;
    let observer = session(&state, "dropped-observer", false).await;
    let table = format!("drop_{}", uuid::Uuid::new_v4().simple());
    query::execute(
        &state,
        &writer,
        &format!("CREATE TABLE {table}(id int)"),
        None,
        None,
    )
    .await
    .unwrap();
    let sql = format!("INSERT INTO {table} VALUES (1); SELECT pg_sleep(30)");
    assert!(tokio::time::timeout(
        std::time::Duration::from_millis(250),
        query::execute(&state, &writer, &sql, None, None)
    )
    .await
    .is_err());
    assert!(state.client(&writer).await.is_err());
    let count = query::execute(
        &state,
        &observer,
        &format!("SELECT count(*) FROM {table}"),
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(count.result_sets[0].rows[0][0].as_deref(), Some("0"));
    query::execute(
        &state,
        &observer,
        &format!("DROP TABLE {table}"),
        None,
        None,
    )
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn multiple_sessions_are_isolated_and_cancellation_is_scoped() {
    let state = AppState::default();
    let a = session(&state, "A", false).await;
    let b = session(&state, "B", false).await;
    query::execute(&state, &a, "SET application_name='session-a'", None, None)
        .await
        .unwrap();
    let result = query::execute(&state, &b, "SHOW application_name", None, None)
        .await
        .unwrap();
    assert_eq!(result.result_sets[0].rows[0][0].as_deref(), Some("Opaline"));
    let first = query::execute(&state, &a, "SELECT pg_sleep(5)", None, None);
    let second = async {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        assert!(state.disconnect(&a).await.is_err());
        assert!(state.cancel(&a).await.unwrap());
        query::execute(&state, &b, "SELECT 42", None, None)
            .await
            .unwrap()
    };
    let (cancelled, other) = tokio::join!(first, second);
    assert!(cancelled.is_err());
    assert_eq!(other.result_sets[0].rows[0][0].as_deref(), Some("42"));
    state.disconnect(&a).await.unwrap();
    assert!(query::execute(&state, &a, "SELECT 1", None, None)
        .await
        .is_err());
    assert!(query::execute(&state, &b, "SELECT 1", None, None)
        .await
        .is_ok());
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn read_only_blocks_sql_bypasses_and_cleans_up_errors_and_timeouts() {
    let state = AppState::default();
    let writer = session(&state, "writer", false).await;
    let reader = session(&state, "reader", true).await;
    query::execute(
        &state,
        &writer,
        "CREATE TABLE opaline_readonly_test (id int); INSERT INTO opaline_readonly_test VALUES (1)",
        None,
        None,
    )
    .await
    .unwrap();
    for sql in [
        "DELETE FROM opaline_readonly_test",
        "COMMIT; DELETE FROM opaline_readonly_test",
        "SET default_transaction_read_only = off",
        "WITH removed AS (DELETE FROM opaline_readonly_test RETURNING *) SELECT * FROM removed",
        "SELECT set_config('transaction_read_only', 'off', false); DELETE FROM opaline_readonly_test",
        "SELECT set_config('transaction_read_only', 'off', false)",
        "EXPLAIN ANALYZE DELETE FROM opaline_readonly_test",
    ] {
        assert!(query::execute(&state, &reader, sql, None, None).await.is_err(), "{sql}");
        assert!(query::execute(&state, &reader, "SELECT 1", None, None).await.is_ok(), "cleanup after {sql}");
    }
    assert!(state.begin_operation(&reader, true).await.is_err());
    // Session-level settings executed in SELECT are rolled back as well.
    query::execute(
        &state,
        &reader,
        "SELECT set_config('default_transaction_read_only', 'off', false)",
        None,
        None,
    )
    .await
    .unwrap();
    let result = query::execute(
        &state,
        &reader,
        "SHOW default_transaction_read_only",
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.result_sets[0].rows[0][0].as_deref(), Some("on"));
    assert!(
        query::execute(&state, &reader, "SELECT pg_sleep(5)", None, Some(1000))
            .await
            .is_err()
    );
    let result = query::execute(
        &state,
        &reader,
        "SELECT count(*) FROM opaline_readonly_test",
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.result_sets[0].rows[0][0].as_deref(), Some("1"));
    query::execute(
        &state,
        &writer,
        "DROP TABLE opaline_readonly_test",
        None,
        None,
    )
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn runs_are_atomic_and_never_leave_a_transaction_for_table_operations() {
    let state = AppState::default();
    let id = session(&state, "atomic", false).await;
    query::execute(
        &state,
        &id,
        "CREATE TEMP TABLE p0_atomic (id int)",
        None,
        None,
    )
    .await
    .unwrap();
    for sql in [
        "BEGIN",
        "SELECT 1; COMMIT",
        "PREPARE TRANSACTION 'x'",
        "ROLLBACK",
    ] {
        assert!(query::execute(&state, &id, sql, None, None).await.is_err());
    }
    assert!(query::execute(
        &state,
        &id,
        "INSERT INTO p0_atomic VALUES (1); SELECT 1/0",
        None,
        None
    )
    .await
    .is_err());
    let count = query::execute(&state, &id, "SELECT count(*) FROM p0_atomic", None, None)
        .await
        .unwrap();
    assert_eq!(count.result_sets[0].rows[0][0].as_deref(), Some("0"));
    query::execute(&state, &id, "INSERT INTO p0_atomic VALUES (2)", None, None)
        .await
        .unwrap();
    let lease = state.client(&id).await.unwrap();
    // A fresh transaction is legal after a run; the table operation sees committed data.
    lease.batch_execute("BEGIN").await.unwrap();
    assert_eq!(
        lease
            .query_one("SELECT count(*) FROM p0_atomic", &[])
            .await
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    lease.batch_execute("ROLLBACK").await.unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn loss_is_reported_and_reconnect_replaces_only_the_lost_session() {
    let state = AppState::default();
    let a = session(&state, "loss-a", false).await;
    let b = session(&state, "loss-b", false).await;
    let pid: i32 = {
        let lease = state.client(&a).await.unwrap();
        lease
            .query_one("SELECT pg_backend_pid()", &[])
            .await
            .unwrap()
            .get(0)
    };
    query::execute(
        &state,
        &b,
        &format!("SELECT pg_terminate_backend({pid})"),
        None,
        None,
    )
    .await
    .unwrap();
    assert!(query::execute(&state, &a, "SELECT 1", None, None)
        .await
        .is_err());
    assert_eq!(state.reconnect_id(&a).await.unwrap(), Some(a.clone()));
    assert!(state.reconnect_id(&b).await.is_err());
    assert!(serde_json::to_string(&state.statuses().await)
        .unwrap()
        .contains("lost"));
    let replacement = session(&state, "loss-a", false).await;
    assert_eq!(replacement, a);
    assert_eq!(state.list().await.len(), 2);
    assert!(query::execute(&state, &a, "SELECT 1", None, None)
        .await
        .is_ok());
    assert!(query::execute(&state, &b, "SELECT 1", None, None)
        .await
        .is_ok());
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn bounds_retained_data_and_preserves_text_precision() {
    let state = AppState::default();
    let id = session(&state, "budgets", false).await;
    let large = query::execute(
        &state,
        &id,
        "SELECT repeat('ł', 1048576) FROM generate_series(1, 8)",
        None,
        None,
    )
    .await
    .unwrap();
    assert!(large.result_sets[0].truncated);
    assert!(large.result_sets[0].rows.len() < 8);
    let values = query::execute(&state, &id, "SELECT 9223372036854775807::bigint, 12345678901234567890.123456789::numeric, NULL::text, 'Zażółć 🦀'::text, ARRAY[1,2]", None, None).await.unwrap();
    assert_eq!(
        values.result_sets[0].rows[0],
        vec![
            Some("9223372036854775807".into()),
            Some("12345678901234567890.123456789".into()),
            None,
            Some("Zażółć 🦀".into()),
            Some("{1,2}".into())
        ]
    );
    assert!(
        query::execute(&state, &id, &"SELECT 1;".repeat(33), None, None)
            .await
            .is_err()
    );
    assert!(query::execute(&state, &id, "SELECT 1", None, None)
        .await
        .is_ok());
}
