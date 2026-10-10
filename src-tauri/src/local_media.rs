use std::fs;

const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 80 * 1024 * 1024;
const MAX_TIMING_BYTES: u64 = 4 * 1024 * 1024;

/// Local images as a data URL. The webview origin can't load a relative src.
#[tauri::command]
pub(crate) fn read_image_file(path: String) -> Result<String, String> {
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
pub(crate) fn find_audio(path: String) -> Option<String> {
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
pub(crate) fn read_audio_file(path: String) -> Result<tauri::ipc::Response, String> {
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
pub(crate) fn read_timing(path: String) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_of_hi() {
        assert_eq!(base64_encode(b"hi"), "aGk=");
    }

    #[test]
    fn finds_audio_and_timing_next_to_a_document() {
        let root = std::env::temp_dir().join(format!(
            "mark-audio-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
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
}
