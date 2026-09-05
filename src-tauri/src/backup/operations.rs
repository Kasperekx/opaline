use super::{
    models::*,
    process::{self, ProcessCredentials},
    tools::PgTools,
    PreparedRestore,
};
use crate::{
    database::{export_file::AtomicExport, models::ConnectionConfig, table_data::quote_identifier},
    profiles::models::{Environment, SessionInfo},
    state::DatabaseSession,
};
use std::{
    path::Path,
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::sync::watch;
use tokio_postgres::Client;

pub(crate) async fn cancel_tool(client: &Client, application_name: &str, database: &str) {
    // Only this random per-job marker, current database and current role. Never all user queries.
    let _ = client.query("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND datname = $2 AND usename = current_user AND pid <> pg_backend_pid() AND backend_type = 'client backend'", &[&application_name, &database]).await;
}

pub(crate) async fn server_major(client: &Client) -> Result<u32, String> {
    let row = tokio::time::timeout(
        Duration::from_secs(10),
        client.query_one("SELECT current_setting('server_version_num')::integer", &[]),
    )
    .await
    .map_err(|_| "Server version check timed out.")?
    .map_err(|_| "Cannot check the server version.")?;
    let major = row.get::<_, i32>(0) as u32 / 10000;
    Ok(major)
}
pub(crate) async fn check_server(client: &Client, tools: &PgTools) -> Result<u32, String> {
    let major = server_major(client).await?;
    if major != tools.info.major {
        return Err(format!("Use PostgreSQL {major} client tools for this server. Selected tools are {}. Cross-major restore is not enabled in this release.", tools.info.version));
    }
    Ok(major)
}
pub(crate) fn check_dump_version(preview: &str, server_major: u32) -> Result<(), String> {
    for marker in [
        "Dumped from database version:",
        "Dumped by pg_dump version:",
        "Dumped from database version ",
        "Dumped by pg_dump version ",
    ] {
        if let Some(tail) = preview.split(marker).nth(1) {
            let major = tail
                .trim()
                .split('.')
                .next()
                .and_then(|part| part.parse::<u32>().ok());
            if major.is_some_and(|major| major != server_major) {
                return Err("This dump comes from a different PostgreSQL major version. Cross-major restore requires a separate migration workflow.".into());
            }
        }
    }
    Ok(())
}
async fn credentials(
    session: &DatabaseSession,
    mut config: ConnectionConfig,
    target_database: Option<&str>,
) -> Result<ProcessCredentials, String> {
    if session.info.connection.host.trim() != config.host.trim()
        || session.info.connection.port != config.port
        || session.info.connection.database.trim() != config.database.trim()
        || session.info.connection.username.trim() != config.username.trim()
    {
        return Err("The profile destination changed. Reconnect before backup / restore.".into());
    }
    let ssl = tokio::time::timeout(
        Duration::from_secs(10),
        session.client.query_one(
            "SELECT COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false)",
            &[],
        ),
    )
    .await
    .map_err(|_| "TLS state check timed out.")?
    .map_err(|_| "Cannot check the session transport security.")?
    .get::<_, bool>(0);
    if let Some(name) = target_database {
        config.database = name.to_owned();
    }
    tokio::task::spawn_blocking(move || ProcessCredentials::create(&config, ssl))
        .await
        .map_err(|_| "Cannot prepare client credentials.")?
}
pub(crate) fn dump_arguments(input: &DumpInput) -> Result<Vec<String>, String> {
    if input.schemas.len() + input.tables.len() > 200
        || (!input.schemas.is_empty() && !input.tables.is_empty())
    {
        return Err("Choose the whole database, up to 200 schemas, or up to 200 tables; do not mix scope types.".into());
    }
    let mut arguments = vec![
        "--verbose".into(),
        "--quote-all-identifiers".into(),
        "--strict-names".into(),
        "--lock-wait-timeout=10s".into(),
        "--encoding=UTF8".into(),
        format!(
            "--format={}",
            if input.format == DumpFormat::Custom {
                "custom"
            } else {
                "plain"
            }
        ),
    ];
    match input.content {
        DumpContent::All => {}
        DumpContent::Schema => arguments.push("--schema-only".into()),
        DumpContent::Data => arguments.push("--data-only".into()),
    };
    let valid = |value: &str| !value.is_empty() && value.len() <= 255 && !value.contains('\0');
    for schema in &input.schemas {
        if !valid(schema) {
            return Err("Invalid schema identifier.".into());
        }
        arguments.extend(["--schema".into(), quote_identifier(schema)]);
    }
    for table in &input.tables {
        if !valid(&table.schema) || !valid(&table.table) {
            return Err("Invalid table identifier.".into());
        }
        arguments.extend([
            "--table".into(),
            format!(
                "{}.{}",
                quote_identifier(&table.schema),
                quote_identifier(&table.table)
            ),
        ]);
    }
    Ok(arguments)
}
pub(crate) async fn dump(
    session: &DatabaseSession,
    tools: &PgTools,
    config: ConnectionConfig,
    input: DumpInput,
    cancel: watch::Receiver<bool>,
    progress: impl Fn(JobProgress),
) -> Result<JobResult, String> {
    let started = Instant::now();
    check_server(&session.client, tools).await?;
    let arguments = dump_arguments(&input)?;
    let credentials = credentials(session, config, None).await?;
    let output = AtomicExport::create(Path::new(&input.path)).await?;
    let file = tokio::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(output.path())
        .await
        .map_err(|_| "Cannot open temporary dump destination.")?
        .into_std()
        .await;
    let mut command = credentials.command(&tools.dump);
    command.args(arguments).stdout(Stdio::from(file));
    process::run(
        command,
        cancel,
        progress,
        "Creating dump",
        cancel_tool(
            &session.client,
            &credentials.application_name,
            &session.info.connection.database,
        ),
    )
    .await?;
    let file = tokio::fs::OpenOptions::new()
        .write(true)
        .open(output.path())
        .await
        .map_err(|_| "Cannot finalize dump.")?;
    let bytes = file
        .metadata()
        .await
        .map_err(|_| "Cannot inspect completed dump.")?
        .len();
    file.sync_all()
        .await
        .map_err(|_| "Cannot flush dump. The old destination is unchanged.")?;
    drop(file);
    output.publish().await?;
    Ok(JobResult {bytes, duration_ms: started.elapsed().as_millis() as u64, message: "Dump completed and saved. This is one database, not a cluster backup; roles and tablespaces must be managed separately.".into()})
}
pub(crate) fn validate_restore(info: &SessionInfo, input: &RestoreInput) -> Result<(), String> {
    if info.read_only {
        return Err("Restore is disabled for read-only connections.".into());
    }
    if let Some(name) = &input.new_database {
        super::create_database::validate_name(name)?;
        if !input.confirm_create {
            return Err("Confirm that database creation is immediate and is not automatically undone if restore fails.".into());
        }
        if input.clean || input.confirm_clean || input.allow_nonempty {
            return Err(
                "Creating a new database cannot reuse existing data or drop objects.".into(),
            );
        }
    }
    let target = input
        .new_database
        .as_deref()
        .unwrap_or(&info.connection.database);
    if !input.trusted_file || input.confirm_database != target {
        return Err(
            "Trust the selected dump and type the exact target database name before restoring."
                .into(),
        );
    }
    if info.environment == Environment::Production && !input.confirm_production {
        return Err("Confirm the production restore warning separately.".into());
    }
    if input.clean && (!input.confirm_clean || !input.allow_nonempty) {
        return Err(
            "Dropping existing objects requires separate destructive-operation consent.".into(),
        );
    }
    Ok(())
}
pub(crate) async fn restore(
    session: &DatabaseSession,
    prepared: PreparedRestore,
    config: ConnectionConfig,
    input: RestoreInput,
    cancel: watch::Receiver<bool>,
    progress: impl Fn(JobProgress),
) -> Result<JobResult, String> {
    let started = Instant::now();
    validate_restore(&session.info, &input)?;
    check_server(&session.client, &prepared.tools).await?;
    if input.clean && prepared.file.format != DumpFormat::Custom {
        return Err("Clean / drop is available only for custom archives. SQL scripts control their own statements.".into());
    }
    if input.new_database.is_none() && !input.allow_nonempty {
        // Check relations, routines, user-defined types, schemas and extensions, not just visible tables.
        let empty = tokio::time::timeout(Duration::from_secs(10), session.client.query_one("SELECT NOT (EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')) OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql'))", &[])).await.map_err(|_| "Empty database check timed out.")?.map_err(|_| "Cannot verify that the target database is empty.")?.get::<_, bool>(0);
        if !empty {
            return Err("The target database is not empty. Choose an empty database or explicitly allow restoring into existing data.".into());
        }
    }
    let target = input
        .new_database
        .as_deref()
        .unwrap_or(&session.info.connection.database);
    let credentials = credentials(session, config, input.new_database.as_deref()).await?;
    let mut command;
    if prepared.file.format == DumpFormat::Custom {
        command = credentials.command(&prepared.tools.restore);
        command.args(["--verbose", "--exit-on-error", "--single-transaction"]);
        if !input.preserve_ownership {
            command.args(["--no-owner", "--no-privileges"]);
        }
        if input.clean {
            command.args(["--clean", "--if-exists"]);
        }
        command.arg(prepared.file.file.path());
    } else {
        command = credentials.command(&prepared.tools.psql);
        command
            .args([
                "--no-psqlrc",
                "--single-transaction",
                "--set=ON_ERROR_STOP=on",
                "--set=ON_ERROR_ROLLBACK=off",
                "--set=VERBOSITY=terse",
                "--file",
            ])
            .arg(prepared.file.file.path());
    }
    if let Some(name) = &input.new_database {
        progress(JobProgress { stage: "Creating database".into(), elapsed_ms: started.elapsed().as_millis() as u64, message: "Creating an empty database before restoring. Existing databases will not be reused.".into() });
        super::create_database::create(session, name, cancel.clone()).await?;
    }
    process::run(command, cancel, progress, "Restoring database", cancel_tool(&session.client, &credentials.application_name, target)).await.map_err(|error| format!("{error} Restore into {target:?} is not confirmed complete. Partial changes or external effects are possible. Inspect before retrying. If a database was created, it has been kept; nothing was automatically dropped."))?;
    let message = if input.new_database.is_some() {
        format!("Database {target:?} created and restore completed. Add a connection profile for this database to open it. The previous connection was not changed.")
    } else {
        "PostgreSQL reported successful restore. Reconnect to refresh schema and data. No prior query is replayed.".into()
    };
    Ok(JobResult {
        bytes: prepared.file.bytes,
        duration_ms: started.elapsed().as_millis() as u64,
        message,
    })
}
