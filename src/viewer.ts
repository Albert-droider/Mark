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

import { DraftStore, newDraft, type NoteDraft } from "./drafts";
import { captureReaderBackup, clearStorageIssue, reportStorageIssue, storageIssues, STORAGE_EVENT } from "./reader-storage";
import { AnnotationRecovery } from "./recovery";
import { saveReaderBackup } from "./backup";

/** How long a pointer must rest on a noted word before the tag appears. */
export const NOTE_HOVER_MS = 2000;
const POPOVER_MARGIN = 8;

/** Owns the rendered document and click interactions inside it. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;
  private imageGen = 0;
  private artifactGen = 0;

  /** Open a markdown/text path resolved from a relative link. */
  onOpenFile: ((path: string) => void) | null = null;
  /** Scroll the reading column to a heading id. */
  onAnchor: ((id: string) => void) | null = null;
  onNote: ((message: string) => void) | null = null;
  /** A selection or note changed the text nodes karaoke is following. */
  onMarks: (() => void) | null = null;

  /** Lives on the body so a book page cannot clip it, and print can drop it. */
  private pop: HTMLElement;
  private noteBox: HTMLElement;
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

    const built = this.buildPop();
    this.pop = built.pop;
    this.noteBox = built.noteBox;
    this.noteInput = built.noteInput;
    document.body.append(this.pop);
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
        this.relinkTarget = { fileKey: this.key, group };
        if (this.pendingRange) this.relinkSelection();
        else {
          this.recovery.hide();
          this.onNote?.("Select the correct passage, then choose Attach.");
        }
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

  render(file: LoadedFile): void {
    this.hidePop();
    this.hideTip();
    this.relinkTarget = null;
    this.current = file;
    this.imageGen++;
    const renderer = getRenderer(file.kind);
    const html = renderer.render(file.source);
    clear(this.root);
    this.root.innerHTML = html;
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
    this.unresolved = [];
    this.relinkTarget = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
    this.hideTip();
    this.refreshRecovery();
  }

  dispose(): void {
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
  }

  private onEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { this.hidePop(); this.hideTip(); this.recovery.hide(); }
  };
  private onKeyboardSelection = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.shiftKey && /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key)) {
      this.onMouseUp(new MouseEvent("mouseup"));
    }
  };
  private onScroll = (event: Event): void => {
    this.hideTip();
    if (event.target instanceof Node && (this.pop.contains(event.target) || this.recovery.root.contains(event.target))) return;
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

  private buildPop(): { pop: HTMLElement; noteBox: HTMLElement; noteInput: HTMLTextAreaElement } {
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
    const attach = el("button", { class: "btn sel-relink", type: "button" }, ["Attach"]);
    attach.hidden = true;
    attach.addEventListener("mousedown", (e) => e.preventDefault());
    attach.addEventListener("click", () => this.relinkSelection());
    row.append(noteBtn, removeBtn, attach);

    const noteInput = el("textarea", {
      class: "sel-note-input",
      rows: "3",
      placeholder: "Note on this passage",
      "aria-label": "Note",
    }) as HTMLTextAreaElement;
    noteInput.addEventListener("input", () => this.captureDraft());
    const save = el("button", { class: "btn primary sel-save", type: "button" }, ["Save"]);
    save.addEventListener("mousedown", (e) => e.preventDefault());
    save.addEventListener("click", () => this.saveNote());
    const status = el("p", { class: "sel-status", role: "status", "aria-live": "polite" }, []);
    const noteBox = el("div", { class: "sel-note" }, [noteInput, status, save]);
    noteBox.hidden = true;

    const pop = el("div", { class: "sel-pop", role: "dialog", "aria-label": "Selection" }, [row, noteBox]);
    pop.hidden = true;
    return { pop, noteBox, noteInput };
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
    if (this.pop.contains(e.target as Node)) return;
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
    this.noteBox.hidden = true;
    this.showPop(range.getBoundingClientRect(), false);
  };

  private showPop(rect: DOMRect, existing: boolean): void {
    this.hideTip();
    this.pop.hidden = false;
    this.pop.classList.toggle("existing", existing);
    (this.pop.querySelector(".sel-relink") as HTMLElement).hidden = !this.relinkTarget;
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
    if (this.activeDraft && !this.noteBox.hidden && this.noteInput.value !== this.activeDraft.text) this.captureDraft();
    this.activeDraft = null;
    this.popAnchor = null;
    this.pop.hidden = true;
    this.noteBox.hidden = true;
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
      this.activeDraft = previous ?? newDraft(this.key, group, anchors, group ? groupNote(this.key, group) : "");
      this.noteInput.value = this.activeDraft.text;
      this.noteBox.hidden = false;
      this.draftStatus(previous ? "Draft recovered. Save attaches it to the passage." : "Changes are kept as a draft. Save attaches the note.");
      this.noteInput.focus({ preventScroll: true });
    });
  }

  private draftStatus(message: string): void {
    const status = this.pop.querySelector(".sel-status");
    if (status) status.textContent = message;
    this.placePop();
  }
  private captureDraft(): void {
    if (!this.activeDraft) return;
    this.activeDraft = { ...this.activeDraft, text: this.noteInput.value,
      revision: this.activeDraft.revision + 1, updatedAt: Date.now() };
    if (this.attempt(() => this.drafts.save(this.activeDraft!))) this.draftStatus("Draft saved. Save attaches the note.");
    else this.draftStatus("Not saved: draft is only in this session. Keep MARK open, export, and retry.");
    this.refreshRecovery();
  }

  private saveNote(): void {
    if (!this.activeDraft) return;
    if (this.activeDraft.text !== this.noteInput.value) this.captureDraft();
    const draft = this.activeDraft;
    if (!this.attempt(() => saveHighlightNote(draft.fileKey, draft.group ?? draft.id,
      draft.group ? null : draft.anchors, draft.text))) {
      this.draftStatus("Note not saved. Your draft is still available; retry or export.");
      return;
    }
    // Commit happened before cleanup. Reusing draft.id prevents duplicates on retry.
    let removed = false;
    this.attempt(() => { removed = this.drafts.remove(draft.id, draft.revision); });
    this.activeDraft = null;
    this.hidePop();
    if (this.key === draft.fileKey) this.updateAnnotations();
    window.getSelection()?.removeAllRanges();
    this.onMarks?.();
    this.onNote?.(removed ? "Note saved." : "Note saved, but draft cleanup failed. Retry is safe; export before closing.");
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
  }

  private editGroup(group: string): void {
    this.hidePop();
    this.pendingGroup = group;
    this.showPop(new DOMRect(window.innerWidth / 2, 50, 0, 0), true);
    this.openNote();
  }
  private resumeDraft(draft: NoteDraft): void {
    if (draft.fileKey !== this.key) {
      this.onNote?.(`Open ${draft.fileKey} first, then resume this draft from Notes & backup.`);
      if (isTauri && isDocumentPath(draft.fileKey)) this.onOpenFile?.(draft.fileKey);
      return;
    }
    this.hidePop();
    this.activeDraft = draft;
    this.pendingGroup = draft.group;
    this.showPop(new DOMRect(window.innerWidth / 2, 50, 0, 0), !!draft.group);
    this.noteBox.hidden = false;
    this.noteInput.value = draft.text;
    this.draftStatus("Draft recovered. Save attaches it to the passage; export keeps its text if the passage moved.");
    this.noteInput.focus({ preventScroll: true });
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
      this.openNote();
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
