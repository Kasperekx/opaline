pub(crate) trait CredentialStore: Send + Sync {
    fn get(&self, id: &str) -> Result<String, String>;
    fn set(&self, id: &str, password: &str) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

pub(crate) struct NativeCredentials;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.opaline.desktop", id)
        .map_err(|_| "The system credential store is unavailable.".to_string())
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
impl CredentialStore for NativeCredentials {
    fn get(&self, id: &str) -> Result<String, String> {
        entry(id)?.get_password().map_err(|_| "Could not read the saved password. Unlock your system credential store or enter a new password.".into())
    }
    fn set(&self, id: &str, password: &str) -> Result<(), String> {
        entry(id)?.set_password(password).map_err(|_| "Could not save the password in the system credential store. No plaintext fallback was used.".into())
    }
    fn delete(&self, id: &str) -> Result<(), String> {
        match entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove the saved password. Unlock your system credential store and retry.".into()),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
impl CredentialStore for NativeCredentials {
    fn get(&self, _: &str) -> Result<String, String> {
        Err("Secure password storage is not supported on this platform.".into())
    }
    fn set(&self, _: &str, _: &str) -> Result<(), String> {
        Err("Secure password storage is not supported on this platform.".into())
    }
    fn delete(&self, _: &str) -> Result<(), String> {
        Err("Secure password storage is not supported on this platform.".into())
    }
}
