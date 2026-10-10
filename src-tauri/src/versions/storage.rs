use super::budget::{projected_usage, require_budget};
use super::snapshots::{
    describe_snapshot, prepare_snapshot, read_snapshot, write_prepared_snapshot, PreparedSnapshot,
};
pub(super) use super::source::encode_like;
use super::source::replace_document;
use super::{DocumentVersion, Record, SavedDocument, RETENTION_MS};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
pub(super) static NONCE: AtomicU64 = AtomicU64::new(0);

fn document_key(path: &Path) -> Result<String, String> {
    let path = path.to_str().ok_or("This path is not valid Unicode.")?;
    Ok(if cfg!(windows) {
        path.to_lowercase()
    } else {
        path.to_owned()
    })
}
pub(super) fn document_id(path: &Path) -> Result<String, String> {
    // Collision detection uses the full canonical path in document.json. This is not an access token.
    let hash = document_key(path)?
        .bytes()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
        });
    Ok(format!("{hash:016x}"))
}
pub(super) fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > crate::MAX_TEXT_BYTES {
        return Err("Not a Markdown file within the 16 MB limit.".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > crate::MAX_TEXT_BYTES {
        return Err("This file is larger than 16 MB.".into());
    }
    crate::decode_text(&bytes)?;
    Ok(bytes)
}
pub(super) fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let result = file
        .write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string());
    drop(file);
    if result.is_err() {
        let _ = fs::remove_file(path);
    }
    result
}
pub(super) fn history_dir(root: &Path, path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    if path.starts_with(fs::canonicalize(root).map_err(|e| e.to_string())?) {
        return Err("Version snapshots are read-only. Restore one through Version history.".into());
    }
    let dir = root.join(document_id(path)?);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(&dir)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Version directory must not be a symbolic link.".into());
    }
    let record_path = dir.join("document.json");
    let key = document_key(path)?;
    if record_path.exists() {
        let record: Record =
            serde_json::from_slice(&fs::read(&record_path).map_err(|e| e.to_string())?)
                .map_err(|_| "Unsupported version metadata.")?;
        if record.format != "mark-document-versions" || record.version != 1 || record.path != key {
            return Err("Version directory identity does not match this document.".into());
        }
    } else {
        write_new(
            &record_path,
            &serde_json::to_vec(&Record {
                format: "mark-document-versions".into(),
                version: 1,
                path: key,
            })
            .map_err(|e| e.to_string())?,
        )?;
    }
    Ok(dir)
}
pub(super) fn parse_version(name: &str) -> Option<u64> {
    describe_snapshot(name).map(|identity| identity.created_at)
}
pub(super) fn list_versions(dir: &Path) -> Result<Vec<DocumentVersion>, String> {
    let mut versions = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        let Some(created_at) = parse_version(&id) else {
            continue;
        };
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if meta.file_type().is_file() {
            let bytes = describe_snapshot(&id)
                .and_then(|identity| identity.logical_bytes)
                .unwrap_or(meta.len());
            versions.push(DocumentVersion {
                id,
                created_at,
                bytes,
            });
        }
    }
    versions.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(versions)
}
pub(super) fn prune_versions(dir: &Path, now: u64) -> Result<usize, String> {
    let versions = list_versions(dir)?;
    let cutoff = now.saturating_sub(RETENTION_MS);
    let mut removed = 0;
    for version in versions
        .iter()
        .skip(1)
        .filter(|version| version.created_at < cutoff)
    {
        fs::remove_file(dir.join(&version.id)).map_err(|e| e.to_string())?;
        removed += 1;
    }
    Ok(removed)
}
struct PlannedVersion {
    version: DocumentVersion,
    payload: Option<PreparedSnapshot>,
}
impl PlannedVersion {
    fn added_bytes(&self) -> u64 {
        self.payload.as_ref().map_or(0, |p| p.contents.len() as u64)
    }
    fn write(&self, dir: &Path) -> Result<(), String> {
        if let Some(payload) = &self.payload {
            write_prepared_snapshot(dir, &self.version.id, payload)?;
        }
        Ok(())
    }
}
fn plan_snapshot(dir: &Path, bytes: &[u8], now: u64) -> Result<PlannedVersion, String> {
    let versions = list_versions(dir)?;
    if let Some(latest) = versions.first() {
        if read_snapshot(&dir.join(&latest.id))? == bytes {
            return Ok(PlannedVersion {
                version: latest.clone(),
                payload: None,
            });
        }
    }
    // Keep newest ordering reliable even when the system clock moves backwards.
    let stamp = versions
        .first()
        .map_or(now, |last| now.max(last.created_at.saturating_add(1)));
    let stem = format!("{stamp:020}-{:016x}", NONCE.fetch_add(1, Ordering::Relaxed));
    let payload = prepare_snapshot(bytes)?;
    let version = DocumentVersion {
        id: format!("{stem}{}", payload.suffix),
        created_at: stamp,
        bytes: bytes.len() as u64,
    };
    Ok(PlannedVersion {
        version,
        payload: Some(payload),
    })
}
pub(super) fn snapshot(
    dir: &Path,
    bytes: &[u8],
    now: u64,
    limit_bytes: u64,
) -> Result<DocumentVersion, String> {
    let planned = plan_snapshot(dir, bytes, now)?;
    require_budget(&projected_usage(
        dir,
        bytes.len() as u64,
        planned.added_bytes(),
        limit_bytes,
    )?)?;
    planned.write(dir)?;
    Ok(planned.version)
}
pub(super) fn save_document(
    root: &Path,
    path: &Path,
    expected: &str,
    source: &str,
    now: u64,
    limit_bytes: u64,
) -> Result<SavedDocument, String> {
    let original = read_bytes(path)?;
    let dir = history_dir(root, path)?;
    let bytes = encode_like(&original, source);
    if bytes.len() as u64 > crate::MAX_TEXT_BYTES {
        return Err("Edited Markdown is larger than 16 MB.".into());
    }
    let initial = if bytes != original && list_versions(&dir)?.is_empty() {
        Some(plan_snapshot(&dir, &original, now.saturating_sub(1))?)
    } else {
        None
    };
    let planned = plan_snapshot(&dir, &bytes, now)?;
    let added = planned
        .added_bytes()
        .checked_add(initial.as_ref().map_or(0, PlannedVersion::added_bytes))
        .ok_or("Document byte count overflow.")?;
    let projected = projected_usage(
        &dir,
        original.len().max(bytes.len()) as u64,
        added,
        limit_bytes,
    )?;
    require_budget(&projected)?;
    if let Some(initial) = initial {
        initial.write(&dir)?;
    }
    planned.write(&dir)?;
    if crate::decode_text(&original)? != expected {
        return Err("This Markdown file changed outside MARK. Your edits are kept in version history; reload or export before retrying.".into());
    }
    if bytes != original {
        replace_document(path, &original, &bytes)?;
    }
    // A cleanup failure must not report that a successfully written document is unsaved.
    if let Err(error) = prune_versions(&dir, now) {
        eprintln!("MARK version cleanup: {error}");
    }
    let storage = projected_usage(&dir, bytes.len() as u64, 0, limit_bytes).unwrap_or(projected);
    Ok(SavedDocument {
        saved_at: planned.version.created_at,
        storage,
    })
}
