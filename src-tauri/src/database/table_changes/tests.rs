use super::*;
use crate::database::{
    models::{ConnectionConfig, SslMode, TablePageRequest},
    postgres,
};

fn request(changes: serde_json::Value) -> TableChangesRequest {
    serde_json::from_value(serde_json::json!({"schema":"public","table":"test","changes":changes}))
        .unwrap()
}

#[test]
fn validates_change_set_ids_keys_versions_and_size() {
    assert!(validate_request(&request(serde_json::json!([]))).is_err());
    let update = serde_json::json!({"kind":"update","id":"a","key":[{"column":"id","value":"1"}],"rowVersion":"2","changes":[{"column":"name","value":"next"}]});
    assert!(validate_request(&request(serde_json::json!([update.clone()]))).is_ok());
    assert!(validate_request(&request(serde_json::json!([
        update.clone(),
        update.clone()
    ])))
    .is_err());
    let mut duplicate = update.clone();
    duplicate["id"] = serde_json::json!("b");
    assert!(validate_request(&request(serde_json::json!([update.clone(), duplicate]))).is_err());
    let mut bad_version = update;
    bad_version["rowVersion"] = serde_json::json!("not-an-xid");
    assert!(validate_request(&request(serde_json::json!([bad_version]))).is_err());
    let large = serde_json::json!({"kind":"insert","id":"a","values":[{"column":"value","value":"x".repeat(MAX_BYTES+1)}]});
    assert!(validate_request(&request(serde_json::json!([large]))).is_err());
}

