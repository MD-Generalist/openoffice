pub mod ai;
pub mod commands;
pub mod error;
pub mod hwp;
pub mod secrets;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_ieum_mobile::init())
        .run(tauri::generate_context!())
        .expect("error while running IeumOffice mobile application");
}
