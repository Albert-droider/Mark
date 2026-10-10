use super::storage::write_new;
use flate2::{bufread::GzDecoder, write::GzEncoder, Compression};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
};

const GZIP_OVERHEAD_BYTES: u64 = 8192;
const MIN_SNAPSHOT_SAVING: usize = 32;

pub(super) struct SnapshotIdentity {
    pub created_at: u64,
    pub logical_bytes: Option<u64>,
}

pub(super) fn describe_snapshot(name: &str) -> Option<SnapshotIdentity> {
    let (stem, logical_bytes) = if let Some(compressed) = name.strip_suffix(".md.gz") {
        let (stem, size) = compressed.rsplit_once('.')?;
        if size.len() != 8 || !size.bytes().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        let bytes = u64::from_str_radix(size, 16).ok()?;
        if bytes > crate::MAX_TEXT_BYTES {
            return None;
        }
        (stem, Some(bytes))
    } else {
        (name.strip_suffix(".md")?, None)
    };
    let (stamp, counter) = stem.split_once('-')?;
    if stamp.len() != 20
        || counter.len() != 16
        || !stamp.bytes().all(|c| c.is_ascii_digit())
        || !counter.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return None;
    }
    Some(SnapshotIdentity {
        created_at: stamp.parse().ok()?,
        logical_bytes,
    })
}

pub(super) fn read_snapshot(path: &Path) -> Result<Vec<u8>, String> {
    let identity = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(describe_snapshot)
        .ok_or("Invalid version identifier.")?;
    if !std::fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_file()
    {
        return Err("This version is not a regular file.".into());
    }
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut stored = Vec::new();
    file.take(crate::MAX_TEXT_BYTES + GZIP_OVERHEAD_BYTES + 1)
        .read_to_end(&mut stored)
        .map_err(|e| e.to_string())?;
    if stored.len() as u64 > crate::MAX_TEXT_BYTES + GZIP_OVERHEAD_BYTES {
        return Err("Stored version exceeds the size limit.".into());
    }
    let bytes = match identity.logical_bytes {
        Some(size) => decode_snapshot(&stored, size)?,
        None if stored.len() as u64 <= crate::MAX_TEXT_BYTES => stored,
        None => return Err("Stored version exceeds the size limit.".into()),
    };
    crate::decode_text(&bytes)?;
    Ok(bytes)
}

fn decode_snapshot(stored: &[u8], expected_bytes: u64) -> Result<Vec<u8>, String> {
    // Bound output before allocating it: a forged gzip cannot expand past its declared size.
    let mut decoded = Vec::new();
    let mut decoder = GzDecoder::new(stored);
    decoder
        .by_ref()
        .take(expected_bytes + 1)
        .read_to_end(&mut decoded)
        .map_err(|_| "Compressed version is corrupt.")?;
    if decoded.len() as u64 != expected_bytes {
        return Err("Compressed version size does not match its metadata.".into());
    }
    if !decoder.get_ref().is_empty() {
        return Err("Compressed version contains unexpected trailing data.".into());
    }
    Ok(decoded)
}

pub(super) struct PreparedSnapshot {
    pub suffix: String,
    pub contents: Vec<u8>,
}

pub(super) fn prepare_snapshot(bytes: &[u8]) -> Result<PreparedSnapshot, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(bytes).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;
    if compressed.len().saturating_add(MIN_SNAPSHOT_SAVING) < bytes.len() {
        Ok(PreparedSnapshot {
            suffix: format!(".{:08x}.md.gz", bytes.len()),
            contents: compressed,
        })
    } else {
        Ok(PreparedSnapshot {
            suffix: ".md".into(),
            contents: bytes.to_vec(),
        })
    }
}

pub(super) fn write_prepared_snapshot(
    dir: &Path,
    name: &str,
    snapshot: &PreparedSnapshot,
) -> Result<(), String> {
    write_new(&dir.join(name), &snapshot.contents)
}
