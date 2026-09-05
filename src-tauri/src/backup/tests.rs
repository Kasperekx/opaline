use super::{files, models::*, operations, process::ProcessCredentials, tools, PreparedRestore};
use crate::{
    database::{
        models::{ConnectionConfig, ConnectionInfo, SslMode},
        postgres,
    },
    profiles::models::{Environment, SessionInfo},
    state::AppState,
};
use std::path::Path;
use tokio::sync::watch;

fn config(database: &str, port: u16) -> ConnectionConfig {
    ConnectionConfig {
        name: "Disposable P1".into(),
        host: "127.0.0.1".into(),
        port,
        database: database.into(),
        username: "postgres".into(),
        password: "opaline_test".into(),
        ssl_mode: SslMode::Disable,
        ca_path: None,
        read_only: false,
    }
}
fn info() -> SessionInfo {
    SessionInfo {
        id: "test".into(),
        profile_id: "test".into(),
        workspace_id: "test".into(),
        environment: Environment::Production,
        read_only: false,
        connection: ConnectionInfo {
            name: "Test".into(),
            host: "localhost".into(),
            port: 5432,
            database: "target".into(),
            username: "test".into(),
            server_version: "17".into(),
        },
    }
}
fn restore_input() -> RestoreInput {
    RestoreInput {
        new_database: None,
        confirm_create: false,
        prepared_id: "test".into(),
        password: None,
        trusted_file: true,
        confirm_database: "target".into(),
        confirm_production: true,
        allow_nonempty: false,
        clean: false,
        confirm_clean: false,
        preserve_ownership: false,
    }
}

#[test]
fn restore_requires_explicit_target_and_independent_consents() {
    let mut info = info();
    let mut input = restore_input();
    assert!(operations::validate_restore(&info, &input).is_ok());
    input.clean = true;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_clean = true;
    input.allow_nonempty = true;
    assert!(operations::validate_restore(&info, &input).is_ok());
    input.confirm_production = false;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_production = true;
    input.trusted_file = false;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.trusted_file = true;
    input.confirm_database = "other".into();
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_database = "target".into();
    info.read_only = true;
    assert!(operations::validate_restore(&info, &input).is_err());
}

#[test]
fn new_database_requires_its_own_name_and_creation_consent() {
    let mut info = info();
    let mut input = restore_input();
    input.new_database = Some("new target".into());
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_create = true;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_database = "new target".into();
    assert!(operations::validate_restore(&info, &input).is_ok());
    input.allow_nonempty = true;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.allow_nonempty = false;
    input.clean = true;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.clean = false;
    input.confirm_production = false;
    assert!(operations::validate_restore(&info, &input).is_err());
    input.confirm_production = true;
    info.read_only = true;
    assert!(operations::validate_restore(&info, &input).is_err());
}
#[test]
fn process_credentials_are_not_in_arguments_and_tls_never_downgrades() {
    let mut config = config("strange' db=other", 55432);
    config.password = "private:password\\with quotes'".into();
    config.ssl_mode = SslMode::Require;
    config.ca_path = Some("/tmp/trusted ca.pem".into());
    let credentials = ProcessCredentials::create(&config, true).unwrap();
    let command = credentials.command(Path::new("/trusted/pg_dump"));
    let args = command
        .as_std()
        .get_args()
        .map(|s| s.to_string_lossy())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(!args.contains(&config.password));
    assert!(args.contains("sslmode=verify-full"));
    assert!(!args.contains("sslcertmode="));
    assert!(args.contains("sslcert='"));
    assert!(args.contains("sslkey='"));
    assert!(args.contains("dbname='strange\\' db=other'"));
    assert!(!command
        .as_std()
        .get_envs()
        .any(|(key, _)| key == "PGPASSWORD"));
    let path = command
        .as_std()
        .get_envs()
        .find(|(key, _)| *key == "PGPASSFILE")
        .unwrap()
        .1
        .unwrap();
    let path = Path::new(path).to_path_buf();
    assert!(std::fs::read_to_string(&path)
        .unwrap()
        .contains("private\\:password\\\\"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o077,
            0
        );
    }
    drop(credentials);
    assert!(!path.exists());
}
#[test]
fn restriction_framing_preserves_sql_literals_and_copy_data() {
    let text = "-- PostgreSQL database dump\n\\restrict oldKey\nSELECT E'\\\\connect other';\nCOPY x FROM stdin;\n\\\\unrestrict oldKey\n\\.\n-- done\n\\unrestrict oldKey\n";
    let output = files::restricted_sql(text, "freshKey").unwrap();
    assert!(output.starts_with("\\restrict freshKey\n"));
    assert!(output.contains("SELECT E'\\\\connect other';"));
    assert!(output.contains("\\\\unrestrict oldKey\n\\."));
    assert!(!output.contains("\n\\unrestrict oldKey\n"));
    assert!(files::restricted_sql("\\restrict a\nselect 1;\n\\unrestrict b\n", "c").is_err());
}
#[test]
fn cancelled_inspection_does_not_publish_a_snapshot() {
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), b"PGDMPexample").unwrap();
    assert!(files::snapshot_with_cancel(file.path(), || true)
        .err()
        .unwrap()
        .contains("cancelled"));
}
#[test]
fn dump_filters_are_exact_identifiers_not_shell_or_wildcard_expansion() {
    let input = DumpInput {
        tools_id: Some("t".into()),
        path: "file".into(),
        format: DumpFormat::Custom,
        content: DumpContent::All,
        schemas: vec![],
        tables: vec![TableName {
            schema: "public".into(),
            table: "odd\";$(touch nope)*".into(),
        }],
        password: None,
    };
    let args = operations::dump_arguments(&input).unwrap();
    assert!(args.contains(&"\"public\".\"odd\"\";$(touch nope)*\"".into()));
    assert!(operations::check_dump_version("; Dumped from database version: 18.6", 17).is_err());
    assert!(tools::parse_version("not postgres", "pg_dump").is_err());
}

