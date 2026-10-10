use super::storage::{read_bytes, write_new, NONCE};
use std::{fs, path::Path, sync::atomic::Ordering};

pub(super) fn encode_like(original: &[u8], source: &str) -> Vec<u8> {
    if original.starts_with(&[0xff, 0xfe]) || original.starts_with(&[0xfe, 0xff]) {
        let little = original[0] == 0xff;
        let mut bytes = original[..2].to_vec();
        for unit in source.encode_utf16() {
            bytes.extend_from_slice(&if little {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            });
        }
        bytes
    } else {
        let mut bytes = if original.starts_with(&[0xef, 0xbb, 0xbf]) {
            vec![0xef, 0xbb, 0xbf]
        } else {
            Vec::new()
        };
        bytes.extend_from_slice(source.as_bytes());
        bytes
    }
}

/** Best-effort source comparison: other editors must not write concurrently. */
pub(super) fn replace_document(path: &Path, expected: &[u8], bytes: &[u8]) -> Result<(), String> {
    if fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions()
        .readonly()
    {
        return Err(
            "This Markdown file is read-only. Your edits are kept in version history.".into(),
        );
    }
    let temp = path.with_file_name(format!(
        ".mark-write-{}-{}.tmp",
        std::process::id(),
        NONCE.fetch_add(1, Ordering::Relaxed)
    ));
    write_new(&temp, bytes)?;
    let result = (|| {
        fs::set_permissions(
            &temp,
            fs::metadata(path).map_err(|e| e.to_string())?.permissions(),
        )
        .map_err(|e| e.to_string())?;
        if read_bytes(path)? != expected {
            return Err(
                "This file changed during saving. Your edits are kept in version history.".into(),
            );
        }
        // A non-cooperating writer can still change the file after this check.
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        fs::File::open(path.parent().ok_or("Missing parent directory.")?)
            .and_then(|file| file.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = fs::remove_file(temp);
    result
}
