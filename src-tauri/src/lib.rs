use std::fs;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Holds a file path passed on the command line at launch (for OS file
/// association / "open with" on first launch).
struct InitialPath(Mutex<Option<String>>);

/// Read a file as UTF-8 text. Used by the frontend instead of the scoped
/// filesystem plugin so any user-selected path can be opened.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{e}"))
}

/// Return (and clear) a path passed on the command line at startup.
#[tauri::command]
fn initial_path(state: tauri::State<InitialPath>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture a file path passed as the first argument (first launch).
    let initial = std::env::args().nth(1).filter(|s| !s.is_empty());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second instance was launched (e.g. user double-clicked a .md
            // file while Mark is already running). Forward the path.
            if let Some(path) = args.get(1) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("open-file", path.clone());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(InitialPath(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![read_text_file, initial_path])
        .run(tauri::generate_context!())
        .expect("error while running Mark");
}
