use std::path::{Path, PathBuf};

pub(crate) struct AtomicExport {
    temporary: tempfile::TempPath,
    destination: PathBuf,
}
impl AtomicExport {
    pub async fn create(destination: &Path) -> Result<Self, String> {
        let destination = destination.to_path_buf();
        tokio::task::spawn_blocking(move || {
            let parent = destination
                .parent()
                .ok_or("Choose an export destination.")?;
            let temporary = tempfile::Builder::new()
                .prefix(".opaline-export-")
                .suffix(".part")
                .tempfile_in(parent)
                .map_err(|_| {
                    "Could not create a temporary export file. Check permissions and free space."
                })?
                .into_temp_path();
            Ok(Self {
                temporary,
                destination,
            })
        })
        .await
        .map_err(|_| "Could not prepare the export file.".to_string())?
    }
    pub fn path(&self) -> &Path {
        &self.temporary
    }
    pub async fn publish(self) -> Result<(), String> {
        tokio::task::spawn_blocking(move || {
            self.temporary.persist(self.destination).map_err(|_| {
                "Could not publish the export. The previous destination was not replaced."
                    .to_string()
            })
        })
        .await
        .map_err(|_| "Could not finish publishing the export file.".to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn dropped_export_cleans_up_and_success_replaces_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("data.csv");
        std::fs::write(&destination, "original").unwrap();
        let pending = AtomicExport::create(&destination).await.unwrap();
        let path = pending.path().to_path_buf();
        std::fs::write(&path, "partial").unwrap();
        drop(pending);
        assert!(!path.exists());
        assert_eq!(std::fs::read_to_string(&destination).unwrap(), "original");
        let ready = AtomicExport::create(&destination).await.unwrap();
        std::fs::write(ready.path(), "complete").unwrap();
        ready.publish().await.unwrap();
        assert_eq!(std::fs::read_to_string(destination).unwrap(), "complete");
    }
}
