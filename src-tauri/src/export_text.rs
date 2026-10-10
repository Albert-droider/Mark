use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;
fn extension(kind: &str) -> Result<&'static str, String> {
    match kind {
        "markdown" => Ok("md"),
        "csv" => Ok("csv"),
        "context" => Ok("json"),
        _ => Err("Unsupported export format".into()),
    }
}
fn validate(contents: &str, kind: &str) -> Result<(), String> {
    extension(kind)?;
    if contents.len() > MAX_EXPORT_BYTES {
        return Err("Export is larger than 16 MB".into());
    }
    if kind == "context" {
        let data: serde_json::Value =
            serde_json::from_str(contents).map_err(|_| "Invalid context JSON")?;
        if data["format"] != "mark-context"
            || data["version"] != 1
            || data["includesFullSource"] != false
        {
            return Err("Invalid MARK context envelope".into());
        }
    }
    Ok(())
}
fn write_new_export(path: &Path, contents: &str, kind: &str) -> Result<(), String> {
    validate(contents, kind)?;
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension(kind).unwrap_or("")))
    {
        return Err("The destination extension does not match the export format".into());
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|error| format!("Could not create a new export file: {error}. Existing files are never overwritten."))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!("Export could not be completed: {error}. A partial new file may remain.")
        })
}

/** The renderer supplies content, not a destination path. Only the native user's
 * selected new file can be written, and acknowledgement follows sync_all. */
#[tauri::command]
pub async fn export_reader_text(
    app: tauri::AppHandle,
    contents: String,
    name: String,
    kind: String,
) -> Result<Option<String>, String> {
    validate(&contents, &kind)?;
    if name.is_empty() || name.len() > 160 || name.contains(['/', '\\', '\0']) {
        return Err("Invalid export filename".into());
    }
    let ext = extension(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_file_name(&name)
            .add_filter("MARK export", &[ext])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|error| format!("Invalid export destination: {error}"))?;
        write_new_export(&path, &contents, &kind)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| format!("Export task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exports_utf8_without_overwriting_existing_source() {
        let path = std::env::temp_dir().join(format!(
            "mark-export-{}-{}.md",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let content = "# Notitie\n\nEigen uitleg — met code.\n";
        write_new_export(&path, content, "markdown").unwrap();
        assert!(write_new_export(&path, "replacement", "markdown").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn rejects_wrong_format_and_extension_before_creating_files() {
        let path =
            std::env::temp_dir().join(format!("mark-invalid-export-{}.exe", std::process::id()));
        assert!(write_new_export(&path, "# doc", "markdown").is_err());
        assert!(write_new_export(&path, "{}", "context").is_err());
        assert!(write_new_export(&path, "payload", "executable").is_err());
        assert!(!path.exists());
    }
    #[test]
    fn validates_the_context_envelope_and_size() {
        assert!(validate(
            r#"{"format":"mark-context","version":1,"includesFullSource":false}"#,
            "context"
        )
        .is_ok());
        assert!(validate(
            r#"{"format":"mark-context","version":1,"includesFullSource":true}"#,
            "context"
        )
        .is_err());
        assert!(validate(&"x".repeat(MAX_EXPORT_BYTES + 1), "markdown").is_err());
    }
}
