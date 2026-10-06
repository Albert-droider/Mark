// Workspace folder + the audio that belongs to a document.
//
// Everything that touches the disk goes through Rust commands (see
// src-tauri/src/lib.rs). The scoped Tauri filesystem plugin is deliberately not
// used: the paths here come from a folder the user picked, which can live on any
// drive, and the plugin would need a matching scope entry for each of them.

import { isTauri } from "./platform";

/** One document inside the workspace folder (mirrors `WorkspaceFile` in Rust). */
export interface WorkspaceFile {
  /** Absolute path. */
  path: string;
  /** Path relative to the workspace root, forward slashes. */
  rel: string;
  /** File name only. */
  name: string;
}

/** Documents of one folder, in the order the sidebar shows them. */
export interface WorkspaceGroup {
  /** Folder path relative to the root; "" for documents in the root itself. */
  folder: string;
  files: WorkspaceFile[];
}

const MAX_ENTRIES = 5000;

export async function listWorkspace(root: string): Promise<WorkspaceFile[]> {
  if (!isTauri || !root) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<WorkspaceFile[]>("list_workspace", { root, maxEntries: MAX_ENTRIES });
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Choose a workspace folder",
  });
  return typeof picked === "string" && picked ? picked : null;
}

/** Audio next to the document (or in an `audio/` folder beside it), if any. */
export async function findAudio(path: string): Promise<string | null> {
  if (!isTauri || !path) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string | null>("find_audio", { path });
}

/** Read an audio file as an object URL. Object URLs are revoked by the caller. */
export async function audioObjectUrl(path: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  // The Rust side answers with raw bytes (tauri::ipc::Response), so this arrives
  // as an ArrayBuffer. Base64 through the JSON channel would be ~33% bigger and
  // a 30-minute chapter is not a small file.
  const bytes = await invoke<ArrayBuffer>("read_audio_file", { path });
  return URL.createObjectURL(new Blob([bytes], { type: mimeFor(path) }));
}

function mimeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (
    { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg" }[ext] ??
    "audio/mpeg"
  );
}

/** Turn a flat list into folder groups, keeping the incoming (sorted) order. */
export function groupByFolder(files: WorkspaceFile[]): WorkspaceGroup[] {
  const groups: WorkspaceGroup[] = [];
  const index = new Map<string, WorkspaceGroup>();
  for (const file of files) {
    const cut = file.rel.lastIndexOf("/");
    const folder = cut < 0 ? "" : file.rel.slice(0, cut);
    let group = index.get(folder);
    if (!group) {
      group = { folder, files: [] };
      index.set(folder, group);
      groups.push(group);
    }
    group.files.push(file);
  }
  return groups;
}
