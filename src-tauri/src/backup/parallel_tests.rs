use super::{files, models::*, operations, tools::PgTools, PreparedRestore};
use crate::{
    database::{client::DatabaseClient, models::ConnectionConfig, models::SslMode, postgres},
    profiles::models::{Environment, SessionInfo},
    state::AppState,
};
use std::{path::PathBuf, time::Duration};
use tokio::{sync::watch, time::timeout};
use tokio_postgres::Client;

fn config(database: &str, port: u16) -> ConnectionConfig {
    ConnectionConfig {
        name: "Disposable parallel restore test".into(),
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

struct Fixture {
    port: u16,
    admin: DatabaseClient,
    state: AppState,
    source_id: String,
    source_db: String,
    target_db: String,
    tools: PgTools,
    archive: PathBuf,
    _directory: tempfile::TempDir,
}

impl Fixture {
    async fn new(fail: bool) -> Self {
        let port = std::env::var("OPALINE_TEST_POSTGRES_PORT")
            .expect("A disposable PostgreSQL server is required")
            .parse::<u16>()
            .unwrap();
        assert_ne!(port, 5432, "Never use the default/user PostgreSQL port");
        let tools = PgTools::detect(&PathBuf::from(
            std::env::var("OPALINE_TEST_PG_TOOLS").expect("Prepared clients are required"),
        ))
        .await
        .unwrap();
        let (admin, _) = postgres::connect(&config("postgres", port)).await.unwrap();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let source_db = format!("opaline_parallel_source_{suffix}");
        let target_db = format!("opaline_parallel_target_{suffix}");
        admin
            .batch_execute(&format!("CREATE DATABASE {source_db}"))
            .await
            .unwrap();
        let (client, connection) = postgres::connect(&config(&source_db, port)).await.unwrap();
        // This trusted synthetic CHECK runs normally during fixture insertion.
        // Only a restore worker sleeps/errors while copying the archived rows.
        let action = if fail {
            "RAISE EXCEPTION 'parallel restore fixture failure' USING ERRCODE = '23514';"
        } else {
            "PERFORM pg_sleep(30);"
        };
        client
            .batch_execute(&format!(
                "CREATE FUNCTION public.restore_guard(value integer) RETURNS boolean
                 LANGUAGE plpgsql AS $$ BEGIN
                   IF current_setting('application_name') LIKE 'Opaline job %' THEN
                     {action}
                   END IF;
                   RETURN value > 0;
                 END $$;"
            ))
            .await
            .unwrap();
        for table in 0..4 {
            client
                .batch_execute(&format!(
                    "CREATE TABLE public.items_{table}(
                       id integer PRIMARY KEY, payload text NOT NULL,
                       CHECK (public.restore_guard(id)));
                     INSERT INTO public.items_{table}
                     SELECT n, 'table{table}/value' || n FROM generate_series(1, 3) AS n;"
                ))
                .await
                .unwrap();
        }
        let state = AppState::default();
        let source_id = uuid::Uuid::new_v4().to_string();
        state
            .add_with_password(
                client,
                SessionInfo {
                    id: source_id.clone(),
                    profile_id: source_id.clone(),
                    workspace_id: "disposable-parallel".into(),
                    environment: Environment::Local,
                    read_only: false,
                    connection,
                },
                None,
                Some("opaline_test".into()),
            )
            .await
            .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let archive = directory.path().join("parallel.dump");
        let (source, guard) = state.maintenance(&source_id, false).await.unwrap();
        let (_sender, cancel) = watch::channel(false);
        operations::dump(
            &source,
            &tools,
            config(&source_db, port),
            DumpInput {
                tools_id: None,
                path: archive.to_string_lossy().into_owned(),
                format: DumpFormat::Custom,
                content: DumpContent::All,
                schemas: vec![],
                tables: vec![],
                password: None,
            },
            cancel,
            |_| {},
        )
        .await
        .unwrap();
        drop(guard);
        Self {
            port,
            admin,
            state,
            source_id,
            source_db,
            target_db,
            tools,
            archive,
            _directory: directory,
        }
    }

    fn input(&self, jobs: u8) -> RestoreInput {
        RestoreInput {
            jobs,
            confirm_parallel: true,
            new_database: Some(self.target_db.clone()),
            confirm_create: true,
            prepared_id: "parallel-test".into(),
            password: None,
            trusted_file: true,
            confirm_database: self.target_db.clone(),
            confirm_production: false,
            allow_nonempty: false,
            clean: false,
            confirm_clean: false,
            preserve_ownership: false,
        }
    }

    fn prepared(&self) -> PreparedRestore {
        PreparedRestore {
            session_id: self.source_id.clone(),
            tools: self.tools.clone(),
            file: files::snapshot(&self.archive).unwrap(),
        }
    }

    async fn verify_retained_target_and_unchanged_source(
        &self,
        source: &Client,
    ) -> Result<(), String> {
        let retained: bool = self
            .admin
            .query_one(
                "SELECT EXISTS(SELECT FROM pg_database WHERE datname=$1)",
                &[&self.target_db],
            )
            .await
            .map_err(|error| error.to_string())?
            .get(0);
        if !retained {
            return Err("The incomplete parallel target was automatically dropped".into());
        }
        for table in 0..4 {
            let rows = source
                .query(
                    &format!("SELECT id, payload FROM public.items_{table} ORDER BY id"),
                    &[],
                )
                .await
                .map_err(|error| error.to_string())?;
            let actual: Vec<(i32, String)> =
                rows.iter().map(|row| (row.get(0), row.get(1))).collect();
            let expected: Vec<_> = (1..=3)
                .map(|id| (id, format!("table{table}/value{id}")))
                .collect();
            if actual != expected {
                return Err(format!(
                    "Parallel restore changed source table items_{table}"
                ));
            }
        }
        Ok(())
    }

    async fn cleanup(self) {
        self.state.disconnect(&self.source_id).await.unwrap();
        // Only these freshly generated fixture names are ever removed. Retention
        // and connection-lifecycle assertions run before this test-only cleanup.
        for database in [&self.target_db, &self.source_db] {
            self.admin
                .batch_execute(&format!("DROP DATABASE IF EXISTS {database} WITH (FORCE)"))
                .await
                .unwrap();
        }
    }
}

async fn wait_for_workers(fixture: &Fixture, jobs: u8) -> Result<String, String> {
    timeout(Duration::from_secs(15), async {
        loop {
            let row = fixture
                .admin
                .query_opt(
                    "SELECT application_name FROM pg_stat_activity
                 WHERE datname=$1 AND application_name LIKE 'Opaline job %'
                   AND backend_type='client backend'
                 GROUP BY application_name
                 HAVING count(*) FILTER (WHERE state='active' AND wait_event='PgSleep') >= $2",
                    &[&fixture.target_db, &i64::from(jobs)],
                )
                .await
                .map_err(|error| error.to_string())?;
            if let Some(row) = row {
                return Ok(row.get(0));
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .map_err(|_| format!("Did not observe {jobs} independently blocked restore workers"))?
}

async fn wait_for_no_workers(fixture: &Fixture) -> Result<(), String> {
    timeout(Duration::from_secs(5), async {
        loop {
            let count: i64 = fixture
                .admin
                .query_one(
                    "SELECT count(*) FROM pg_stat_activity
                 WHERE datname=$1 AND application_name LIKE 'Opaline job %'",
                    &[&fixture.target_db],
                )
                .await
                .map_err(|error| error.to_string())?
                .get(0);
            if count == 0 {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .map_err(|_| "Parallel restore left job connections alive".to_string())?
}

async fn sentinel(database: &str, port: u16) -> Result<DatabaseClient, String> {
    let (client, _) = postgres::connect(&config(database, port)).await?;
    client
        .query_one(
            "SELECT set_config('application_name', $1, false)",
            &[&format!(
                "opaline_parallel_sentinel_{}",
                uuid::Uuid::new_v4().simple()
            )],
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(client)
}

async fn cancel_with_active_sentinel(
    fixture: &Fixture,
    jobs: u8,
    sender: &watch::Sender<bool>,
) -> Result<(), String> {
    wait_for_workers(fixture, jobs).await?;
    let sentinel = sentinel(&fixture.target_db, fixture.port).await?;
    let pid: i32 = sentinel
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .map_err(|error| error.to_string())?
        .get(0);
    let cancel = async {
        timeout(Duration::from_secs(5), async {
            loop {
                let sleeping: bool = fixture.admin.query_one(
                    "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep')",
                    &[&pid],
                ).await.map_err(|error| error.to_string())?.get(0);
                if sleeping {
                    sender.send(true).map_err(|error| error.to_string())?;
                    return Ok::<_, String>(());
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .map_err(|_| "The unrelated sentinel did not start its query".to_string())?
    };
    let (sentinel_result, cancelled) =
        tokio::join!(sentinel.batch_execute("SELECT pg_sleep(1)"), cancel,);
    cancelled?;
    sentinel_result.map_err(|error| format!("Unrelated sentinel query was cancelled: {error}"))?;
    sentinel
        .query_one("SELECT 1", &[])
        .await
        .map_err(|error| format!("Unrelated sentinel connection was terminated: {error}"))?;
    Ok(())
}

fn incomplete_error(result: Result<JobResult, String>) -> Result<String, String> {
    let error = result
        .err()
        .ok_or("Parallel restore unexpectedly reported success")?;
    if !error.contains("not confirmed complete") || !error.contains("has been kept") {
        return Err(format!(
            "Failure did not describe the retained incomplete target: {error}"
        ));
    }
    Ok(error)
}

async fn cancellation_case(fixture: &Fixture, jobs: u8) -> Result<(), String> {
    let (source, _guard) = fixture.state.maintenance(&fixture.source_id, true).await?;
    let (sender, cancel) = watch::channel(false);
    let monitor = async {
        let result = cancel_with_active_sentinel(fixture, jobs, &sender).await;
        // A failed observation must also stop the fixture instead of leaving a
        // 30-second-per-row restore running; the test still reports that failure.
        let _ = sender.send(true);
        result
    };
    let restore = timeout(
        Duration::from_secs(35),
        operations::restore(
            &source,
            fixture.prepared(),
            config(&fixture.source_db, fixture.port),
            fixture.input(jobs),
            cancel,
            |_| {},
        ),
    );
    let (result, observed) = tokio::join!(restore, monitor);
    observed?;
    let error = incomplete_error(result.map_err(|_| "Parallel cancellation did not finish")?)?;
    if !error.contains("cancelled") {
        return Err(format!("Expected cancellation, received: {error}"));
    }
    wait_for_no_workers(fixture).await?;
    fixture
        .verify_retained_target_and_unchanged_source(&source.client)
        .await
}

async fn error_case(fixture: &Fixture, jobs: u8) -> Result<(), String> {
    let (source, _guard) = fixture.state.maintenance(&fixture.source_id, true).await?;
    let sentinel = sentinel(&fixture.source_db, fixture.port).await?;
    let (_sender, cancel) = watch::channel(false);
    let restore = timeout(
        Duration::from_secs(15),
        operations::restore(
            &source,
            fixture.prepared(),
            config(&fixture.source_db, fixture.port),
            fixture.input(jobs),
            cancel,
            |_| {},
        ),
    );
    let (result, sentinel_result) =
        tokio::join!(restore, sentinel.batch_execute("SELECT pg_sleep(1)"),);
    let error = incomplete_error(result.map_err(|_| "Parallel error did not finish")?)?;
    if error.contains("cancelled") {
        return Err(format!(
            "Expected a restore error, received cancellation: {error}"
        ));
    }
    sentinel_result.map_err(|error| format!("Unrelated sentinel query failed: {error}"))?;
    sentinel
        .query_one("SELECT 1", &[])
        .await
        .map_err(|error| format!("Unrelated sentinel connection was terminated: {error}"))?;
    wait_for_no_workers(fixture).await?;
    fixture
        .verify_retained_target_and_unchanged_source(&source.client)
        .await
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and prepared clients; do not run during benchmarks"]
async fn parallel_restore_cancellation_reaps_workers_and_preserves_unrelated_connections() {
    for jobs in [2, 4] {
        let fixture = Fixture::new(false).await;
        let result = cancellation_case(&fixture, jobs).await;
        fixture.cleanup().await;
        result.unwrap_or_else(|error| panic!("{jobs}-worker cancellation: {error}"));
    }
}

#[tokio::test]
#[ignore = "Requires a disposable PostgreSQL server and prepared clients; do not run during benchmarks"]
async fn parallel_restore_error_retains_incomplete_target_and_unchanged_source() {
    for jobs in [2, 4] {
        let fixture = Fixture::new(true).await;
        let result = error_case(&fixture, jobs).await;
        fixture.cleanup().await;
        result.unwrap_or_else(|error| panic!("{jobs}-worker failure: {error}"));
    }
}
