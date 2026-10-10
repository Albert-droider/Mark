import type { LoadedFile } from "./types";
import { DraftStore, newDraft, newDocumentDraft, type NoteDraft } from "./drafts";
import { NoteEditor, type NoteEntry } from "./note-editor";
import { getHighlights, groupNote, saveHighlightNote, type Anchor } from "./highlights";
import { clearStorageIssue, reportStorageIssue } from "./reader-storage";
import { exportText } from "./export-text";
import { isTauri } from "./platform";
import { isDocumentPath } from "./util";

export interface LegacyDraftActions {
  key(): string; file(): LoadedFile | null; attempt(action: () => unknown): boolean;
  report(message: string): void; marksChanged(): void; annotationsChanged(): void;
  refreshRecovery(): void; hideSelection(): void; hideRecovery(): void; showRecovery(): void;
  openFile(path: string): void; editGroup(group: string): void; editorVisibility(open: boolean): void;
}

/** Compatibility workspace for existing drafts; not the default source-note editor. */
export class LegacyNoteWorkspace {
  readonly root: HTMLElement;
  private editor: NoteEditor;
  private noteInput: HTMLTextAreaElement;
  private activeDraft: NoteDraft | null = null;
  constructor(private context: LegacyDraftActions, readonly drafts: DraftStore) {
    this.editor = new NoteEditor({
      change: () => this.captureDraft(), save: () => this.saveNote(), close: () => this.closeEditor(),
      create: () => this.createDocument(), export: () => { void this.exportNote(); },
      recovery: () => this.context.showRecovery(), browse: () => this.browseNotes(),
      visibility: open => this.context.editorVisibility(open),
    });
    this.noteInput = this.editor.input; this.root = this.editor.root;
    document.body.append(this.root);
  }
  private get key(): string { return this.context.key(); }
  private get current(): LoadedFile | null { return this.context.file(); }
  private attempt(action: () => unknown): boolean { return this.context.attempt(action); }
  captureChanged(): void {
    if (this.activeDraft && this.noteInput.value !== this.activeDraft.text) this.captureDraft();
  }
  openPassage(group: string | null, anchors: Anchor[]): void {
    if (!group && !anchors.length) return;
    const previous = this.drafts.list(this.key).find(draft => group ? draft.group === group
      : !draft.group && JSON.stringify(draft.anchors) === JSON.stringify(anchors));
    this.closeEditor(false);
    this.activeDraft = previous ?? newDraft(this.key, group, anchors, group ? groupNote(this.key, group) : "");
    this.editor.open(this.activeDraft.text, `Note · ${this.current!.name}`, anchors.map(anchor => anchor.text).join(""));
    this.context.hideSelection();
    this.draftStatus(previous ? "Draft recovered. Save attaches it to the passage." : "Write in Markdown. Changes are kept as a draft; Save attaches the note.");
  }
  dispose(): void { this.closeEditor(false); this.editor.dispose(); }


  createDocument(): void {
    this.closeEditor(false);
    const name = "Untitled.md";
    this.activeDraft = newDocumentDraft(name, "# Untitled note\n\n");
    this.editor.open(this.activeDraft.text, name, "", true);
    this.captureDraft();
  }


  closeEditor(focus = true): void {
    if (this.activeDraft && this.noteInput.value !== this.activeDraft.text) this.captureDraft();
    this.activeDraft = null; this.editor.hide();
    if (focus) document.querySelector<HTMLButtonElement>(".notes-btn")?.focus({ preventScroll: true });
  }

  private browseNotes(): void {
    this.closeEditor(false); this.refreshNotes(this.drafts.list());
    this.editor.showList();
    this.draftStatus("Passage notes are listed for the open source. Standalone documents are drafts; export them as .md.");
  }

