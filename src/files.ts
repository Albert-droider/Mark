import type { LoadedFile } from "./types";
import { detectKind } from "./renderer";
import { basename } from "./util";
import { isTauri } from "./platform";

export interface FileService {
  pick(): Promise<LoadedFile | null>;
  readPath(path: string): Promise<LoadedFile>;
}

/** Convert a browser File/Blob into a LoadedFile. */
export function blobToLoaded(file: File): Promise<LoadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        path: "",
        name: file.name,
        source: String(reader.result ?? ""),
        kind: detectKind(file.name),
      });
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

class TauriFileService implements FileService {
  async pick(): Promise<LoadedFile | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Markdown & Text",
          extensions: ["md", "markdown", "mdown", "mkd", "mkdn", "mdx", "txt", "text"],
        },
      ],
    });
    const path = typeof selected === "string" ? selected : null;
    if (!path) return null;
    const source = await invoke<string>("read_text_file", { path });
    const name = basename(path);
    return { path, name, source, kind: detectKind(name) };
  }

  async readPath(path: string): Promise<LoadedFile> {
    const { invoke } = await import("@tauri-apps/api/core");
    const source = await invoke<string>("read_text_file", { path });
    const name = basename(path);
    return { path, name, source, kind: detectKind(name) };
  }
}

class BrowserFileService implements FileService {
  pick(): Promise<LoadedFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.markdown,.mdown,.mkd,.mkdn,.mdx,.txt,.text,text/markdown,text/plain";
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) {
          resolve(null);
          return;
        }
        blobToLoaded(f).then(resolve, () => resolve(null));
      };
      input.click();
    });
  }

  async readPath(_path: string): Promise<LoadedFile> {
    throw new Error("Reading by path is only available in the desktop app.");
  }
}

/** Image bytes as a data URL. Relative pictures can't load from the webview origin. */
export async function loadImageDataUrl(path: string): Promise<string> {
  if (!isTauri) throw new Error("Local images open in the desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_image_file", { path });
}

/** Audio next to the document, or in an `audio/` folder beside it. */
export async function findAudio(path: string): Promise<string | null> {
  if (!isTauri || !path) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("find_audio", { path });
}

/** Word timeline `<naam>.words.json`, or null when the document has no narration. */
export async function loadTiming(path: string): Promise<string | null> {
  if (!isTauri || !path) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_timing", { path });
}

/** Read an audio file as an object URL. The caller revokes it. */
export async function audioObjectUrl(path: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<ArrayBuffer>("read_audio_file", { path });
  return URL.createObjectURL(new Blob([bytes], { type: audioMime(path) }));
}

function audioMime(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "mp3": return "audio/mpeg";
    case "m4a": return "audio/mp4";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    default: return "audio/mpeg";
  }
}

/** Milliseconds since the epoch, for the reload-when-changed poll. */
export async function fileMtime(path: string): Promise<number> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<number>("file_mtime_ms", { path });
}

let service: FileService | null = null;
export function getFileService(): FileService {
  if (!service) service = isTauri ? new TauriFileService() : new BrowserFileService();
  return service;
}
