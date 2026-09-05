use crate::database::{
    models::{ConnectionConfig, SslMode},
    postgres,
};

#[tokio::test]
#[ignore = "Requires a disposable TLS PostgreSQL server and OPALINE_TEST_CA_PATH"]
async fn custom_ca_verifies_chain_and_hostname_and_cancels_with_the_same_trust() {
    let ca_path = std::env::var("OPALINE_TEST_CA_PATH").expect("Path to the disposable CA PEM");
    let mut input = ConnectionConfig {
        name: "TLS test".into(),
        host: "localhost".into(),
        port: std::env::var("OPALINE_TEST_TLS_PORT")
            .unwrap()
            .parse()
            .unwrap(),
        database: "postgres".into(),
        username: "postgres".into(),
        password: "opaline_test".into(),
        ssl_mode: SslMode::Require,
        ca_path: Some(ca_path),
        read_only: false,
    };
    let tls = postgres::tls_config(&input).await.unwrap();
    let (client, _) = postgres::connect_with_tls(&input, tls.clone())
        .await
        .unwrap();
    let secure: bool = client
        .query_one(
            "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
            &[],
        )
        .await
        .unwrap()
        .get(0);
    assert!(secure);
    let query = client.simple_query("SELECT pg_sleep(5)");
    let cancel = async {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        postgres::cancel_with_tls(&client.cancel_token(), tls)
            .await
            .unwrap();
    };
    let (result, _) = tokio::join!(query, cancel);
    assert!(result.is_err());
    input.host = "127.0.0.1".into(); // Certificate deliberately contains DNS:localhost only.
    assert!(postgres::connect(&input).await.is_err());
    input.host = "localhost".into();
    input.ca_path = None; // The disposable CA is not trusted by the OS.
    assert!(postgres::connect(&input).await.is_err());
    input.ca_path = Some("/missing/opaline-test-ca.pem".into());
    assert!(postgres::connect(&input).await.is_err());
    input.ssl_mode = SslMode::Prefer;
    assert!(postgres::tls_config(&input).await.is_err());
}
