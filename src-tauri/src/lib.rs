mod display_awake;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(display_awake::DisplayAwake::new())
        .invoke_handler(tauri::generate_handler![display_awake::set_display_awake])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<display_awake::DisplayAwake>().release();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("Fitness Glass could not start");
}
