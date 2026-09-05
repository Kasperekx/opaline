use fs2::FileExt;
use std::{
    fs::{File, OpenOptions},
    io,
    path::Path,
};

// The OS releases the lock even after a crash. Keep the file: removing it would
// allow a second process to lock a different inode at the same path.
pub(crate) struct InstanceLock {
    _file: File,
}
impl InstanceLock {
    pub fn acquire(directory: &Path) -> io::Result<Self> {
        std::fs::create_dir_all(directory)?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(directory.join(".instance.lock"))?;
        file.try_lock_exclusive().map_err(|_| {
            io::Error::new(io::ErrorKind::WouldBlock,
            "Opaline is already using this local configuration. Close the other instance first.")
        })?;
        Ok(Self { _file: file })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_another_instance_and_releases_on_drop() {
        let directory = tempfile::tempdir().unwrap();
        let first = InstanceLock::acquire(directory.path()).unwrap();
        assert!(InstanceLock::acquire(directory.path()).is_err());
        drop(first);
        assert!(InstanceLock::acquire(directory.path()).is_ok());
    }
}
