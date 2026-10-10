import { drawMermaid } from "./artifacts";
import type { LoadedFile } from "./types";
import { getRenderer } from "./renderer";
import { isTauri } from "./platform";
import { el, clear, canonicalPath, resolveAgainst, isDocumentPath, isImagePath } from "./util";
import { loadImageDataUrl } from "./files";
import {
  HIGHLIGHT_COLORS,
  addHighlight,
  anchorsFromRange,
  applyHighlights,
  groupAt,
  groupNote,
  getHighlights,
  relinkHighlightGroup,
  saveHighlightNote,
  removeHighlightGroup,
  setGroupColor,
  unwrapGroup,
  type HighlightColor,
  type UnresolvedHighlight,
} from "./highlights";

import { DraftStore, newDraft, newDocumentDraft, type NoteDraft } from "./drafts";
import { NoteEditor, type NoteEntry } from "./note-editor";
import { captureReaderBackup, clearStorageIssue, reportStorageIssue, storageIssues, STORAGE_EVENT } from "./reader-storage";
import { AnnotationRecovery } from "./recovery";
import { saveReaderBackup } from "./backup";
import { exportText } from "./export-text";
import { attachShareActions } from "./share-actions";

/** How long a pointer must rest on a noted word before the tag appears. */
export const NOTE_HOVER_MS = 2000;
const POPOVER_MARGIN = 8;

