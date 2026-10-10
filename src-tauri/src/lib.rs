mod backup;
mod export_text;
mod local_media;
mod versions;

use std::fs;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use tauri::{Emitter, Manager};
use tauri_plugin_window_state::StateFlags;

const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;

/// Holds a file path passed on the command line at launch (for OS file
/// association / "open with" on first launch).
struct InitialPath(Mutex<Option<String>>);

fn first_user_path(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|s| !s.is_empty() && !s.starts_with('-'))
        .cloned()
}

/// Read a file as text. UTF-8 (with BOM) and UTF-16 (with BOM) are accepted.
/// Anything else is refused so a binary file doesn't flood the reader.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_TEXT_BYTES {
        return Err("This file is larger than 16 MB.".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    decode_text(&bytes)
}

/// Modified time in milliseconds, so the reader can reload when the file changes.
#[tauri::command]
fn file_mtime_ms(path: String) -> Result<u64, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    let ms = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    u64::try_from(ms).map_err(|_| "Clock is out of range".to_string())
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec())
            .map_err(|_| "This file is not UTF-8 text.".into());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16(&bytes[2..], true);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16(&bytes[2..], false);
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "This file is not UTF-8 text.".into())
}

fn decode_utf16(bytes: &[u8], little: bool) -> Result<String, String> {
    if bytes.len() % 2 != 0 {
        return Err("This file is not valid UTF-16 text.".into());
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| {
            if little {
                u16::from_le_bytes([c[0], c[1]])
            } else {
                u16::from_be_bytes([c[0], c[1]])
            }
        })
        .collect();
    String::from_utf16(&units).map_err(|_| "This file is not valid UTF-16 text.".into())
}

/// Return (and clear) a path passed on the command line at startup.
#[tauri::command]
fn initial_path(state: tauri::State<InitialPath>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture a file path passed as the first argument (first launch).
    let args: Vec<String> = std::env::args().collect();
    let initial = first_user_path(&args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second instance was launched (e.g. user double-clicked a .md
            // file while Mark is already running). Forward the path.
            if let Some(path) = first_user_path(&args) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("open-file", path.clone());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // DECORATIONS is deliberately excluded: this app declares decorations:false in
        // tauri.conf.json and draws its own title bar. The plugin's saved state is
        // restored on launch, so a "decorated: true" written by an earlier run would
        // silently put the native title bar back on top of the custom one.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::DECORATIONS)
                .build(),
        )
        .manage(InitialPath(Mutex::new(initial)))
        .manage(versions::DocumentRegistry::default())
        .setup(|app| {
            // tauri.conf.json declares decorations:false, but on Windows the native
            // title bar still appeared (WS_CAPTION set), stacking a second bar on top
            // of the custom one. Forcing the style once the window exists is what
            // actually removes it.
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            initial_path,
            file_mtime_ms,
            local_media::read_image_file,
            local_media::find_audio,
            local_media::read_audio_file,
            local_media::read_timing,
            backup::export_reader_backup,
            export_text::export_reader_text,
            versions::open_versioned_document,
            versions::save_versioned_document,
            versions::list_document_versions,
            versions::read_document_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mark");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_bom_is_stripped() {
        let text = decode_text(&[0xEF, 0xBB, 0xBF, b'A']).unwrap();
        assert_eq!(text, "A");
    }

    #[test]
    fn utf16_le_bom() {
        // BOM FF FE, then 'A' as UTF-16 LE
        let text = decode_text(&[0xFF, 0xFE, b'A', 0x00]).unwrap();
        assert_eq!(text, "A");
    }

    #[test]
    fn rejects_invalid_utf8() {
        assert!(decode_text(&[0xFF, 0x00]).is_err());
    }

    #[test]
    fn skips_flags_when_picking_a_launch_path() {
        let args = vec!["mark.exe".into(), "--".into(), "notes.md".into()];
        // "--" starts with '-', so the file after it is the one we open.
        assert_eq!(first_user_path(&args).as_deref(), Some("notes.md"));
    }
}