#[tokio::test]
#[ignore = "Requires disposable TLS server, OPALINE_TEST_CA_PATH and patched local tools"]
async fn cli_tls_accepts_explicit_ca_and_rejects_untrusted_or_wrong_hostname() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .unwrap()
        .parse()
        .unwrap();
    assert_ne!(port, 5432);
    let tools = tools::PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").unwrap()))
        .await
        .unwrap();
    for case in 0..3 {
        let mut current = config("postgres", port);
        current.host = "localhost".into();
        current.ssl_mode = SslMode::Require;
        current.ca_path = Some(std::env::var("OPALINE_TEST_CA_PATH").unwrap());
        if case == 1 {
            current.host = "127.0.0.1".into();
        }
        if case == 2 {
            current.ca_path = None;
        }
        let credentials = ProcessCredentials::create(&current, true).unwrap();
        let mut command = credentials.command(&tools.psql);
        command.args([
            "-X",
            "--set",
            "ON_ERROR_STOP=on",
            "--command",
            "SELECT 1 / ssl::int FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
        ]);
        let (_sender, cancel) = watch::channel(false);
        let result = super::process::run(command, cancel, |_| {}, "TLS test", async {}).await;
        if case == 0 {
            result.unwrap();
        } else {
            assert!(result.unwrap_err().contains("TLS verification"));
        }
    }
}

