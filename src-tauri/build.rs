fn main() {
    let source = std::path::Path::new("resources/postgres/manifest.json");
    println!("cargo:rerun-if-changed=resources/postgres");
    let manifest = std::fs::read_to_string(source).unwrap_or_else(|_| {
        if std::env::var("PROFILE").as_deref() == Ok("release") {
            panic!("Run npm run desktop:prepare before a release build. Backup clients must be bundled.");
        }
        r#"{"version":1,"target":"unprepared","releases":[]}"#.into()
    });
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let parsed: serde_json::Value =
            serde_json::from_str(&manifest).expect("Invalid bundled-client manifest");
        let releases = parsed["releases"]
            .as_array()
            .expect("Missing bundled clients");
        for major in 14..=18 {
            assert!(
                releases.iter().any(|release| release["major"] == major
                    && release["files"]
                        .as_array()
                        .is_some_and(|files| !files.is_empty())),
                "Incomplete PostgreSQL client bundle; run npm run desktop:prepare"
            );
        }
        let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let platform = match os.as_str() {
            "macos" => "darwin",
            "windows" => "win32",
            other => other,
        };
        let architecture = match arch.as_str() {
            "aarch64" => "arm64",
            "x86_64" => "x64",
            other => other,
        };
        assert_eq!(
            parsed["target"],
            format!("{platform}-{architecture}"),
            "Bundled clients must match the release architecture"
        );
    }
    let destination = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap())
        .join("postgres-manifest.json");
    std::fs::write(destination, manifest).unwrap();
    tauri_build::build()
}
