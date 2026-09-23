use tokio_postgres::Client;

/// A single statement gives the graph one catalog snapshot without opening a
/// transaction on the user's session. No table data or user SQL is executed.
pub(crate) async fn inspect(client: &Client) -> Result<serde_json::Value, String> {
    let row = client
        .query_one(include_str!("diagram.sql"), &[])
        .await
        .map_err(|error| format!("Could not load database diagram: {error}"))?;
    let text: String = row.get(0);
    let mut snapshot: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| "The database returned invalid diagram metadata.")?;
    // ponytail: bound the graph payload; schema-scoped loading is the next step
    // for databases beyond this ceiling, never silently return a partial graph.
    if snapshot["tooLarge"] == true {
        return Err("This diagram exceeds 2,000 tables, 30,000 columns or 10,000 relationships. Database-wide diagrams of this size are not supported yet.".into());
    }
    snapshot
        .as_object_mut()
        .ok_or("Invalid diagram metadata.")?
        .remove("tooLarge");
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{
        models::{ConnectionConfig, SslMode},
        postgres,
    };

    #[tokio::test]
    #[ignore = "requires disposable PostgreSQL via OPALINE_TEST_POSTGRES_PORT"]
    async fn diagram_catalog_integration() {
        let port = std::env::var("OPALINE_TEST_POSTGRES_PORT")
            .expect("Set OPALINE_TEST_POSTGRES_PORT to a disposable PostgreSQL server");
        let (client, _) = postgres::connect(&ConnectionConfig {
            name: "Diagram fixture".into(),
            host: "127.0.0.1".into(),
            port: port.parse().unwrap(),
            database: "postgres".into(),
            username: "postgres".into(),
            password: "opaline_test".into(),
            ssl_mode: SslMode::Disable,
            ca_path: None,
            read_only: false,
        })
        .await
        .unwrap();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let a = format!("diagram_a_{suffix}");
        let b = format!("diagram_b_{suffix}");
        let role = format!("diagram_role_{suffix}");
        client.batch_execute(&format!(
            "BEGIN; CREATE SCHEMA {a}; CREATE SCHEMA {b};
             CREATE TABLE {a}.accounts (tenant int, id int, PRIMARY KEY(tenant, id));
             CREATE TABLE {b}.orders (id int PRIMARY KEY, tenant int, account_id int,
               CONSTRAINT composite_fk FOREIGN KEY(tenant, account_id) REFERENCES {a}.accounts(tenant, id) ON DELETE CASCADE);
             CREATE TABLE {a}.tree (id int PRIMARY KEY, parent_id int REFERENCES {a}.tree(id));
             CREATE TABLE {a}.events (id int PRIMARY KEY) PARTITION BY RANGE(id);
             CREATE TABLE {a}.events_one PARTITION OF {a}.events FOR VALUES FROM (0) TO (10);
             CREATE TABLE {a}.\"empty columns\" ();
             CREATE VIEW {a}.excluded_view AS SELECT * FROM {a}.accounts;"
        )).await.unwrap();
        let data = inspect(&client).await.unwrap();
        let tables = data["tables"].as_array().unwrap();
        let accounts = tables
            .iter()
            .find(|t| t["schema"] == a && t["name"] == "accounts")
            .unwrap();
        assert_eq!(accounts["columns"][0]["primaryKey"], true);
        assert_eq!(accounts["columns"][0]["nullable"], false);
        assert!(!tables
            .iter()
            .any(|t| t["schema"] == a && t["name"] == "excluded_view"));
        let partition = tables
            .iter()
            .find(|t| t["schema"] == a && t["name"] == "events_one")
            .unwrap();
        assert_eq!(partition["parent"]["name"], "events");
        let fk = data["foreignKeys"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["sourceSchema"] == b && f["name"] == "composite_fk")
            .unwrap();
        assert_eq!(
            fk["sourceColumns"],
            serde_json::json!(["tenant", "account_id"])
        );
        assert_eq!(fk["targetColumns"], serde_json::json!(["tenant", "id"]));
        assert_eq!(fk["onDelete"], "CASCADE");
        assert!(data["foreignKeys"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f["sourceSchema"] == a
                && f["sourceTable"] == "tree"
                && f["targetTable"] == "tree"));
        client.batch_execute(&format!("CREATE ROLE {role}; GRANT USAGE ON SCHEMA {b} TO {role}; GRANT SELECT ON {b}.orders TO {role}; SET LOCAL ROLE {role};")).await.unwrap();
        let limited = inspect(&client).await.unwrap();
        assert!(limited["omittedTables"].as_u64().unwrap() >= 5);
        assert!(limited["tables"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["schema"] == b && t["name"] == "orders"));
        assert!(!limited["tables"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["schema"] == a));
        client.batch_execute("ROLLBACK").await.unwrap();
    }
}
