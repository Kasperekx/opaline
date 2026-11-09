use super::*;
use crate::database::{
    client::DatabaseClient,
    models::{ConnectionConfig, ExportTableDataRequest, SslMode, TableExportFormat},
    table_export::export_table,
};

async fn test_client() -> Option<DatabaseClient> {
    let port = std::env::var("OPALINE_TEST_POSTGRES_PORT").ok()?;
    let config = ConnectionConfig {
        name: "Table compatibility test".into(),
        host: "127.0.0.1".into(),
        port: port.parse().expect("test port must be a number"),
        database: "postgres".into(),
        username: "postgres".into(),
        password: "opaline_test".into(),
        ssl_mode: SslMode::Disable,
        ca_path: None,
        read_only: false,
    };
    Some(postgres::connect(&config).await.expect("test connection").0)
}

async fn temp_schema(client: &Client) -> String {
    client
        .query_one("SELECT pg_my_temp_schema()::regnamespace::text", &[])
        .await
        .expect("temporary schema")
        .get(0)
}

fn request(schema: String, table: &str) -> TablePageRequest {
    TablePageRequest {
        schema,
        table: table.into(),
        page: 0,
        page_size: 10,
        filter: None,
        conditions: vec![],
        sort: None,
    }
}

#[test]
fn search_passes_columns_as_one_array_and_quotes_identifiers() {
    let columns = (0..128)
        .map(|index| ColumnInfo {
            name: format!("column\"{index}"),
            data_type: "text".into(),
            nullable: true,
            default_value: None,
            primary_key: false,
            identity: false,
            generated: false,
            enum_values: vec![],
        })
        .collect::<Vec<_>>();
    let sql = search_predicate(&columns, 2);
    assert_eq!(sql.matches("COALESCE(").count(), 128);
    assert!(sql.contains("concat_ws(' ', VARIADIC ARRAY["));
    assert!(sql.contains("\"column\"\"127\"::text"));
    assert!(sql.starts_with("($2::text IS NULL OR"));
    assert!(sql.ends_with("lower($2::text)) > 0)"));
}

#[tokio::test]
async fn browses_searches_and_exports_wide_tables_when_postgres_is_configured() {
    let Some(client) = test_client().await else {
        return;
    };
    let columns = (0..128)
        .map(|index| format!("c{index} text"))
        .collect::<Vec<_>>()
        .join(", ");
    client
        .batch_execute(&format!(
            "CREATE TEMP TABLE opaline_wide (id integer PRIMARY KEY, {columns}); \
             INSERT INTO opaline_wide (id, c127) VALUES (1, 'Needle'); \
             INSERT INTO opaline_wide (id) VALUES (2); \
             INSERT INTO opaline_wide (id, c0, c2) VALUES (3, 'left', 'right');"
        ))
        .await
        .expect("wide fixture");
    let mut input = request(temp_schema(&client).await, "opaline_wide");
    for (filter, expected_rows) in [
        (None, 3),
        (Some("   "), 3),
        (Some("needle"), 1),
        (Some("left  right"), 1),
        (Some("%_"), 0),
    ] {
        input.filter = filter.map(str::to_owned);
        let page = fetch_page(&client, &input)
            .await
            .expect("wide table should load regardless of active search");
        assert_eq!(page.columns.len(), 129);
        assert_eq!(page.rows.len(), expected_rows, "filter: {filter:?}");
        if filter == Some("needle") {
            assert_eq!(page.rows[0].values[128].as_deref(), Some("Needle"));
        }
    }

    let directory = tempfile::tempdir().expect("temporary export directory");
    for (index, filter) in [None, Some("needle")].into_iter().enumerate() {
        for (extension, format) in [
            ("csv", TableExportFormat::Csv),
            ("json", TableExportFormat::Json),
        ] {
            let path = directory.path().join(format!("wide-{index}.{extension}"));
            let result = export_table(
                &client,
                &ExportTableDataRequest {
                    schema: input.schema.clone(),
                    table: input.table.clone(),
                    filter: filter.map(str::to_owned),
                    conditions: vec![],
                    sort: None,
                    format,
                    path: path.to_string_lossy().into_owned(),
                },
                |_| {},
            )
            .await
            .expect("wide table export");
            assert_eq!(result.rows_exported, if filter.is_none() { 3 } else { 1 });
            let contents = tokio::fs::read_to_string(path).await.expect("export data");
            assert!(contents.contains("Needle"));
            assert!(contents.contains("c127"));
        }
    }
}

