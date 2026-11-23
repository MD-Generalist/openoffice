pub mod auth;
pub mod fs;

use crate::auth::{HostAuthBridge, NativeAuthBridge};
use crate::fs::{HostFileBridge, NativeFileBridge};
use std::sync::Arc;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Returns the active file/share bridge implementation for the current target.
pub fn default_file_bridge() -> Arc<dyn NativeFileBridge> {
    Arc::new(HostFileBridge::new())
}

/// Returns the active keystore/auth browser bridge implementation for the current target.
pub fn default_auth_bridge() -> Arc<dyn NativeAuthBridge> {
    Arc::new(HostAuthBridge::default())
}

/// Initializes the local IeumOffice mobile OS bridge plugin.
/// Registers Android Kotlin (`IeumFilePlugin`, `IeumAuthPlugin`) and iOS Swift
/// (`IeumFilePlugin`, `IeumAuthPlugin`) handlers when compiled for mobile targets.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ieum-mobile")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let _ = _api.register_android_plugin("com.ieumoffice.mobile", "IeumFilePlugin")?;
                let _ = _api.register_android_plugin("com.ieumoffice.mobile", "IeumAuthPlugin")?;
            }
            #[cfg(target_os = "ios")]
            {
                // Swift plugin classes live under ios/Sources/{IeumFilePlugin,IeumAuthPlugin}.swift
                // and are bridged when Xcode links the generated iOS project.
            }
            Ok(())
        })
        .build()
}
