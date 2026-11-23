use crate::error::MobileResult;
use crate::storage::{MobileAppPrefs, MobileAppPrefsPatch, MobileFileService};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn mobile_get_app_prefs(
    state: State<'_, Arc<MobileFileService>>,
) -> MobileResult<MobileAppPrefs> {
    state.get_app_prefs()
}

#[tauri::command]
pub fn mobile_set_app_prefs(
    state: State<'_, Arc<MobileFileService>>,
    patch: MobileAppPrefsPatch,
) -> MobileResult<MobileAppPrefs> {
    state.set_app_prefs(patch)
}
