import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";
import type { DocumentBinding, DocumentStore, DocumentVersion } from "./document-session";
import { BrowserDocumentStore } from "./browser-documents";
import { getSettings } from "./store";
import { MEBIBYTE, type DocumentStorageUsage } from "./document-budget";

class NativeDocumentStore implements DocumentStore {
  constructor(private readBudget: () => number) {}
  open(file: { path: string }): Promise<DocumentBinding> { return invoke("open_versioned_document", { path: file.path, budgetBytes: this.readBudget() }); }
  save(id: string, change: { expected: string; source: string }): Promise<{ savedAt: number; storage?: DocumentStorageUsage }> {
    return invoke("save_versioned_document", { id, ...change, budgetBytes: this.readBudget() });
  }
  versions(id: string): Promise<DocumentVersion[]> { return invoke("list_document_versions", { id }); }
  read(id: string, version: string): Promise<string> { return invoke("read_document_version", { id, version }); }
}
export function createDocumentStore(readBudget: () => number = () => getSettings().documentBudgetMiB * MEBIBYTE): DocumentStore {
  return isTauri ? new NativeDocumentStore(readBudget) : new BrowserDocumentStore(readBudget);
}
