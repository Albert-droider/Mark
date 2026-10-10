import { DocumentSession, type DocumentStore, type DocumentStatus } from "./document-session";
import type { LoadedFile } from "./types";
import type { Viewer } from "./viewer";
import type { SourceChangePhase } from "./in-place-reader";

interface ReaderDocumentActions {
  status: (status: DocumentStatus) => void;
  changed: (file: LoadedFile, phase: SourceChangePhase) => void;
}

/** File transitions cannot discard pending Markdown or an unacknowledged write. */
export class ReaderDocuments {
  readonly session: DocumentSession;
  constructor(private viewer: Viewer, private store: DocumentStore, actions: ReaderDocumentActions) {
    this.session = new DocumentSession(store, actions.status);
    viewer.onSourceChange = (file, phase) => { this.session.change(file.source); actions.changed(file, phase); };
  }
  async open(file: LoadedFile, current: () => boolean): Promise<LoadedFile | null> {
    if (!this.viewer.capturePendingNote() || !await this.session.flush() || !current()) return null;
    const binding = file.kind === "markdown" ? await this.store.open(file) : null;
    if (!current() || !await this.session.flush() || !current()) return null;
    this.session.bind(binding);
    this.viewer.setEditable(binding != null);
    return binding ? { ...file, source: binding.source } : file;
  }
  async close(current: () => boolean): Promise<boolean> {
    if (!this.viewer.capturePendingNote() || !await this.session.flush() || !current()) return false;
    this.session.bind(null); this.viewer.setEditable(false);
    return true;
  }
  get canReload(): boolean { return !this.session.dirty && !this.viewer.isEditing; }
  dispose(): void { this.session.dispose(); this.viewer.onSourceChange = null; }
}
