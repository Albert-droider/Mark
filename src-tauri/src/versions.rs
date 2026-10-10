use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

pub const RETENTION_MS: u64 = 30 * 24 * 60 * 60 * 1000;
pub const DEFAULT_BUDGET_BYTES: u64 = 1024 * 1024 * 1024;
mod budget;
mod snapshots;
mod source;
mod storage;
use budget::{projected_usage, validated_limit, DocumentStorageUsage};
use snapshots::read_snapshot;
use storage::{
    document_id, history_dir, list_versions, parse_version, prune_versions, read_bytes,
    save_document, snapshot,
};

#[derive(Default)]
pub struct DocumentRegistry {
    paths: Mutex<HashMap<String, PathBuf>>,
    gate: Arc<Mutex<()>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    pub id: String,
    pub source: String,
    pub has_unapplied_version: bool,
    pub storage: DocumentStorageUsage,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDocument {
    pub saved_at: u64,
    pub storage: DocumentStorageUsage,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersion {
    pub id: String,
    pub created_at: u64,
    pub bytes: u64,
}
#[derive(Serialize, Deserialize)]
struct Record {
    format: String,
    version: u8,
    path: String,
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|t| t.as_millis() as u64)
        .map_err(|e| e.to_string())
}
fn registered(state: &DocumentRegistry, id: &str) -> Result<PathBuf, String> {
    state
        .paths
        .lock()
        .map_err(|_| "Document registry is unavailable.")?
        .get(id)
        .cloned()
        .ok_or_else(|| "Open this Markdown document before editing it.".into())
}
fn version_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("document-versions-v1"))
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn open_versioned_document(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentRegistry>,
    path: String,
    budget_bytes: Option<u64>,
) -> Result<OpenedDocument, String> {
    let limit = validated_limit(budget_bytes)?;
    let root = version_root(&app)?;
    let gate = state.gate.clone();
    let (opened, path) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Document saving is unavailable.")?;
        let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "md" | "markdown" | "mdown" | "mkd" | "mkdn" | "mdx"
        ) {
            return Err("Only Markdown documents can be edited in place.".into());
        }
        let bytes = read_bytes(&path)?;
        let dir = history_dir(&root, &path)?;
        let now = now_ms()?;
        if list_versions(&dir)?.is_empty() {
            snapshot(&dir, &bytes, now, limit)?;
        }
        prune_versions(&dir, now)?;
        let latest = list_versions(&dir)?.remove(0);
        let opened = OpenedDocument {
            id: document_id(&path)?,
            source: crate::decode_text(&bytes)?,
            has_unapplied_version: read_snapshot(&dir.join(latest.id))? != bytes,
            storage: projected_usage(&dir, bytes.len() as u64, 0, limit)?,
        };
        Ok::<_, String>((opened, path))
    })
    .await
    .map_err(|e| e.to_string())??;
    state
        .paths
        .lock()
        .map_err(|_| "Document registry is unavailable.")?
        .insert(opened.id.clone(), path);
    Ok(opened)
}
#[tauri::command]
pub async fn save_versioned_document(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentRegistry>,
    id: String,
    expected: String,
    source: String,
    budget_bytes: Option<u64>,
) -> Result<SavedDocument, String> {
    let limit = validated_limit(budget_bytes)?;
    let path = registered(&state, &id)?;
    let root = version_root(&app)?;
    let gate = state.gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Document saving is unavailable.")?;
        save_document(&root, &path, &expected, &source, now_ms()?, limit)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn list_document_versions(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentRegistry>,
    id: String,
) -> Result<Vec<DocumentVersion>, String> {
    let path = registered(&state, &id)?;
    let root = version_root(&app)?;
    let gate = state.gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Document saving is unavailable.")?;
        let dir = history_dir(&root, &path)?;
        prune_versions(&dir, now_ms()?)?;
        list_versions(&dir)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_document_version(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentRegistry>,
    id: String,
    version: String,
) -> Result<String, String> {
    let path = registered(&state, &id)?;
    let root = version_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if parse_version(&version).is_none() {
            return Err("Invalid version identifier.".into());
        }
        let dir = history_dir(&root, &path)?;
        if !list_versions(&dir)?.iter().any(|item| item.id == version) {
            return Err("This version is unavailable.".into());
        }
        crate::decode_text(&read_snapshot(&dir.join(version))?)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;