#[tokio::test]
async fn browses_custom_postgres_types_when_postgres_is_configured() {
    let Some(client) = test_client().await else {
        return;
    };
    client
        .batch_execute(
            "CREATE TEMP TABLE opaline_types (id integer PRIMARY KEY); \
             CREATE TYPE pg_temp.\"custom status\" AS ENUM ('new', 'ready'); \
             CREATE DOMAIN pg_temp.positive_amount AS numeric CHECK (VALUE >= 0); \
             ALTER TABLE opaline_types \
               ADD status pg_temp.\"custom status\", \
               ADD statuses pg_temp.\"custom status\"[], \
               ADD amount pg_temp.positive_amount, \
               ADD payload jsonb, \
               ADD validity int4range, \
               ADD bytes bytea; \
             INSERT INTO opaline_types VALUES \
               (1, 'ready', '{new,ready}', 123.45, '{\"source\":\"imported\"}', \
                '[1,10)', decode('deadbeef', 'hex'));",
        )
        .await
        .expect("custom type fixture");
    let mut input = request(temp_schema(&client).await, "opaline_types");
    for filter in [None, Some("ready"), Some("imported")] {
        input.filter = filter.map(str::to_owned);
        let page = fetch_page(&client, &input)
            .await
            .expect("custom PostgreSQL types should remain browsable");
        assert_eq!(page.rows.len(), 1);
        assert_eq!(page.rows[0].values[1].as_deref(), Some("ready"));
        assert_eq!(page.rows[0].values[2].as_deref(), Some("{new,ready}"));
        assert_eq!(page.rows[0].values[3].as_deref(), Some("123.45"));
        assert_eq!(page.rows[0].values[5].as_deref(), Some("[1,10)"));
        assert_eq!(page.rows[0].values[6].as_deref(), Some("\\xdeadbeef"));
    }
}

