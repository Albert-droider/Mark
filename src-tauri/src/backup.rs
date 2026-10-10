use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

const MAX_BACKUP_BYTES: usize = 64 * 1024 * 1024;

fn validate_backup(contents: &str) -> Result<(), String> {
    if contents.len() > MAX_BACKUP_BYTES {
        return Err("This backup is larger than 64 MB.".into());
    }
    let value: serde_json::Value = serde_json::from_str(contents).map_err(|e| e.to_string())?;
    let entries = value["entries"].as_object();
    if value["format"] != "mark-reader-backup"
        || value["version"] != 1
        || value["includesSourceFiles"] != false
        || !value["complete"].is_boolean()
        || entries.is_none_or(|entries| entries.values().any(|v| !v.is_null() && !v.is_string()))
    {
        return Err("Invalid reader backup envelope.".into());
    }
    Ok(())
}

fn write_reader_backup(path: &Path, contents: &str) -> Result<(), String> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        return Err("Choose a new JSON file for the backup.".into());
    }
    validate_backup(contents)?;
    // A backup must never overwrite an existing source or a previous backup.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Could not create a new backup file: {e}. Choose a new filename."))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Backup was not fully saved: {e}"))
}

/** The destination comes from a native user dialog, never a renderer path. */
#[tauri::command]
pub async fn export_reader_backup(
    app: tauri::AppHandle,
    contents: String,
) -> Result<Option<String>, String> {
    validate_backup(&contents)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Export reader backup — choose a new file")
            .set_file_name("mark-reader-backup.json")
            .add_filter("Reader backup", &["json"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        write_reader_backup(&path, &contents)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn folder() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("mark-backup-{unique}"));
        fs::create_dir(&root).unwrap();
        root
    }
    fn contents() -> &'static str {
        r#"{"format":"mark-reader-backup","version":1,"includesSourceFiles":false,"complete":true,"entries":{"mark.highlights.v1":"{broken René"},"errors":[],"sessionDrafts":[]}"#
    }

    #[test]
    fn saves_exact_raw_backup_bytes_in_a_new_json_file() {
        let root = folder();
        let path = root.join("backup.json");
        write_reader_backup(&path, contents()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), contents());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn never_overwrites_an_existing_source_or_backup() {
        let root = folder();
        let path = root.join("existing.json");
        fs::write(&path, "Original source bytes").unwrap();
        assert!(write_reader_backup(&path, contents()).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "Original source bytes");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_non_json_destinations_and_invalid_envelopes_without_creating_files() {
        let root = folder();
        let markdown = root.join("book.md");
        let json = root.join("invalid.json");
        assert!(write_reader_backup(&markdown, contents()).is_err());
        assert!(write_reader_backup(&json, "{}").is_err());
        assert!(!markdown.exists());
        assert!(!json.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
