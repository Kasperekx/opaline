//! Opt-in local benchmark; never run against a user's normal PostgreSQL server.
//! OPALINE_TEST_POSTGRES_PORT (not 5432), OPALINE_TEST_PG_TOOLS or BUNDLED_ROOT.
//! Optional: OPALINE_BENCH_ROWS=50000, OPALINE_BENCH_REPEATS=3, OPALINE_BENCH_REPORT.
use super::{files, models::*, operations, process, tools::PgTools, PreparedRestore};
use crate::{
    database::{
        models::{ConnectionConfig, SslMode},
        postgres,
        table_data::quote_identifier,
    },
    profiles::models::{Environment, SessionInfo},
    state::{AppState, DatabaseSession},
};
use futures_util::FutureExt;
use serde_json::{json, Value};
use std::{io::Write, panic::AssertUnwindSafe, path::Path, time::Instant};
use tokio::sync::watch;
use tokio_postgres::Client;

type BenchResult<T> = Result<T, String>;

fn config(database: &str, port: u16) -> ConnectionConfig {
    ConnectionConfig {
        name: "Disposable restore benchmark".into(),
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

fn number(name: &str, default: usize, maximum: usize) -> usize {
    let value = std::env::var(name)
        .map(|value| value.parse::<usize>().expect("Numeric benchmark setting"))
        .unwrap_or(default);
    assert!(
        (1..=maximum).contains(&value),
        "{name} must be 1..={maximum}"
    );
    value
}

async fn sql(client: &Client, statement: &str) -> BenchResult<()> {
    client
        .batch_execute(statement)
        .await
        .map_err(|error| error.to_string())
}

async fn reserve_database(admin: &Client, owned: &mut Vec<String>) -> BenchResult<String> {
    let name = format!("opaline_bench_{}", uuid::Uuid::new_v4().simple());
    if admin
        .query_one(
            "SELECT EXISTS(SELECT FROM pg_database WHERE datname=$1)",
            &[&name],
        )
        .await
        .map_err(|error| error.to_string())?
        .get::<_, bool>(0)
    {
        return Err("Generated database name unexpectedly exists; refusing to touch it".into());
    }
    // An absent UUID name is reserved before CREATE: a network failure can leave
    // creation ambiguous. Cleanup never targets any pre-existing database.
    owned.push(name.clone());
    Ok(name)
}

async fn populate(client: &Client, rows: usize) -> BenchResult<()> {
    sql(client, "CREATE TABLE owners(id integer PRIMARY KEY, name text NOT NULL); INSERT INTO owners SELECT g, md5(g::text) FROM generate_series(1,32) g;").await?;
    for table in 0..6 {
        sql(client, &format!("CREATE TABLE records_{table} (
            id bigserial PRIMARY KEY, owner_id integer NOT NULL REFERENCES owners(id),
            amount numeric(24,6), label text NOT NULL, optional_note text, payload jsonb NOT NULL);
            INSERT INTO records_{table}(owner_id,amount,label,optional_note,payload)
            SELECT 1 + g % 32, CASE WHEN g % 13 = 0 THEN NULL ELSE g::numeric * 12345.6789 END,
              md5('{table}a' || g::text) || md5('{table}b' || g::text) || md5('{table}c' || g::text) || md5('{table}d' || g::text),
              CASE WHEN g % 7 = 0 THEN NULL WHEN g % 11 = 0 THEN '' ELSE 'Unicode żółć ' || g END,
              jsonb_build_object('id',g,'hash',md5('{table}payload' || g::text),'active',g % 2 = 0,'values',jsonb_build_array(g,g*2,NULL))
            FROM generate_series(1,{rows}) g;
            CREATE INDEX records_{table}_owner_idx ON records_{table}(owner_id);
            CREATE INDEX records_{table}_label_idx ON records_{table}(label);")).await?;
    }
    sql(client, "ANALYZE").await
}

// Canonical JSON preserves NULL, numeric precision and embedded text; fixed-width row
// digests are concatenated in primary-key order. This is an integrity check, not a MAC.
async fn fingerprint(client: &Client, expected_rows: usize) -> BenchResult<Value> {
    let mut data = Vec::new();
    for table in
        std::iter::once("owners".to_string()).chain((0..6).map(|index| format!("records_{index}")))
    {
        let result = client.query_one(&format!("SELECT count(*)::bigint, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM {table} t"), &[]).await.map_err(|error| error.to_string())?;
        let count: i64 = result.get(0);
        let expected = if table == "owners" {
            32
        } else {
            expected_rows as i64
        };
        if count != expected {
            return Err(format!(
                "Incorrect row count in {table}: {count}, expected {expected}"
            ));
        }
        let mut entry =
            json!({"table": table, "rows": count, "canonical_md5": result.get::<_, String>(1)});
        if table != "owners" {
            let sequence = client
                .query_one(
                    &format!("SELECT last_value, is_called FROM {table}_id_seq"),
                    &[],
                )
                .await
                .map_err(|error| error.to_string())?;
            if sequence.get::<_, i64>(0) != expected || !sequence.get::<_, bool>(1) {
                return Err(format!("Incorrect sequence state for {table}"));
            }
            entry["sequence_last_value"] = json!(sequence.get::<_, i64>(0));
            entry["sequence_is_called"] = json!(sequence.get::<_, bool>(1));
        }
        data.push(entry);
    }
    let indexes = client.query("SELECT c.relname, i.indisvalid AND i.indisready, pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname", &[]).await.map_err(|error| error.to_string())?;
    let fks = client.query("SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname", &[]).await.map_err(|error| error.to_string())?;
    if indexes.len() != 19
        || fks.len() != 6
        || indexes
            .iter()
            .chain(fks.iter())
            .any(|row| !row.get::<_, bool>(1))
    {
        return Err("Restored indexes or foreign keys are missing/invalid".into());
    }
    let definitions = |rows: Vec<tokio_postgres::Row>| {
        rows.into_iter()
            .map(|row| json!([row.get::<_, String>(0), row.get::<_, String>(2)]))
            .collect::<Vec<_>>()
    };
    Ok(json!({"tables": data, "indexes": definitions(indexes), "foreign_keys": definitions(fks)}))
}

#[derive(Clone, Copy)]
struct Mode {
    name: &'static str,
    jobs: u8,
    raw: bool,
}
const MODES: [Mode; 4] = [
    Mode {
        name: "app_atomic_jobs1",
        jobs: 1,
        raw: false,
    },
    Mode {
        name: "app_parallel_jobs2",
        jobs: 2,
        raw: false,
    },
    Mode {
        name: "app_parallel_jobs4",
        jobs: 4,
        raw: false,
    },
    Mode {
        name: "experimental_raw_nonatomic_jobs1",
        jobs: 1,
        raw: true,
    },
];

async fn restore_once(
    session: &DatabaseSession,
    tools: &PgTools,
    archive: &Path,
    database: &str,
    port: u16,
    mode: Mode,
) -> BenchResult<Value> {
    let preparation_started = Instant::now();
    let snapshot_started = Instant::now();
    let snapshot = files::snapshot(archive)?;
    let snapshot_ms = snapshot_started.elapsed().as_secs_f64() * 1000.0;
    let listing_started = Instant::now();
    let mut command = super::tools::command(&tools.restore);
    command.arg("--list").arg(snapshot.file.path());
    let listing = process::bounded_output(command).await?;
    let listing = String::from_utf8(listing).map_err(|_| "Archive listing is not UTF-8")?;
    operations::check_dump_version(&listing, tools.info.major)?;
    let listing_ms = listing_started.elapsed().as_secs_f64() * 1000.0;
    let preparation_ms = preparation_started.elapsed().as_secs_f64() * 1000.0;
    let (_sender, cancel) = watch::channel(false);
    let started = Instant::now();
    let app_duration_ms;
    if mode.raw {
        // Benchmark-only control isolates transaction cost. Never used by the app API.
        super::create_database::create(session, database, cancel.clone()).await?;
        let credentials = process::ProcessCredentials::create(&config(database, port), false)?;
        let mut command = credentials.command(&tools.restore);
        command
            .args([
                "--verbose",
                "--exit-on-error",
                "--no-owner",
                "--no-privileges",
                "--jobs=1",
            ])
            .arg(snapshot.file.path());
        process::run(
            command,
            cancel,
            |_| {},
            "Benchmark only",
            operations::cancel_tool(&session.client, &credentials.application_name, database),
        )
        .await?;
        app_duration_ms = None;
    } else {
        let result = operations::restore(
            session,
            PreparedRestore {
                session_id: session.info.id.clone(),
                tools: tools.clone(),
                file: snapshot,
            },
            config(&session.info.connection.database, port),
            RestoreInput {
                new_database: Some(database.into()),
                confirm_create: true,
                prepared_id: "benchmark".into(),
                password: None,
                trusted_file: true,
                confirm_database: database.into(),
                confirm_production: false,
                allow_nonempty: false,
                clean: false,
                confirm_clean: false,
                preserve_ownership: false,
                jobs: mode.jobs,
                confirm_parallel: mode.jobs > 1,
            },
            cancel,
            |_| {},
        )
        .await?;
        app_duration_ms = Some(result.duration_ms);
    }
    Ok(
        json!({"mode": mode.name, "jobs": mode.jobs, "atomic": mode.jobs == 1 && !mode.raw,
        "benchmark_only_runner": mode.raw, "snapshot_ms": snapshot_ms, "listing_ms": listing_ms, "preparation_ms": preparation_ms,
        "restore_ms": started.elapsed().as_secs_f64() * 1000.0, "app_reported_restore_ms": app_duration_ms}),
    )
}

async fn benchmark(
    admin: &Client,
    owned: &mut Vec<String>,
    port: u16,
    rows: usize,
    repeats: usize,
) -> BenchResult<Value> {
    let tools = if let Ok(root) = std::env::var("OPALINE_TEST_BUNDLED_ROOT") {
        super::managed::from_root(root.into(), operations::server_major(admin).await?).await?
    } else {
        PgTools::detect(Path::new(&std::env::var("OPALINE_TEST_PG_TOOLS").map_err(
            |_| "Set OPALINE_TEST_PG_TOOLS or OPALINE_TEST_BUNDLED_ROOT",
        )?))
        .await?
    };
    operations::check_server(admin, &tools).await?;
    let source = reserve_database(admin, owned).await?;
    sql(
        admin,
        &format!(
            "CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'",
            quote_identifier(&source)
        ),
    )
    .await?;
    let (client, connection) = postgres::connect(&config(&source, port)).await?;
    populate(&client, rows).await?;
    let expected = fingerprint(&client, rows).await?;
    let server_version = connection.server_version.clone();
    let database_bytes: i64 = client
        .query_one("SELECT pg_database_size(current_database())", &[])
        .await
        .map_err(|error| error.to_string())?
        .get(0);
    let settings = client.query_one("SELECT current_setting('fsync'), current_setting('synchronous_commit'), current_setting('full_page_writes'), current_setting('shared_buffers'), current_setting('maintenance_work_mem'), current_setting('max_connections'), current_setting('max_parallel_maintenance_workers'), current_setting('checkpoint_timeout'), current_setting('checkpoint_completion_target'), current_setting('max_wal_size'), current_setting('data_checksums')", &[]).await.map_err(|error| error.to_string())?;
    let state = AppState::default();
    state
        .add_with_password(
            client,
            SessionInfo {
                id: source.clone(),
                profile_id: source.clone(),
                workspace_id: "disposable-benchmark".into(),
                environment: Environment::Local,
                read_only: false,
                connection,
            },
            None,
            Some("opaline_test".into()),
        )
        .await?;
    let (session, _guard) = state.maintenance(&source, true).await?;
    let directory = tempfile::tempdir().map_err(|error| error.to_string())?;
    let archive = directory.path().join("benchmark.dump");
    let (_sender, cancel) = watch::channel(false);
    let dump = operations::dump(
        &session,
        &tools,
        config(&source, port),
        DumpInput {
            tools_id: None,
            path: archive.to_string_lossy().into(),
            format: DumpFormat::Custom,
            content: DumpContent::All,
            schemas: vec![],
            tables: vec![],
            password: None,
        },
        cancel,
        |_| {},
    )
    .await?;
    let mut samples = Vec::new();
    for round in 0..=repeats {
        for offset in 0..MODES.len() {
            let mode = MODES[(offset + round) % MODES.len()];
            let target = reserve_database(admin, owned).await?;
            let mut sample = restore_once(&session, &tools, &archive, &target, port, mode).await?;
            let (restored, _) = postgres::connect(&config(&target, port)).await?;
            if fingerprint(&restored, rows).await? != expected {
                return Err(format!("Integrity mismatch for {}", mode.name));
            }
            restored.abort();
            sample["warmup"] = json!(round == 0);
            sample["round"] = json!(round);
            sample["verified"] = json!(true);
            println!("OPALINE_RESTORE_BENCH_SAMPLE {sample}");
            samples.push(sample);
            sql(
                admin,
                &format!("DROP DATABASE {} WITH (FORCE)", quote_identifier(&target)),
            )
            .await?;
            owned.retain(|database| database != &target);
        }
    }
    if fingerprint(&session.client, rows).await? != expected {
        return Err("Source database changed during restore benchmarks".into());
    }
    let medians = MODES
        .iter()
        .map(|mode| {
            let median = |metric: &str| {
                let mut timings = samples
                    .iter()
                    .filter(|sample| sample["mode"] == mode.name && sample["warmup"] == false)
                    .map(|sample| sample[metric].as_f64().unwrap())
                    .collect::<Vec<_>>();
                timings.sort_by(f64::total_cmp);
                let middle = timings.len() / 2;
                if timings.len() % 2 == 0 {
                    (timings[middle - 1] + timings[middle]) / 2.0
                } else {
                    timings[middle]
                }
            };
            json!({"mode": mode.name, "restore_ms": median("restore_ms"), "snapshot_ms": median("snapshot_ms"), "listing_ms": median("listing_ms"), "preparation_ms": median("preparation_ms")})
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"benchmark": "opaline_restore", "server_version": server_version, "client_version": tools.info.version,
        "rows_per_table": rows, "independent_tables": 6, "reference_rows": 32, "warmups_per_mode": 1, "repeats_per_mode": repeats,
        "database_bytes": database_bytes, "dump_bytes": dump.bytes, "dump_ms": dump.duration_ms, "samples": samples, "medians": medians, "fingerprint": expected, "source_unchanged": true,
        "host": {"os": std::env::consts::OS, "arch": std::env::consts::ARCH, "available_parallelism": std::thread::available_parallelism().map(|count| count.get()).ok()},
        "settings": {"fsync": settings.get::<_, String>(0), "synchronous_commit": settings.get::<_, String>(1), "full_page_writes": settings.get::<_, String>(2), "shared_buffers": settings.get::<_, String>(3), "maintenance_work_mem": settings.get::<_, String>(4), "max_connections": settings.get::<_, String>(5), "max_parallel_maintenance_workers": settings.get::<_, String>(6), "checkpoint_timeout": settings.get::<_, String>(7), "checkpoint_completion_target": settings.get::<_, String>(8), "max_wal_size": settings.get::<_, String>(9), "data_checksums": settings.get::<_, String>(10)},
        "notes": "Fresh database per run; restore includes database creation, excludes preparation and verification. Preparation = private snapshot copy/hash/fsync plus pg_restore --list/version check, with tools already resolved. Warm cache, rotated order. Raw non-atomic serial control is benchmark-only. No durability or TLS defaults changed; loopback disposable fixture uses explicit non-TLS. No strict speed threshold."}),
    )
}

#[tokio::test]
#[ignore = "Creates and drops owned UUID databases on an explicit disposable non-default local port"]
async fn restore_performance_disposable() {
    let port: u16 = std::env::var("OPALINE_TEST_POSTGRES_PORT")
        .expect("Explicit disposable server required")
        .parse()
        .expect("Valid port required");
    assert!(
        port != 0 && port != 5432,
        "Never benchmark a default/user database port"
    );
    let rows = number("OPALINE_BENCH_ROWS", 50_000, 1_000_000);
    let repeats = number("OPALINE_BENCH_REPEATS", 3, 10);
    let (admin, _) = postgres::connect(&config("postgres", port)).await.unwrap();
    let mut owned = Vec::new();
    let outcome = AssertUnwindSafe(benchmark(&admin, &mut owned, port, rows, repeats))
        .catch_unwind()
        .await;
    let mut cleanup_errors = Vec::new();
    for database in owned {
        if let Err(error) = sql(
            &admin,
            &format!(
                "DROP DATABASE IF EXISTS {} WITH (FORCE)",
                quote_identifier(&database)
            ),
        )
        .await
        {
            cleanup_errors.push(format!("{database}: {error}"));
        }
    }
    assert!(
        cleanup_errors.is_empty(),
        "Owned database cleanup failed: {cleanup_errors:?}"
    );
    let report = match outcome {
        Ok(result) => result.unwrap(),
        Err(panic) => std::panic::resume_unwind(panic),
    };
    println!("OPALINE_RESTORE_BENCH_REPORT {report}");
    if let Ok(path) = std::env::var("OPALINE_BENCH_REPORT") {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .expect("New report path required; existing files are not overwritten");
        file.write_all(serde_json::to_string_pretty(&report).unwrap().as_bytes())
            .unwrap();
    }
}