async fn session(state: &AppState, db: &str, port: u16) -> String {
    let (client, connection) = postgres::connect(&config(db, port)).await.unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    state
        .add_with_password(
            client,
            SessionInfo {
                id: id.clone(),
                profile_id: id.clone(),
                workspace_id: "disposable".into(),
                environment: Environment::Local,
                read_only: false,
                connection,
            },
            None,
            Some(config(db, port).password),
        )
        .await
        .unwrap();
    id
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and prepared clients"]
async fn dump_restore_round_trip_and_failures_on_disposable_databases() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .expect("Disposable server required")
        .parse()
        .unwrap();
    assert_ne!(
        port, 5432,
        "Never run this test on the default/user database port"
    );
    let (admin, _) = postgres::connect(&config("postgres", port)).await.unwrap();
    let tools = if let Ok(root) = std::env::var("OPALINE_TEST_BUNDLED_ROOT") {
        let major = operations::server_major(&admin).await.unwrap();
        let tools = super::managed::from_root(root.into(), major).await.unwrap();
        assert_eq!(tools.info.source, "bundled");
        assert_eq!(tools.info.major, major);
        tools
    } else {
        tools::PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").unwrap()))
            .await
            .unwrap()
    };
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let source_db = format!("opaline_source_{suffix}");
    let target_db = format!("opaline_target_{suffix}");
    admin
        .batch_execute(&format!("CREATE DATABASE {source_db}"))
        .await
        .unwrap();
    admin
        .batch_execute(&format!("CREATE DATABASE {target_db}"))
        .await
        .unwrap();
    let state = AppState::default();
    let source_id = session(&state, &source_db, port).await;
    {
        let client = state.client(&source_id).await.unwrap();
        client.batch_execute("CREATE TABLE records(id bigserial PRIMARY KEY, amount numeric(30,9), payload text); CREATE INDEX records_payload ON records(payload); INSERT INTO records(amount,payload) VALUES (99999999999999999999.123456789, E'line\\nUnicode żółć'), (NULL, ''), (42, NULL);").await.unwrap();
    }
    let dir = tempfile::tempdir().unwrap();
    for format in [DumpFormat::Custom, DumpFormat::Sql] {
        let path = dir.path().join(if format == DumpFormat::Custom {
            "archive.not-an-extension"
        } else {
            "plain.dump"
        });
        let (source, guard) = state.maintenance(&source_id, false).await.unwrap();
        assert_eq!(source.password(), Some("opaline_test"));
        assert!(state.client(&source_id).await.is_err());
        let (_sender, cancel) = watch::channel(false);
        let input = DumpInput {
            tools_id: None,
            path: path.to_string_lossy().into(),
            format,
            content: DumpContent::All,
            schemas: vec![],
            tables: vec![],
            password: None,
        };
        let result = operations::dump(
            &source,
            &tools,
            config(&source_db, port),
            input,
            cancel,
            |_| {},
        )
        .await
        .unwrap();
        assert!(result.bytes > 0);
        drop(guard);
        // Restore into a freshly created database, keeping the source connection
        // and its existing data intact. Exercise libpq and SQL identifier quoting.
        let new_db = format!("new \"ż {}", uuid::Uuid::new_v4().simple());
        let (source, guard) = state.maintenance(&source_id, true).await.unwrap();
        for attempt in 0..2 {
            let mut input = restore_input();
            input.new_database = Some(new_db.clone());
            input.confirm_database = new_db.clone();
            input.confirm_create = true;
            let prepared = PreparedRestore {
                session_id: source_id.clone(),
                tools: tools.clone(),
                file: files::snapshot(&path).unwrap(),
            };
            let (_sender, cancel) = watch::channel(false);
            let result = operations::restore(
                &source,
                prepared,
                config(&source_db, port),
                input,
                cancel,
                |_| {},
            )
            .await;
            if attempt == 0 {
                assert!(result
                    .unwrap()
                    .message
                    .contains("created and restore completed"));
            } else {
                assert!(result.unwrap_err().contains("already exist"));
            }
            let (created, _) = postgres::connect(&config(&new_db, port)).await.unwrap();
            assert_eq!(
                created
                    .query_one("SELECT count(*) FROM records", &[])
                    .await
                    .unwrap()
                    .get::<_, i64>(0),
                3
            );
            assert_eq!(
                created
                    .query_one("SELECT last_value FROM records_id_seq", &[])
                    .await
                    .unwrap()
                    .get::<_, i64>(0),
                3
            );
            assert_eq!(
                source
                    .client
                    .query_one("SELECT count(*) FROM records", &[])
                    .await
                    .unwrap()
                    .get::<_, i64>(0),
                3
            );
            created.abort();
        }
        drop(guard);
        admin
            .batch_execute(&format!(
                "DROP DATABASE {} WITH (FORCE)",
                crate::database::table_data::quote_identifier(&new_db)
            ))
            .await
            .unwrap();
        let file = files::snapshot(&path).unwrap();
        assert_eq!(file.format, format);
        let id = session(&state, &target_db, port).await;
        let (target, guard) = state.maintenance(&id, true).await.unwrap();
        let mut input = restore_input();
        input.confirm_database = target_db.clone();
        input.confirm_production = false;
        let prepared = PreparedRestore {
            session_id: id.clone(),
            tools: tools.clone(),
            file,
        };
        let (_sender, cancel) = watch::channel(false);
        operations::restore(
            &target,
            prepared,
            config(&target_db, port),
            input,
            cancel,
            |_| {},
        )
        .await
        .unwrap();
        let rows = target
            .client
            .query(
                "SELECT id::text, amount::text, payload FROM records ORDER BY id",
                &[],
            )
            .await
            .unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(
            rows[0].get::<_, String>(1),
            "99999999999999999999.123456789"
        );
        assert_eq!(rows[0].get::<_, String>(2), "line\nUnicode żółć");
        assert!(rows[1].get::<_, Option<String>>(1).is_none());
        assert_eq!(rows[1].get::<_, String>(2), "");
        assert!(rows[2].get::<_, Option<String>>(2).is_none());
        assert_eq!(
            target
                .client
                .query_one("SELECT nextval('records_id_seq')", &[])
                .await
                .unwrap()
                .get::<_, i64>(0),
            4
        );
        assert_eq!(
            target
                .client
                .query_one(
                    "SELECT count(*) FROM pg_indexes WHERE tablename='records'",
                    &[]
                )
                .await
                .unwrap()
                .get::<_, i64>(0),
            2
        );
        // Default restore refuses an existing database, without touching it.
        let prepared = PreparedRestore {
            session_id: id.clone(),
            tools: tools.clone(),
            file: files::snapshot(&path).unwrap(),
        };
        let mut input = restore_input();
        input.confirm_database = target_db.clone();
        let (_sender, cancel) = watch::channel(false);
        assert!(operations::restore(
            &target,
            prepared,
            config(&target_db, port),
            input,
            cancel,
            |_| {}
        )
        .await
        .unwrap_err()
        .contains("not empty"));
        if format == DumpFormat::Custom {
            target
                .client
                .batch_execute("UPDATE records SET payload = 'changed after backup'")
                .await
                .unwrap();
            let prepared = PreparedRestore {
                session_id: id.clone(),
                tools: tools.clone(),
                file: files::snapshot(&path).unwrap(),
            };
            let mut input = restore_input();
            input.confirm_database = target_db.clone();
            input.allow_nonempty = true;
            input.clean = true;
            input.confirm_clean = true;
            let (_sender, cancel) = watch::channel(false);
            operations::restore(
                &target,
                prepared,
                config(&target_db, port),
                input,
                cancel,
                |_| {},
            )
            .await
            .unwrap();
            assert_eq!(
                target
                    .client
                    .query_one("SELECT payload FROM records WHERE id = 1", &[])
                    .await
                    .unwrap()
                    .get::<_, String>(0),
                "line\nUnicode żółć"
            );
        }
        target
            .client
            .batch_execute("DROP TABLE records")
            .await
            .unwrap();
        drop(guard);
        state.disconnect(&id).await.unwrap();
    }
    state.disconnect(&source_id).await.unwrap();
    admin
        .batch_execute(&format!("DROP DATABASE IF EXISTS {source_db}"))
        .await
        .unwrap();
    admin
        .batch_execute(&format!("DROP DATABASE IF EXISTS {target_db}"))
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and prepared clients"]
async fn failed_new_database_restore_keeps_target_and_precancel_creates_nothing() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .unwrap()
        .parse()
        .unwrap();
    assert_ne!(port, 5432);
    let tools = tools::PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").unwrap()))
        .await
        .unwrap();
    let state = AppState::default();
    let id = session(&state, "postgres", port).await;
    let (source, _guard) = state.maintenance(&id, true).await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("failure.sql");
    std::fs::write(&path, "CREATE TABLE must_rollback(id int); SELECT 1/0;\n").unwrap();
    for cancelled in [true, false] {
        let name = format!("failed_{}", uuid::Uuid::new_v4().simple());
        let mut input = restore_input();
        input.new_database = Some(name.clone());
        input.confirm_database = name.clone();
        input.confirm_create = true;
        let prepared = PreparedRestore {
            session_id: id.clone(),
            tools: tools.clone(),
            file: files::snapshot(&path).unwrap(),
        };
        let (_sender, cancel) = watch::channel(cancelled);
        let error = operations::restore(
            &source,
            prepared,
            config("postgres", port),
            input,
            cancel,
            |_| {},
        )
        .await
        .unwrap_err();
        let exists = source
            .client
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)",
                &[&name],
            )
            .await
            .unwrap()
            .get::<_, bool>(0);
        assert_eq!(exists, !cancelled);
        if cancelled {
            assert!(error.contains("Nothing was created"));
        } else {
            assert!(error.contains("has been kept"));
            let (created, _) = postgres::connect(&config(&name, port)).await.unwrap();
            assert!(created
                .query_one("SELECT to_regclass('public.must_rollback')::text", &[])
                .await
                .unwrap()
                .get::<_, Option<String>>(0)
                .is_none());
            created.abort();
            source
                .client
                .batch_execute(&format!("DROP DATABASE {name} WITH (FORCE)"))
                .await
                .unwrap();
        }
    }
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and patched local PostgreSQL tools"]
async fn failed_dump_preserves_file_and_cancel_reaps_client() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .unwrap()
        .parse()
        .unwrap();
    assert_ne!(port, 5432);
    let tools = tools::PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").unwrap()))
        .await
        .unwrap();
    let state = AppState::default();
    let id = session(&state, "postgres", port).await;
    let (session, guard) = state.maintenance(&id, false).await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("existing.dump");
    std::fs::write(&path, b"original backup").unwrap();
    let mut wrong = config("postgres", port);
    wrong.password = "definitely-wrong-test-secret".into();
    let input = DumpInput {
        tools_id: Some(tools.info.id.clone()),
        path: path.to_string_lossy().into(),
        format: DumpFormat::Custom,
        content: DumpContent::All,
        schemas: vec![],
        tables: vec![],
        password: None,
    };
    let (_sender, cancel) = watch::channel(false);
    let error = operations::dump(&session, &tools, wrong, input, cancel, |_| {})
        .await
        .unwrap_err();
    assert!(error.contains("Authentication"));
    assert!(!error.contains("definitely-wrong"));
    assert_eq!(std::fs::read(&path).unwrap(), b"original backup");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    let credentials = ProcessCredentials::create(&config("postgres", port), false).unwrap();
    let mut command = credentials.command(&tools.psql);
    command.args(["--no-psqlrc", "--command", "SELECT pg_sleep(30)"]);
    let (sender, cancel) = watch::channel(false);
    let run = super::process::run(
        command,
        cancel,
        |_| {},
        "Test cancellation",
        operations::cancel_tool(
            &session.client,
            &credentials.application_name,
            &session.info.connection.database,
        ),
    );
    let stop = async {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        sender.send(true).unwrap();
    };
    let (outcome, _) = tokio::join!(run, stop);
    assert!(outcome.unwrap_err().contains("cancelled"));
    for _ in 0..50 {
        let alive = session
            .client
            .query_one(
                "SELECT count(*) FROM pg_stat_activity WHERE application_name=$1",
                &[&credentials.application_name],
            )
            .await
            .unwrap()
            .get::<_, i64>(0);
        if alive == 0 {
            drop(guard);
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("Cancelled client left a server connection alive");
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and patched local PostgreSQL tools"]
async fn restricted_psql_blocks_shell_and_rolls_back_normal_sql_errors() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .unwrap()
        .parse()
        .unwrap();
    assert_ne!(port, 5432);
    let tools = tools::PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").unwrap()))
        .await
        .unwrap();
    let credentials = ProcessCredentials::create(&config("postgres", port), false).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let marker = dir.path().join("must-not-exist");
    let texts = [
        format!("\\! touch {}\nSELECT 1;", marker.display()),
        "CREATE TABLE opaline_p1_rollback(id integer); SELECT 1/0;".into(),
        "\\connect other_database\nSELECT 1;".into(),
    ];
    for (index, text) in texts.iter().enumerate() {
        let script = dir.path().join(format!("script{index}.sql"));
        std::fs::write(&script, text).unwrap();
        let prepared = files::snapshot(&script).unwrap();
        let mut command = credentials.command(&tools.psql);
        command
            .args([
                "--no-psqlrc",
                "--single-transaction",
                "--set=ON_ERROR_STOP=on",
                "--file",
            ])
            .arg(prepared.file.path());
        let (_sender, cancel) = watch::channel(false);
        assert!(
            super::process::run(command, cancel, |_| {}, "Security test", async {})
                .await
                .is_err()
        );
    }
    assert!(!marker.exists());
    let (client, _) = postgres::connect(&config("postgres", port)).await.unwrap();
    assert!(client
        .query_one(
            "SELECT to_regclass('public.opaline_p1_rollback')::text",
            &[]
        )
        .await
        .unwrap()
        .get::<_, Option<String>>(0)
        .is_none());
}