async fn connect() -> DatabaseClient {
    assert_ne!(
        std::env::var("OPALINE_TEST_POSTGRES_PORT").as_deref(),
        Ok("5432"),
        "Only disposable servers are allowed"
    );
    postgres::connect(&ConnectionConfig {
        name: "Isolated inline-editing test".into(),
        host: "127.0.0.1".into(),
        port: std::env::var("OPALINE_TEST_POSTGRES_PORT")
            .expect("Use a disposable test server")
            .parse()
            .unwrap(),
        database: "postgres".into(),
        username: "postgres".into(),
        password: "opaline_test".into(),
        ssl_mode: SslMode::Disable,
        ca_path: None,
        read_only: false,
    })
    .await
    .unwrap()
    .0
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn rls_permissions_triggers_and_schema_changes_preserve_atomic_edits() {
    let client = connect().await;
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let schema = format!("guard_{suffix}");
    let role = format!("limited_{suffix}");
    // All objects and the NOLOGIN role belong only to this disposable test server.
    client.batch_execute(&format!("CREATE SCHEMA {schema}; CREATE ROLE {role} NOLOGIN; CREATE TABLE {schema}.inline_changes(id int PRIMARY KEY, name text NOT NULL, note text); INSERT INTO {schema}.inline_changes VALUES (1,'Ada',NULL),(2,'Grace',NULL); GRANT USAGE ON SCHEMA {schema} TO {role}; GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.inline_changes TO {role}; ALTER TABLE {schema}.inline_changes ENABLE ROW LEVEL SECURITY; CREATE POLICY test_policy ON {schema}.inline_changes USING (true) WITH CHECK (name <> 'blocked'); SET ROLE {role};")).await.unwrap();
    let before = page(&client, &schema).await;
    let input = TableChangesRequest {
        schema: schema.clone(),
        table: "inline_changes".into(),
        changes: vec![
            update(
                "first",
                "1",
                before.rows[0].row_version.as_deref().unwrap(),
                "Allowed",
            ),
            update(
                "second",
                "2",
                before.rows[1].row_version.as_deref().unwrap(),
                "blocked",
            ),
        ],
    };
    assert_eq!(
        apply_changes(&client, &input, &AtomicBool::new(false), None)
            .await
            .unwrap_err()
            .kind,
        "rejected"
    );
    assert_eq!(
        page(&client, &schema).await.rows[0].values[1].as_deref(),
        Some("Ada")
    );
    client
        .batch_execute(&format!(
            "RESET ROLE; REVOKE UPDATE ON {schema}.inline_changes FROM {role}; SET ROLE {role}"
        ))
        .await
        .unwrap();
    assert!(
        apply_changes(&client, &input, &AtomicBool::new(false), None)
            .await
            .is_err()
    );
    assert_eq!(
        page(&client, &schema).await.rows[0].values[1].as_deref(),
        Some("Ada")
    );
    client.batch_execute(&format!("RESET ROLE; CREATE FUNCTION {schema}.normalize_name() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.name := upper(NEW.name); RETURN NEW; END $$; CREATE TRIGGER normalize_name BEFORE UPDATE ON {schema}.inline_changes FOR EACH ROW EXECUTE FUNCTION {schema}.normalize_name();")).await.unwrap();
    let mut input = input;
    input.changes.truncate(1);
    let saved = apply_changes(&client, &input, &AtomicBool::new(false), None)
        .await
        .unwrap();
    assert_eq!(
        saved.rows[0].row.as_ref().unwrap().values[1].as_deref(),
        Some("ALLOWED")
    );
    let latest = page(&client, &schema).await;
    input.changes = vec![
        update("first", "1", latest.rows[0].row_version.as_deref().unwrap(), "Must not save"),
        serde_json::from_value(serde_json::json!({"kind":"update","id":"second","key":[{"column":"id","value":"2"}],"rowVersion":latest.rows[1].row_version,"changes":[{"column":"note","value":"stale column"}]})).unwrap(),
    ];
    client
        .batch_execute(&format!(
            "ALTER TABLE {schema}.inline_changes DROP COLUMN note"
        ))
        .await
        .unwrap();
    assert!(
        apply_changes(&client, &input, &AtomicBool::new(false), None)
            .await
            .is_err()
    );
    assert_eq!(
        page(&client, &schema).await.rows[0].values[1].as_deref(),
        Some("ALLOWED")
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE; DROP ROLE {role}"))
        .await
        .unwrap();
}
async fn setup(client: &DatabaseClient) -> String {
    client.batch_execute("CREATE TEMP TABLE inline_changes (id integer PRIMARY KEY, name text NOT NULL UNIQUE, note text DEFAULT 'default note'); INSERT INTO inline_changes VALUES (1,'Ada',NULL),(2,'Grace',NULL);").await.unwrap();
    client
        .query_one(
            "SELECT nspname::text FROM pg_namespace WHERE oid=pg_my_temp_schema()",
            &[],
        )
        .await
        .unwrap()
        .get(0)
}
async fn page(client: &DatabaseClient, schema: &str) -> super::super::models::TableDataPage {
    table_data::fetch_page(
        client,
        &TablePageRequest {
            schema: schema.into(),
            table: "inline_changes".into(),
            page: 0,
            page_size: 50,
            filter: None,
            sort: None,
        },
    )
    .await
    .unwrap()
}
fn update(id: &str, key: &str, version: &str, name: &str) -> TableChange {
    serde_json::from_value(serde_json::json!({"kind":"update","id":id,"key":[{"column":"id","value":key}],"rowVersion":version,"changes":[{"column":"name","value":name}]})).unwrap()
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn mixed_changes_commit_together_and_return_server_values() {
    let client = connect().await;
    let schema = setup(&client).await;
    let before = page(&client, &schema).await;
    let version = before.rows[0].row_version.as_deref().unwrap();
    let input=TableChangesRequest{schema:schema.clone(),table:"inline_changes".into(),changes:vec![
      update("edit","1",version,"Ada edited"),
      serde_json::from_value(serde_json::json!({"kind":"delete","id":"delete","key":[{"column":"id","value":"2"}],"rowVersion":before.rows[1].row_version})).unwrap(),
      serde_json::from_value(serde_json::json!({"kind":"insert","id":"new","values":[{"column":"id","value":"3"},{"column":"name","value":"New"}]})).unwrap(),
    ]};
    let result = apply_changes(&client, &input, &AtomicBool::new(false), None)
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 3);
    assert!(result.rows[1].row.is_none());
    assert_eq!(
        result.rows[2].row.as_ref().unwrap().values[2].as_deref(),
        Some("default note")
    );
    assert_eq!(page(&client, &schema).await.rows.len(), 2);
    assert_ne!(
        result.rows[0]
            .row
            .as_ref()
            .unwrap()
            .row_version
            .as_deref()
            .unwrap(),
        version
    );
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn a_failed_or_stale_row_rolls_back_every_change() {
    let client = connect().await;
    let schema = setup(&client).await;
    let before = page(&client, &schema).await;
    let input = TableChangesRequest {
        schema: schema.clone(),
        table: "inline_changes".into(),
        changes: vec![
            update(
                "first",
                "1",
                before.rows[0].row_version.as_deref().unwrap(),
                "Renamed",
            ),
            update(
                "second",
                "2",
                before.rows[1].row_version.as_deref().unwrap(),
                "Renamed",
            ),
        ],
    };
    let error = apply_changes(&client, &input, &AtomicBool::new(false), None)
        .await
        .unwrap_err();
    assert_eq!(error.kind, "rejected");
    assert_eq!(error.row_id.as_deref(), Some("second"));
    assert_eq!(
        page(&client, &schema).await.rows[0].values[1].as_deref(),
        Some("Ada")
    );
    client
        .batch_execute("UPDATE inline_changes SET name='Concurrent' WHERE id=2")
        .await
        .unwrap();
    assert!(
        apply_changes(&client, &input, &AtomicBool::new(false), None)
            .await
            .is_err()
    );
    assert_eq!(
        page(&client, &schema).await.rows[0].values[1].as_deref(),
        Some("Ada")
    );
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn deferred_constraint_failure_is_not_reported_as_success() {
    let client = connect().await;
    let schema = setup(&client).await;
    client.batch_execute("ALTER TABLE inline_changes ADD CONSTRAINT inline_deferred UNIQUE(note) DEFERRABLE INITIALLY DEFERRED").await.unwrap();
    let input = TableChangesRequest {
        schema,
        table: "inline_changes".into(),
        changes: (3..5)
            .map(|id| TableChange::Insert {
                id: id.to_string(),
                values: vec![
                    TableCellValue {
                        column: "id".into(),
                        value: Some(id.to_string()),
                    },
                    TableCellValue {
                        column: "name".into(),
                        value: Some(format!("New {id}")),
                    },
                ],
            })
            .collect(),
    };
    assert_eq!(
        apply_changes(&client, &input, &AtomicBool::new(false), None)
            .await
            .unwrap_err()
            .kind,
        "rejected"
    );
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM inline_changes", &[])
            .await
            .unwrap()
            .get::<_, i64>(0),
        2
    );
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn comparison_reads_current_row_without_replacing_the_original_version() {
    let client = connect().await;
    let schema = setup(&client).await;
    let before = page(&client, &schema).await;
    client
        .batch_execute("UPDATE inline_changes SET name='Concurrent' WHERE id=1")
        .await
        .unwrap();
    let input = table_data::TableRowRequest {
        schema: schema.clone(),
        table: "inline_changes".into(),
        key: vec![TableCellValue {
            column: "id".into(),
            value: Some("1".into()),
        }],
    };
    let now = table_data::fetch_row(&client, &input).await.unwrap();
    assert_eq!(now.columns, vec!["id", "name", "note"]);
    assert_eq!(
        now.row.as_ref().unwrap().values[1].as_deref(),
        Some("Concurrent")
    );
    assert_ne!(now.row.unwrap().row_version, before.rows[0].row_version);
    client
        .batch_execute("DELETE FROM inline_changes WHERE id=1")
        .await
        .unwrap();
    assert!(table_data::fetch_row(&client, &input)
        .await
        .unwrap()
        .row
        .is_none());
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn dropping_a_save_future_aborts_its_transport_and_rolls_back() {
    let client = connect().await;
    let observer = connect().await;
    client.batch_execute("CREATE TABLE inline_cancel_test (id integer PRIMARY KEY, name text); INSERT INTO inline_cancel_test VALUES (1,'Ada'),(2,'Grace'); CREATE FUNCTION inline_cancel_sleep() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = 2 THEN PERFORM pg_sleep(10); END IF; RETURN NEW; END $$; CREATE TRIGGER inline_slow BEFORE UPDATE ON inline_cancel_test FOR EACH ROW EXECUTE FUNCTION inline_cancel_sleep();").await.unwrap();
    let version: String = client
        .query_one("SELECT xmin::text FROM inline_cancel_test WHERE id=1", &[])
        .await
        .unwrap()
        .get(0);
    let pid: i32 = client
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .unwrap()
        .get(0);
    let input = TableChangesRequest {
        schema: "public".into(),
        table: "inline_cancel_test".into(),
        changes: vec![
            update("first", "1", &version, "Edited"),
            update("second", "2", &version, "Slow"),
        ],
    };
    let committing = AtomicBool::new(false);
    let reached_second_update = async {
        loop {
            let sleeping: bool = observer.query_one("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep')", &[&pid]).await.unwrap().get(0);
            if sleeping {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    };
    tokio::time::timeout(Duration::from_secs(5), async {
        tokio::select! {
            result = apply_changes(&client, &input, &committing, None) => panic!("Save unexpectedly completed: {result:?}"),
            _ = reached_second_update => {}
        }
    }).await.unwrap();
    assert!(!committing.load(Ordering::SeqCst));
    // The dropped transaction must not keep server locks while its cancelled query sleeps.
    observer
        .batch_execute(
            "SET statement_timeout='2s'; UPDATE inline_cancel_test SET name=name WHERE id=1",
        )
        .await
        .unwrap();
    assert_eq!(
        observer
            .query_one("SELECT name FROM inline_cancel_test WHERE id=1", &[])
            .await
            .unwrap()
            .get::<_, String>(0),
        "Ada"
    );
    observer
        .batch_execute("DROP TABLE inline_cancel_test; DROP FUNCTION inline_cancel_sleep()")
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server"]
async fn loss_of_transport_during_commit_reports_unknown() {
    let client = connect().await;
    let observer = connect().await;
    let schema = setup(&client).await;
    client.batch_execute("CREATE FUNCTION pg_temp.inline_commit_sleep() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(10); RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER inline_commit_wait AFTER UPDATE ON inline_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.inline_commit_sleep();").await.unwrap();
    let before = page(&client, &schema).await;
    let pid: i32 = client
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .unwrap()
        .get(0);
    let input = TableChangesRequest {
        schema,
        table: "inline_changes".into(),
        changes: vec![update(
            "edit",
            "1",
            before.rows[0].row_version.as_deref().unwrap(),
            "Edited",
        )],
    };
    let committing = AtomicBool::new(false);
    let terminate_during_commit = async {
        loop {
            let sleeping: bool = observer.query_one("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep' AND query='COMMIT')", &[&pid]).await.unwrap().get(0);
            if sleeping {
                observer
                    .query_one("SELECT pg_terminate_backend($1)", &[&pid])
                    .await
                    .unwrap();
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    };
    // A fatal backend error is still a database response, not a guaranteed rollback acknowledgement.
    let (result, ()) = tokio::time::timeout(Duration::from_secs(5), async {
        tokio::join!(
            apply_changes(&client, &input, &committing, None),
            terminate_during_commit
        )
    })
    .await
    .unwrap();
    assert_eq!(result.unwrap_err().kind, "unknown");
}
