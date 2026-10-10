mod backup;
mod export_text;

use std::fs;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use tauri::{Emitter, Manager};
use tauri_plugin_window_state::StateFlags;

const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 80 * 1024 * 1024;
const MAX_TIMING_BYTES: u64 = 4 * 1024 * 1024;

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

/// Local images as a data URL. The webview origin can't load a relative src.
#[tauri::command]
fn read_image_file(path: String) -> Result<String, String> {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        _ => return Err("Not an image".into()),
    };
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("This image is larger than 25 MB.".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", base64_encode(&bytes)))
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

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Find the audio that belongs to a document: next to it, or in an `audio/`
/// folder next to it.
#[tauri::command]
fn find_audio(path: String) -> Option<String> {
    let doc = std::path::PathBuf::from(&path);
    let stem = doc.file_stem()?.to_string_lossy().to_string();
    let dir = doc.parent()?;
    for ext in ["mp3", "m4a", "wav", "ogg"] {
        for cand in [
            dir.join(format!("{stem}.{ext}")),
            dir.join("audio").join(format!("{stem}.{ext}")),
        ] {
            if cand.is_file() {
                return Some(cand.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Read an audio file as raw bytes. `Response` crosses IPC as an ArrayBuffer,
/// which matters for a chapter that is tens of megabytes.
#[tauri::command]
fn read_audio_file(path: String) -> Result<tauri::ipc::Response, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_AUDIO_BYTES {
        return Err("This audio file is larger than 80 MB.".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Word timeline `<naam>.words.json`, beside the document or in `audio/`.
/// Missing timing is normal: the document still reads, karaoke just stays off.
#[tauri::command]
fn read_timing(path: String) -> Option<String> {
    let doc = std::path::PathBuf::from(&path);
    let stem = doc.file_stem()?.to_string_lossy().to_string();
    let dir = doc.parent()?;
    for cand in [
        dir.join(format!("{stem}.words.json")),
        dir.join("audio").join(format!("{stem}.words.json")),
    ] {
        if !cand.is_file() {
            continue;
        }
        let meta = fs::metadata(&cand).ok()?;
        if meta.len() > MAX_TIMING_BYTES {
            return None;
        }
        return fs::read_to_string(cand).ok();
    }
    None
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
            read_image_file,
            find_audio,
            read_audio_file,
            read_timing,
            backup::export_reader_backup,
            export_text::export_reader_text
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
    fn base64_of_hi() {
        assert_eq!(base64_encode(b"hi"), "aGk=");
    }

    #[test]
    fn finds_audio_and_timing_next_to_a_document() {
        let root = std::env::temp_dir().join("mark-audio-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("audio")).unwrap();
        fs::write(root.join("h01.md"), "# x").unwrap();
        fs::write(root.join("h01.mp3"), "abc").unwrap();
        fs::write(root.join("h02.md"), "# y").unwrap();
        fs::write(root.join("audio").join("h02.wav"), "wav").unwrap();
        fs::write(root.join("h02.words.json"), "{\"woorden\":[]}").unwrap();

        let beside = find_audio(root.join("h01.md").to_string_lossy().to_string()).unwrap();
        assert!(beside.replace('\\', "/").ends_with("h01.mp3"));
        let nested = find_audio(root.join("h02.md").to_string_lossy().to_string()).unwrap();
        assert!(nested.replace('\\', "/").ends_with("audio/h02.wav"));
        assert!(find_audio(root.join("missing.md").to_string_lossy().to_string()).is_none());

        let timing = read_timing(root.join("h02.md").to_string_lossy().to_string()).unwrap();
        assert!(timing.contains("woorden"));
        assert!(read_timing(root.join("h01.md").to_string_lossy().to_string()).is_none());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn skips_flags_when_picking_a_launch_path() {
        let args = vec!["mark.exe".into(), "--".into(), "notes.md".into()];
        // "--" starts with '-', so the file after it is the one we open.
        assert_eq!(first_user_path(&args).as_deref(), Some("notes.md"));
    }
}
