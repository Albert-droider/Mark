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

let service: FileService | null = null;
export function getFileService(): FileService {
  if (!service) service = isTauri ? new TauriFileService() : new BrowserFileService();
  return service;
}
