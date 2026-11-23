pub mod auth;
pub mod fs;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Initializes the local IeumOffice mobile OS bridge plugin.
/// Mobile Kotlin/Swift handlers are wired during T8.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ieum-mobile").build()
}