#[tokio::test]
async fn sorts_and_pages_native_values_when_postgres_is_configured() {
    let Some(client) = test_client().await else {
        return;
    };
    client
        .batch_execute(
            "CREATE TEMP TABLE opaline_numeric_sort \
               (id integer PRIMARY KEY, score integer, same_value text); \
             INSERT INTO opaline_numeric_sort VALUES \
               (10, 10, 'same'), (2, 2, 'same'), (1, 1, 'same'); \
             CREATE TEMP TABLE opaline_paged_sort \
               (id integer PRIMARY KEY, same_value integer); \
             INSERT INTO opaline_paged_sort \
               SELECT value, 1 FROM generate_series(25, 1, -1) AS value;",
        )
        .await
        .expect("numeric sorting fixture");
    let mut input = request(temp_schema(&client).await, "opaline_numeric_sort");
    let directory = tempfile::tempdir().expect("sort export directory");
    for (index, (sort, expected)) in [
        (None, vec!["1", "2", "10"]),
        (
            Some(TableSort {
                column: "score".into(),
                direction: SortDirection::Asc,
            }),
            vec!["1", "2", "10"],
        ),
        (
            Some(TableSort {
                column: "score".into(),
                direction: SortDirection::Desc,
            }),
            vec!["10", "2", "1"],
        ),
        (
            Some(TableSort {
                column: "same_value".into(),
                direction: SortDirection::Desc,
            }),
            vec!["1", "2", "10"],
        ),
    ]
    .into_iter()
    .enumerate()
    {
        input.sort = sort;
        let page = fetch_page(&client, &input)
            .await
            .expect("native sorted page");
        let ids = page
            .rows
            .iter()
            .map(|row| row.values[0].as_deref().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(ids, expected);

        let path = directory.path().join(format!("sorted-{index}.json"));
        export_table(
            &client,
            &ExportTableDataRequest {
                schema: input.schema.clone(),
                table: input.table.clone(),
                filter: None,
                conditions: vec![],
                sort: input.sort.take(),
                format: TableExportFormat::Json,
                path: path.to_string_lossy().into_owned(),
            },
            |_| {},
        )
        .await
        .expect("native sorted export");
        let contents = tokio::fs::read_to_string(path)
            .await
            .expect("export contents");
        let rows: Vec<serde_json::Value> = serde_json::from_str(&contents).expect("JSON export");
        let ids = rows
            .iter()
            .map(|row| row["id"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(ids, expected);
    }

    input.table = "opaline_paged_sort".into();
    // Equal selected values use the native primary key as their tie-breaker.
    input.sort = Some(TableSort {
        column: "same_value".into(),
        direction: SortDirection::Desc,
    });
    let mut ids = Vec::new();
    for page in 0..3 {
        input.page = page;
        let result = fetch_page(&client, &input)
            .await
            .expect("stable pagination");
        assert_eq!(result.has_more, page < 2);
        ids.extend(
            result
                .rows
                .into_iter()
                .map(|row| row.values[0].as_ref().unwrap().parse::<u32>().unwrap()),
        );
    }
    assert_eq!(ids, (1..=25).collect::<Vec<_>>());
}

#[tokio::test]
async fn database_diagnostics_keep_codes_without_values_when_postgres_is_configured() {
    use crate::database::diagnostics::database_error;

    let Some(client) = test_client().await else {
        return;
    };
    client
        .batch_execute(
            "CREATE TEMP TABLE opaline_diagnostic_values \
               (secret text CONSTRAINT opaline_secret_unique UNIQUE); \
             INSERT INTO opaline_diagnostic_values VALUES ('private-row-value');",
        )
        .await
        .expect("diagnostic fixture");
    for (sql, code) in [
        ("SELECT * FROM pg_temp.opaline_absent_relation", "42P01"),
        ("SELECT 'private-row-value'::integer", "22P02"),
        (
            "INSERT INTO opaline_diagnostic_values VALUES ('private-row-value')",
            "23505",
        ),
    ] {
        let error = client.query(sql, &[]).await.expect_err("fixture must fail");
        let diagnostic = database_error("Could not load table data", error);
        assert!(diagnostic.contains(code), "{diagnostic}");
        assert!(!diagnostic.contains("private-row-value"));
        assert!(!diagnostic.contains(sql));
        if code == "23505" {
            assert!(diagnostic.contains("opaline_secret_unique"));
        }
    }

    let relation = qualified_name(&temp_schema(&client).await, "opaline_diagnostic_values");
    client
        .batch_execute("SET ROLE pg_read_all_stats")
        .await
        .expect("use an unprivileged built-in role in the disposable fixture");
    let error = client
        .query(&format!("SELECT * FROM {relation}"), &[])
        .await
        .expect_err("the role must not read the fixture");
    client
        .batch_execute("RESET ROLE")
        .await
        .expect("restore test role");
    let diagnostic = database_error("Could not load table data", error);
    assert!(diagnostic.contains("42501"));
    assert!(diagnostic.contains("privileges"));
    assert!(!diagnostic.contains("private-row-value"));
}

#[tokio::test]
async fn primary_key_excludes_covering_columns_when_postgres_is_configured() {
    let Some(client) = test_client().await else {
        return;
    };
    client
        .batch_execute(
            "CREATE TEMP TABLE opaline_covering_key \
               (id integer, payload json, PRIMARY KEY (id) INCLUDE (payload)); \
             INSERT INTO opaline_covering_key VALUES \
               (10, '{\"label\":\"ten\"}'), (2, NULL), (1, '{\"label\":\"one\"}');",
        )
        .await
        .expect("covering primary key fixture");
    let input = request(temp_schema(&client).await, "opaline_covering_key");
    let columns = postgres::list_columns(&client, &input.schema, &input.table)
        .await
        .expect("covering index metadata");
    assert!(columns[0].primary_key);
    assert!(
        !columns[1].primary_key,
        "INCLUDE is not part of row identity"
    );

    // JSON has no native ordering: adding the INCLUDE column to ORDER BY
    // would make opening this valid table fail before any rows are returned.
    let page = fetch_page(&client, &input)
        .await
        .expect("default browse must sort only actual key columns");
    assert!(page.editable);
    let ids = page
        .rows
        .iter()
        .map(|row| row.values[0].as_deref().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(ids, ["1", "2", "10"]);
}