/** Owns the rendered document and click interactions inside it. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;
  private imageGen = 0;
  private artifactGen = 0;
  private clearShareActions: (() => void) | null = null;

  /** Open a markdown/text path resolved from a relative link. */
  onOpenFile: ((path: string) => void) | null = null;
  /** Scroll the reading column to a heading id. */
  onAnchor: ((id: string) => void) | null = null;
  onNote: ((message: string) => void) | null = null;
  /** A selection or note changed the text nodes karaoke is following. */
  onMarks: (() => void) | null = null;
  onNotesVisibility: ((open: boolean) => void) | null = null;

  /** Lives on the body so a book page cannot clip it, and print can drop it. */
  private pop: HTMLElement;
  private editor: NoteEditor;
  private noteInput: HTMLTextAreaElement;
  private pendingRange: Range | null = null;
  private pendingGroup: string | null = null;
  private popAnchor: DOMRect | null = null;
  private drafts = new DraftStore();
  private activeDraft: NoteDraft | null = null;
  private unresolved: UnresolvedHighlight[] = [];
  private recovery: AnnotationRecovery;
  private relinkTarget: { fileKey: string; group: string } | null = null;
  /** Read-only note tag. Outside the article, so it cannot change page height or catch the wheel. */
  private tip: HTMLElement;
  private tipText: HTMLElement;
  private tipTimer = 0;
  private tipGroup: string | null = null;

  constructor() {
    this.root = el("article", {
      class: "markdown-body content",
      "aria-label": "Document content",
    });
    this.root.hidden = true;
    this.root.addEventListener("click", this.onClick);

    this.pop = this.buildPop();
    this.editor = new NoteEditor({
      change: () => this.captureDraft(), save: () => this.saveNote(), close: () => this.closeEditor(),
      create: () => this.createDocument(), copySource: () => this.createDocument(true),
      export: () => { void this.exportNote(); }, recovery: () => this.recovery.show(),
      browse: () => this.browseNotes(), visibility: open => this.onNotesVisibility?.(open),
    });
    this.noteInput = this.editor.input;
    document.body.append(this.pop, this.editor.root);
    const tip = this.buildTip();
    this.tip = tip.tip;
    this.tipText = tip.text;
    document.body.append(this.tip);
    this.root.addEventListener("pointerover", this.onMarkOver);
    this.root.addEventListener("pointermove", this.onMarkMove);
    this.root.addEventListener("pointerout", this.onMarkOut);
    this.recovery = new AnnotationRecovery({
      resume: (draft) => this.resumeDraft(draft),
      discard: (draft) => {
        if (window.confirm("Discard this draft? The saved annotation is not removed.")) {
          this.attempt(() => this.drafts.remove(draft.id, draft.revision));
          this.refreshRecovery();
        }
      },
      edit: (group) => this.editGroup(group),
      relink: (group) => {
        this.closeEditor(false);
        this.relinkTarget = { fileKey: this.key, group };
        this.recovery.hide();
        if (this.pendingRange) this.showPop(this.pendingRange.getBoundingClientRect(), false);
        this.onNote?.("Select the correct passage, then choose Attach. Esc cancels.");
      },
      export: () => { void this.exportBackup(); },
    });
    document.body.append(this.recovery.toggle, this.recovery.root);
    this.refreshRecovery();
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("keydown", this.onEscape);
    document.addEventListener("keyup", this.onKeyboardSelection);
    document.addEventListener("scroll", this.onScroll, true);
    document.addEventListener(STORAGE_EVENT, this.onStorageStatus);
    window.addEventListener("wheel", this.onWheelTip, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  private get key(): string {
    const file = this.current;
    if (!file) return "";
    return file.path ? canonicalPath(file.path) : file.name;
  }

  get file(): LoadedFile | null {
    return this.current;
  }

  get recoveryButton(): HTMLButtonElement { return this.recovery.toggle; }
  openNotes(): void { this.editor.isOpen ? this.closeEditor() : this.browseNotes(); }

  createDocument(copySource = false): void {
    if (copySource && !this.current) return;
    this.closeEditor(false);
    const name = copySource ? `${this.current!.name.replace(/\.[^.]+$/, "")}-edited.md` : "Untitled.md";
    this.activeDraft = newDocumentDraft(name, copySource ? this.current!.source : "# Untitled note\n\n");
    this.editor.open(this.activeDraft.text, name, "", true);
    this.captureDraft();
  }

  render(file: LoadedFile): void {
    this.hidePop();
    this.hideTip();
    this.relinkTarget = null;
    this.current = file;
    this.imageGen++;
    const renderer = getRenderer(file.kind);
    this.clearShareActions?.();
    const rendered = renderer.renderWithSource?.(file.source);
    clear(this.root);
    this.root.innerHTML = rendered?.html ?? renderer.render(file.source);
    this.clearShareActions = rendered ? attachShareActions(this.root, rendered.blocks, { name: file.name, source: file.source }, message => this.onNote?.(message)) : null;
    this.root.hidden = false;
    this.updateAnnotations();
  }

  rerender(): void {
    if (this.current) this.render(this.current);
  }

  clear(): void {
    this.hidePop();
    this.imageGen++;
    this.artifactGen++;
    this.current = null;
    this.clearShareActions?.(); this.clearShareActions = null;
    this.unresolved = [];
    this.relinkTarget = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
    this.hideTip();
    this.refreshRecovery();
  }

  dispose(): void {
    this.clearShareActions?.(); this.clearShareActions = null;
    this.hidePop();
    this.hideTip();
    this.imageGen++;
    this.artifactGen++;
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("keydown", this.onEscape);
    document.removeEventListener("keyup", this.onKeyboardSelection);
    document.removeEventListener("scroll", this.onScroll, true);
    document.removeEventListener(STORAGE_EVENT, this.onStorageStatus);
    window.removeEventListener("wheel", this.onWheelTip, true);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("pointerover", this.onMarkOver);
    this.root.removeEventListener("pointermove", this.onMarkMove);
    this.root.removeEventListener("pointerout", this.onMarkOut);
    this.pop.remove();
    this.tip.remove();
    this.recovery.dispose();
    this.closeEditor(false);
    this.editor.dispose();
  }

  private onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.relinkTarget) this.onNote?.("Attachment cancelled. Your note is unchanged.");
    this.relinkTarget = null;
    this.hidePop(); this.hideTip(); this.recovery.hide();
  };
  private onKeyboardSelection = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.shiftKey && /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key)) {
      this.onMouseUp(new MouseEvent("mouseup"));
    }
  };
  private onScroll = (event: Event): void => {
    this.hideTip();
    if (event.target instanceof Node && (this.pop.contains(event.target) || this.recovery.root.contains(event.target) || this.editor.root.contains(event.target))) return;
    this.hidePop();
  };
  private onWheelTip = (): void => this.hideTip();
  private onResize = (): void => { this.hideTip(); this.hidePop(); };
  private onStorageStatus = (): void => this.refreshRecovery();
  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.drafts.unsaved().length) { event.preventDefault(); event.returnValue = ""; }
  };

  /** Native close controls also need to warn about session-only drafts. */
  canClose(): boolean {
    return !this.drafts.unsaved().length || window.confirm("Some drafts could not be saved. Closing MARK will lose their session copies. Export a backup first. Close anyway?");
  }

  /** Draw mermaid fences. Charts and plans are already in the HTML. */
  async hydrateArtifacts(): Promise<void> {
    const gen = ++this.artifactGen;
    const nodes = [...this.root.querySelectorAll<HTMLElement>(".artifact-mermaid")];
    if (nodes.length === 0) return;
    await drawMermaid(nodes, () => this.artifactGen === gen);
  }

  /** Replace relative image sources with data URLs the webview is allowed to show. */
  async hydrateImages(): Promise<void> {
    const file = this.current;
    if (!file?.path || !isTauri) return;
    const gen = this.imageGen;
    const imgs = [...this.root.querySelectorAll("img")];
    await Promise.all(imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      const abs = resolveAgainst(file.path, src);
      if (!abs || !isImagePath(abs)) return;
      try {
        const url = await loadImageDataUrl(abs);
        if (this.imageGen === gen) img.src = url;
      } catch {
        /* leave the unresolved src; the document still reads */
      }
    }));
  }

  private buildPop(): HTMLElement {
    const row = el("div", { class: "sel-row" }, []);
    for (const color of HIGHLIGHT_COLORS) {
      const btn = el("button", {
        class: `sel-swatch sel-${color}`,
        type: "button",
        title: `Mark ${color}`,
        "aria-label": `Mark ${color}`,
      }, []);
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.mark(color));
      row.append(btn);
    }
    const noteBtn = el("button", { class: "btn sel-note-btn", type: "button" }, ["Note"]);
    noteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    noteBtn.addEventListener("click", () => this.openNote());
    const removeBtn = el("button", { class: "btn sel-remove", type: "button" }, ["Remove"]);
    removeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    removeBtn.addEventListener("click", () => this.removeMark());
    const attach = el("button", { class: "btn sel-relink", type: "button", title: "Attach the selected passage to the note. Esc cancels." }, ["Attach"]);
    attach.hidden = true;
    attach.addEventListener("mousedown", (e) => e.preventDefault());
    attach.addEventListener("click", () => this.relinkSelection());
    row.append(noteBtn, removeBtn, attach);

    const pop = el("div", { class: "sel-pop", role: "dialog", "aria-label": "Selection" }, [row]);
    pop.hidden = true;
    return pop;
  }

  /** A fixed tag on the body. It never sits in the scrolling column or the book. */
  private buildTip(): { tip: HTMLElement; text: HTMLElement } {
    const text = el("span", { class: "note-tip-text" }, []);
    const tip = el("div", { class: "note-tip", role: "tooltip", "aria-hidden": "true" }, [
      el("span", { class: "note-tip-kicker" }, ["Note"]),
      text,
    ]);
    tip.hidden = true;
    tip.style.position = "fixed";
    tip.style.pointerEvents = "none";
    tip.style.overflow = "hidden";
    return { tip, text };
  }

  private onMouseUp = (e: MouseEvent): void => {
    if (e.target instanceof Node && (this.pop.contains(e.target) || this.editor.root.contains(e.target))) return;
    if (e.target instanceof Element && e.target.closest(".block-actions,.reader-share-actions")) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.hidePop();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.root.contains(range.commonAncestorContainer)) {
      this.hidePop();
      return;
    }
    this.hidePop();
    this.pendingRange = range.cloneRange();
    this.pendingGroup = null;
    this.showPop(range.getBoundingClientRect(), false);
  };

  private showPop(rect: DOMRect, existing: boolean): void {
    this.hideTip();
    this.pop.hidden = false;
    this.pop.classList.toggle("existing", existing);
    const attach = this.pop.querySelector<HTMLButtonElement>(".sel-relink")!;
    attach.hidden = !this.relinkTarget;
    attach.disabled = !this.pendingRange;
    this.popAnchor = rect;
    this.placePop();
  }

  private placePop(): void {
    const rect = this.popAnchor;
    if (!rect || this.pop.hidden) return;
    const margin = POPOVER_MARGIN;
    const width = this.pop.offsetWidth;
    const height = this.pop.offsetHeight;
    const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max));
    const left = clamp(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin);
    const above = rect.top - height - margin;
    const top = clamp(above >= margin ? above : rect.bottom + margin, window.innerHeight - height - margin);
    this.pop.style.left = `${left}px`;
    this.pop.style.top = `${top}px`;
  }

  private hidePop(): void {
    if (this.activeDraft && this.noteInput.value !== this.activeDraft.text) this.captureDraft();
    this.popAnchor = null;
    this.pop.hidden = true;
    this.pendingRange = null;
    this.pendingGroup = null;
  }

  /** Drop the hover tag. Page turns call this so it does not stay behind on the old spread. */
  hideNoteTip(): void {
    this.hideTip();
  }

  private hideTip(): void {
    window.clearTimeout(this.tipTimer);
    this.tipTimer = 0;
    this.tipGroup = null;
    this.tip.hidden = true;
  }

  private onMarkMove = (e: PointerEvent): void => {
    if (this.tipGroup) return;
    this.onMarkOver(e);
  };

  private onMarkOver = (e: PointerEvent): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const mark = target.closest("mark.has-note") as HTMLElement | null;
    if (!mark || !this.root.contains(mark)) return;
    const group = mark.dataset.hlGroup || "";
    if (!group || group === this.tipGroup) return;
    this.armTip(mark, group);
  };

  private onMarkOut = (e: PointerEvent): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const mark = target.closest("mark.has-note") as HTMLElement | null;
    if (!mark || mark.dataset.hlGroup !== this.tipGroup) return;
    const next = e.relatedTarget;
    if (next instanceof Element) {
      const stay = next.closest("mark.has-note") as HTMLElement | null;
      if (stay?.dataset.hlGroup === mark.dataset.hlGroup) return;
    }
    this.hideTip();
  };

  private armTip(mark: HTMLElement, group: string): void {
    window.clearTimeout(this.tipTimer);
    this.tip.hidden = true;
    this.tipGroup = group;
    this.tipTimer = window.setTimeout(() => {
      this.tipTimer = 0;
      if (this.tipGroup !== group || !mark.isConnected || !this.pop.hidden) {
        this.tipGroup = null;
        return;
      }
      this.attempt(() => {
        const note = groupNote(this.key, group);
        if (!note) { this.tipGroup = null; return; }
        this.showTip(mark, note);
      });
    }, NOTE_HOVER_MS);
  }

  private showTip(mark: HTMLElement, note: string): void {
    this.tipText.textContent = note;
    this.tip.dataset.color = mark.classList.contains("hl-pink")
      ? "pink"
      : mark.classList.contains("hl-green")
        ? "green"
        : "yellow";
    this.tip.hidden = false;
    this.placeTip(mark);
  }

  /** Pin the tag to the viewport. It is not in the document, so the column does not grow. */
  private placeTip(mark: HTMLElement): void {
    const rect = mark.getBoundingClientRect();
    const marginX = 12;
    const width = this.tip.offsetWidth;
    const height = this.tip.offsetHeight;
    const topSafe = 56;
    const bottomSafe = 64;
    let top = rect.top - height - 6;
    if (top < topSafe) top = rect.bottom + 6;
    const maxTop = window.innerHeight - height - bottomSafe;
    if (top > maxTop) top = Math.max(topSafe, maxTop);
    let left = rect.left;
    const maxLeft = window.innerWidth - width - marginX;
    if (left > maxLeft) left = Math.max(marginX, maxLeft);
    if (left < marginX) left = marginX;
    this.tip.style.left = `${Math.round(left)}px`;
    this.tip.style.top = `${Math.round(top)}px`;
  }

  private mark(color: HighlightColor): void {
    if (!this.key) return;
    if (!this.attempt(() => {
      if (this.pendingGroup) setGroupColor(this.key, this.pendingGroup, color);
      else if (this.pendingRange) addHighlight(this.key, anchorsFromRange(this.pendingRange, this.root), color);
      this.updateAnnotations();
      this.onMarks?.();
    })) return;
    window.getSelection()?.removeAllRanges();
    this.hidePop();
  }

  private openNote(): void {
    if (!this.key) return;
    this.attempt(() => {
      const group = this.pendingGroup;
      const anchors = group ? getHighlights(this.key).filter((h) => h.group === group)
        : this.pendingRange ? anchorsFromRange(this.pendingRange, this.root) : [];
      if (!group && !anchors.length) return;
      const previous = this.drafts.list(this.key).find((d) => group ? d.group === group
        : !d.group && JSON.stringify(d.anchors) === JSON.stringify(anchors));
      this.closeEditor(false);
      this.activeDraft = previous ?? newDraft(this.key, group, anchors, group ? groupNote(this.key, group) : "");
      this.editor.open(this.activeDraft.text, `Note · ${this.current!.name}`, anchors.map(a => a.text).join(""));
      this.hidePop();
      this.draftStatus(previous ? "Draft recovered. Save attaches it to the passage." : "Write in Markdown. Changes are kept as a draft; Save attaches the note.");
    });
  }

  private closeEditor(focus = true): void {
    if (this.activeDraft && this.noteInput.value !== this.activeDraft.text) this.captureDraft();
    this.activeDraft = null; this.editor.hide();
    if (focus) document.querySelector<HTMLButtonElement>(".notes-btn")?.focus({ preventScroll: true });
  }
  private browseNotes(): void {
    this.closeEditor(false); this.refreshNotes(this.drafts.list());
    this.editor.showList();
    this.draftStatus("Passage notes are listed for the open source. Standalone documents are drafts; export them as .md.");
  }
  private refreshNotes(drafts: NoteDraft[]): void {
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
          detail: entry.quote, open: () => this.editGroup(group),
        });
      }
    } catch { /* The recovery surface already reports malformed annotation storage. */ }
    this.editor.setEntries(entries, !!this.current);
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
      else this.onNote?.(`${name}: ${message}`);
      clearStorageIssue("note-export");
    } catch (error) {
      reportStorageIssue(error, "note-export");
      const message = "Export failed. Your note is still available; retry or use the reader backup.";
      if (stillCurrent()) this.draftStatus(message);
      else this.onNote?.(`${name}: ${message}`);
      this.refreshRecovery();
    }
  }

  private draftStatus(message: string): void {
    this.editor.setStatus(message);
  }
  private captureDraft(): void {
    if (!this.activeDraft) return;
    this.activeDraft = { ...this.activeDraft, text: this.noteInput.value,
      revision: this.activeDraft.revision + 1, updatedAt: Date.now() };
    if (this.attempt(() => this.drafts.save(this.activeDraft!))) this.draftStatus(this.activeDraft.purpose === "document"
      ? "Document draft saved locally. Export .md to create a file; the source stays unchanged."
      : "Draft saved. Save attaches the note.");
    else this.draftStatus("Not saved: draft is only in this session. Keep MARK open, export, and retry.");
    this.refreshRecovery();
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
    this.hidePop();
    if (this.key === draft.fileKey) this.updateAnnotations();
    window.getSelection()?.removeAllRanges();
    this.onMarks?.();
    const message = removed ? "Note saved." : "Note saved, but draft cleanup failed. Retry is safe; export before closing.";
    this.onNote?.(message); this.draftStatus(message);
    this.refreshRecovery();
  }

  private removeMark(): void {
    if (!this.pendingGroup || !this.key) return;
    const group = this.pendingGroup;
    if (!this.attempt(() => removeHighlightGroup(this.key, group))) return;
    unwrapGroup(this.root, group);
    this.onMarks?.();
    this.hidePop();
    this.updateAnnotations();
  }

  private attempt(action: () => unknown): boolean {
    try { action(); return true; }
    catch (error) {
      const message = reportStorageIssue(error);
      this.onNote?.(message);
      this.refreshRecovery();
      return false;
    }
  }
  private updateAnnotations(): void {
    this.unresolved = [];
    this.attempt(() => { this.unresolved = applyHighlights(this.root, this.key); });
    this.refreshRecovery();
  }
  private refreshRecovery(): void {
    if (!this.recovery) return;
    const drafts = this.drafts.list();
    this.recovery.refresh({ fileKey: this.key, unresolved: this.unresolved, drafts, issues: storageIssues() });
    this.refreshNotes(drafts);
  }

  private editGroup(group: string): void {
    this.hidePop();
    this.pendingGroup = group;
    this.showPop(new DOMRect(window.innerWidth / 2, 50, 0, 0), true);
    this.openNote();
  }
  private resumeDraft(draft: NoteDraft): void {
    if (draft.purpose !== "document" && draft.fileKey !== this.key) {
      this.onNote?.(`Open ${draft.fileKey} first, then resume this draft from Notes & backup.`);
      if (isTauri && isDocumentPath(draft.fileKey)) this.onOpenFile?.(draft.fileKey);
      return;
    }
    this.closeEditor(false); this.hidePop(); this.recovery.hide();
    this.activeDraft = draft;
    this.editor.open(draft.text, draft.purpose === "document" ? draft.name! : `Note · ${this.current!.name}`,
      draft.anchors.map(a => a.text).join(""), draft.purpose === "document");
    this.draftStatus(draft.purpose === "document" ? "Document draft recovered. Export .md to create a file."
      : "Draft recovered. Save attaches it to the passage; export keeps its text if the passage moved.");
  }
  private relinkSelection(): void {
    const target = this.relinkTarget;
    if (!target || target.fileKey !== this.key || !this.pendingRange) return;
    const anchors = anchorsFromRange(this.pendingRange, this.root);
    if (!anchors.length || !this.attempt(() => relinkHighlightGroup(target.fileKey, target.group, anchors))) return;
    this.relinkTarget = null;
    this.hidePop();
    this.updateAnnotations();
    this.onMarks?.();
    this.onNote?.("Passage attached. The original note was kept.");
  }

  private async exportBackup(): Promise<void> {
    try {
      const backup = { ...captureReaderBackup(), sessionDrafts: this.drafts.unsaved() };
      const result = await saveReaderBackup(JSON.stringify(backup, null, 2));
      if (result === "cancelled") { this.onNote?.("Backup export cancelled."); return; }
      clearStorageIssue("backup-export");
      const action = result === "saved" ? "saved" : "download requested";
      this.onNote?.(backup.complete ? `Backup ${action}. Keep your source books separately.`
        : `Partial backup ${action}. Read the errors list: some storage could not be read.`);
    } catch (error) {
      const message = reportStorageIssue(error, "backup-export");
      this.onNote?.(message);
      this.refreshRecovery();
    }
  }

  private onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;

    const group = groupAt(target);
    if (group) {
      e.preventDefault();
      e.stopPropagation();
      this.hidePop();
      this.pendingGroup = group;
      const mark = target.closest("mark.hl") as HTMLElement;
      this.showPop(mark.getBoundingClientRect(), true);
      return;
    }

    const copyBtn = target.closest(".code-copy") as HTMLElement | null;
    if (copyBtn) {
      e.preventDefault();
      const block = copyBtn.closest(".code-block");
      const code = block?.querySelector("code")?.textContent ?? "";
      void this.copy(code);
      copyBtn.textContent = "copied";
      copyBtn.classList.add("copied");
      window.setTimeout(() => {
        copyBtn.textContent = "copy";
        copyBtn.classList.remove("copied");
      }, 1400);
      return;
    }

    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      if (id) this.onAnchor?.(id);
      return;
    }

    if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
      e.preventDefault();
      if (isTauri) {
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => {
            window.open(href, "_blank", "noopener");
          });
      } else {
        window.open(href, "_blank", "noopener");
      }
      return;
    }

    // Any other link stays inside the reader. Following it in the webview unloads the app.
    e.preventDefault();
    const base = this.current?.path || "";
    const abs = base ? resolveAgainst(base, href) : null;
    if (abs && isDocumentPath(abs)) {
      this.onOpenFile?.(abs);
      return;
    }
    if (!base) {
      this.onNote?.("Open this file from the desktop app to follow links inside it.");
      return;
    }
    this.onNote?.("That link doesn't point at a document Mark can open.");
  };

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
  }
}
