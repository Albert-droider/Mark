use std::fs;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_window_state::StateFlags;

/// Holds a file path passed on the command line at launch (for OS file
/// association / "open with" on first launch).
struct InitialPath(Mutex<Option<String>>);

/// Read a file as UTF-8 text. Used by the frontend instead of the scoped
/// filesystem plugin so any user-selected path can be opened.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{e}"))
}

/// One markdown-ish document inside the workspace folder.
#[derive(serde::Serialize)]
pub struct WorkspaceFile {
    /// Absolute path: used to read the file and to remember its reading position.
    pub path: String,
    /// Path relative to the workspace root, with forward slashes.
    pub rel: String,
    /// File name only.
    pub name: String,
}

/// Folder names that never hold study material and can be big enough to make a
/// naive walk slow.
const SKIP_DIRS: [&str; 8] = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".venv",
    "__pycache__",
    ".obsidian",
];

/// Walk a workspace folder and collect the documents in it, sorted by relative
/// path. Same reasoning as `read_text_file`: the folder is one the user picked
/// themselves, so the scoped filesystem plugin would only get in the way. The
/// walk is iterative with a hard cap, so pointing it at a synced drive root
/// can't hang the window.
#[tauri::command]
fn list_workspace(root: String, max_entries: usize) -> Result<Vec<WorkspaceFile>, String> {
    let root_path = std::path::PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("not a folder: {root}"));
    }
    let cap = if max_entries == 0 { 5000 } else { max_entries };
    let mut out: Vec<WorkspaceFile> = Vec::new();
    let mut queue: std::collections::VecDeque<std::path::PathBuf> =
        std::collections::VecDeque::new();
    queue.push_back(root_path.clone());

    while let Some(dir) = queue.pop_front() {
        if out.len() >= cap {
            break;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // unreadable subfolder: skip it, don't fail the whole list
        };
        for entry in entries.flatten() {
            if out.len() >= cap {
                break; // the cap holds per folder too, not just per folder-tree level
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if path.is_dir() {
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                queue.push_back(path);
            } else if is_document(&name) {
                let rel = path
                    .strip_prefix(&root_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(WorkspaceFile {
                    path: path.to_string_lossy().to_string(),
                    rel,
                    name,
                });
            }
        }
    }

    out.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
    Ok(out)
}

fn is_document(name: &str) -> bool {
    matches!(
        std::path::Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("md") | Some("markdown") | Some("mdx") | Some("txt")
    )
}

/// Find the audio that belongs to a document: next to it, or in an `audio/`
/// folder next to it. Covers both a flat workspace and the "markdown plus an
/// `audio/` folder beside it" layout.
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

/// Read an audio file as raw bytes for the player. Answers with
/// `tauri::ipc::Response`, so the bytes cross the IPC bridge as an ArrayBuffer
/// instead of base64 inside JSON: a chapter mp3 is ~30 MB and base64 would add a
/// third to that.
#[tauri::command]
fn read_audio_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("{e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Read the word timeline that belongs to a document (`<naam>.words.json`, next to
/// the document or in the `audio/` folder next to it). Returns null when there is
/// none: karaoke is optional, the document still reads fine without it.
#[tauri::command]
fn read_timing(path: String) -> Option<String> {
    let doc = std::path::PathBuf::from(&path);
    let stem = doc.file_stem()?.to_string_lossy().to_string();
    let dir = doc.parent()?;
    for cand in [
        dir.join(format!("{stem}.words.json")),
        dir.join("audio").join(format!("{stem}.words.json")),
    ] {
        if cand.is_file() {
            return fs::read_to_string(cand).ok();
        }
    }
    None
}

/// Return (and clear) a path passed on the command line at startup.
#[tauri::command]
fn initial_path(state: tauri::State<InitialPath>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A workspace walk is easy to get subtly wrong (skip lists, relative paths,
    /// audio resolution), so it gets one real check on a real folder tree.
    #[test]
    fn lists_documents_and_resolves_their_audio() {
        let root = std::env::temp_dir().join("mark-workspace-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::create_dir_all(root.join("sub/audio")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("h00.md"), "# x").unwrap();
        fs::write(root.join("note.txt"), "x").unwrap();
        fs::write(root.join("plaatje.png"), "x").unwrap();
        fs::write(root.join("sub/h01.md"), "x").unwrap();
        fs::write(root.join("sub/audio/h01.mp3"), "x").unwrap();
        fs::write(root.join("node_modules/slop.md"), "x").unwrap();
        fs::write(root.join(".git/HEAD.md"), "x").unwrap();

        let files = list_workspace(root.to_string_lossy().to_string(), 100).unwrap();
        let rels: Vec<&str> = files.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(rels, vec!["h00.md", "note.txt", "sub/h01.md"]);

        // Audio in an `audio/` folder beside the document.
        let audio = find_audio(root.join("sub/h01.md").to_string_lossy().to_string());
        assert!(audio.is_some(), "audio/ folder next to the document should be found");
        assert!(audio.unwrap().replace('\\', "/").ends_with("sub/audio/h01.mp3"));

        // No audio for a document that has none.
        assert!(find_audio(root.join("h00.md").to_string_lossy().to_string()).is_none());

        // A folder that isn't a folder is an error, not an empty list.
        assert!(list_workspace(root.join("h00.md").to_string_lossy().to_string(), 100).is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn caps_the_list() {
        let root = std::env::temp_dir().join("mark-workspace-cap");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        for i in 0..20 {
            fs::write(root.join(format!("f{i:02}.md")), "x").unwrap();
        }
        let files = list_workspace(root.to_string_lossy().to_string(), 5).unwrap();
        assert_eq!(files.len(), 5);
        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture a file path passed as the first argument (first launch).
    let initial = std::env::args().nth(1).filter(|s| !s.is_empty());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second instance was launched (e.g. user double-clicked a .md
            // file while Mark is already running). Forward the path.
            if let Some(path) = args.get(1) {
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
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            list_workspace,
            find_audio,
            read_audio_file,
            read_timing,
            initial_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mark");
}