  refreshNotes(drafts: NoteDraft[]): void {
    const entries: NoteEntry[] = drafts.filter(d => d.purpose === "document" || d.fileKey === this.key)
      .sort((a, b) => b.updatedAt - a.updatedAt).map(draft => ({
        title: draft.purpose === "document" ? draft.name! : `Draft · ${draft.text.split(/\r?\n/)[0].slice(0, 60) || "Passage note"}`,
        detail: draft.purpose === "document" ? "Markdown document draft" : draft.anchors.map(a => a.text).join(""),
        open: () => this.resumeDraft(draft),
      }));
    try {
      if (this.key) {
        const groups = new Map<string, { note: string; quote: string }>();
        for (const h of getHighlights(this.key)) {
          const entry = groups.get(h.group) ?? { note: h.note ?? "", quote: "" };
          entry.quote += h.text;
          if (h.note) entry.note = h.note;
          groups.set(h.group, entry);
        }
        for (const [group, entry] of groups) if (entry.note) entries.push({
          title: entry.note.split(/\r?\n/)[0].replace(/^#+\s*/, "").slice(0, 80) || "Passage note",
          detail: entry.quote, open: () => this.context.editGroup(group),
        });
      }
    } catch { /* The recovery surface already reports malformed annotation storage. */ }
    this.editor.setEntries(entries);
  }

  private async exportNote(): Promise<void> {
    const draft = this.activeDraft;
    if (!draft) return;
    const text = this.noteInput.value, name = draft.name ?? "Passage-note.md";
    const stillCurrent = (): boolean => this.activeDraft?.id === draft.id && this.noteInput.value === text;
    try {
      const result = await exportText(text, name, "markdown");
      const message = result === "cancelled" ? "Export cancelled." : result === "saved" ? "Markdown saved to a new file. The source is unchanged." : "Markdown download requested. The source is unchanged.";
      if (stillCurrent()) this.draftStatus(message);
      else this.context.report(`${name}: ${message}`);
      clearStorageIssue("note-export");
    } catch (error) {
      reportStorageIssue(error, "note-export");
      const message = "Export failed. Your note is still available; retry or use the reader backup.";
      if (stillCurrent()) this.draftStatus(message);
      else this.context.report(`${name}: ${message}`);
      this.context.refreshRecovery();
    }
  }


  private draftStatus(message: string): void {
    this.editor.setStatus(message);
  }

  captureDraft(): void {
    if (!this.activeDraft) return;
    this.activeDraft = { ...this.activeDraft, text: this.noteInput.value,
      revision: this.activeDraft.revision + 1, updatedAt: Date.now() };
    if (this.attempt(() => this.drafts.save(this.activeDraft!))) this.draftStatus(this.activeDraft.purpose === "document"
      ? "Document draft saved locally. Export .md to create a file; the source stays unchanged."
      : "Draft saved. Save attaches the note.");
    else this.draftStatus("Not saved: draft is only in this session. Keep MARK open, export, and retry.");
    this.context.refreshRecovery();
  }


  private saveNote(): void {
    if (!this.activeDraft) return;
    if (this.activeDraft.text !== this.noteInput.value) this.captureDraft();
    const draft = this.activeDraft;
    if (draft.purpose === "document") { this.captureDraft(); return; }
    if (!this.attempt(() => saveHighlightNote(draft.fileKey, draft.group ?? draft.id,
      draft.group ? null : draft.anchors, draft.text))) {
      this.draftStatus("Note not saved. Your draft is still available; retry or export.");
      return;
    }
    // Commit happened before cleanup. Reusing draft.id prevents duplicates on retry.
    let removed = false;
    this.attempt(() => { removed = this.drafts.remove(draft.id, draft.revision); });
    this.activeDraft = newDraft(draft.fileKey, draft.group ?? draft.id, draft.anchors, draft.text);
    this.context.hideSelection();
    if (this.key === draft.fileKey) this.context.annotationsChanged();
    window.getSelection()?.removeAllRanges();
    this.context.marksChanged();
    const message = removed ? "Note saved." : "Note saved, but draft cleanup failed. Retry is safe; export before closing.";
    this.context.report(message); this.draftStatus(message);
    this.context.refreshRecovery();
  }

  resumeDraft(draft: NoteDraft): void {
    if (draft.purpose !== "document" && draft.fileKey !== this.key) {
      this.context.report(`Open ${draft.fileKey} first, then resume this draft from Notes & backup.`);
      if (isTauri && isDocumentPath(draft.fileKey)) this.context.openFile(draft.fileKey);
      return;
    }
    this.closeEditor(false); this.context.hideSelection(); this.context.hideRecovery();
    this.activeDraft = draft;
    this.editor.open(draft.text, draft.purpose === "document" ? draft.name! : `Note · ${this.current!.name}`,
      draft.anchors.map(a => a.text).join(""), draft.purpose === "document");
    this.draftStatus(draft.purpose === "document" ? "Document draft recovered. Export .md to create a file."
      : "Draft recovered. Save attaches it to the passage; export keeps its text if the passage moved.");
  }
}
