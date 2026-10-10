use serde::Serialize;
use std::{fs, path::Path};

use super::DEFAULT_BUDGET_BYTES;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentStorageUsage {
    pub used_bytes: u64,
    pub limit_bytes: u64,
    pub warning: bool,
}

pub(super) fn validated_limit(value: Option<u64>) -> Result<u64, String> {
    let limit = value.unwrap_or(DEFAULT_BUDGET_BYTES);
    if !(64 * 1024 * 1024..=16 * DEFAULT_BUDGET_BYTES).contains(&limit) {
        return Err("Invalid document storage budget. Choose 64 to 16384 MiB in Settings.".into());
    }
    Ok(limit)
}

pub(super) fn projected_usage(
    dir: &Path,
    source_bytes: u64,
    added_bytes: u64,
    limit_bytes: u64,
) -> Result<DocumentStorageUsage, String> {
    let mut used_bytes = source_bytes
        .checked_add(added_bytes)
        .ok_or("Document byte count overflow.")?;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if metadata.file_type().is_file() {
            used_bytes = used_bytes
                .checked_add(metadata.len())
                .ok_or("Document byte count overflow.")?;
        }
    }
    Ok(DocumentStorageUsage {
        used_bytes,
        limit_bytes,
        warning: u128::from(used_bytes) * 5 >= u128::from(limit_bytes) * 4,
    })
}

pub(super) fn require_budget(usage: &DocumentStorageUsage) -> Result<(), String> {
    if usage.used_bytes > usage.limit_bytes {
        return Err("Document storage budget exceeded. Increase the limit in Settings or export Markdown. Existing source and history were not changed.".into());
    }
    Ok(())
}
