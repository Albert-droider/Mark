import type { LoadedFile } from "./types";
import { canonicalPath } from "./util";
import { anchorsFromRange, addHighlight, applyHighlights, getHighlights, groupAt, groupNote,
  relinkHighlightGroup, removeHighlightGroup, setGroupColor, unwrapGroup,
  type HighlightColor, type UnresolvedHighlight } from "./highlights";
import { DraftStore } from "./drafts";
import { AnnotationRecovery } from "./recovery";
import { captureReaderBackup, clearStorageIssue, reportStorageIssue, storageIssues, STORAGE_EVENT } from "./reader-storage";
import { saveReaderBackup } from "./backup";
import type { InPlaceReader } from "./in-place-reader";
import { fileNoteAnchors } from "./file-note-anchors";
import { LegacyNoteHover } from "./legacy-note-hover";
import { LegacyNoteWorkspace } from "./legacy-note-workspace";
import { SelectionPopover } from "./selection-popover";

export interface AnnotationActions {
  file(): LoadedFile | null; reader(): InPlaceReader | null;
  report(message: string): void; marksChanged(): void; revealNote(note: HTMLElement): void;
  openFile(path: string): void; editorVisibility(open: boolean): void;
}

/** Coordinates annotations; rendering and source lifecycle remain with the viewer. */
export class ReaderAnnotations {
  private selection: SelectionPopover;
  private hover: LegacyNoteHover;
  private workspace: LegacyNoteWorkspace;
  private drafts = new DraftStore();
  private pendingRange: Range | null = null;
  private pendingGroup: string | null = null;
  private unresolved: UnresolvedHighlight[] = [];
  private recovery: AnnotationRecovery;
  private relinkTarget: { fileKey: string; group: string } | null = null;
  constructor(private root: HTMLElement, private context: AnnotationActions) {
    this.selection = new SelectionPopover({ mark: color => this.mark(color), note: () => this.openNote(),
      remove: () => this.removeMark(), attach: () => this.relinkSelection() });
    this.hover = new LegacyNoteHover(root, { canShow: () => this.pop.hidden,
      readNote: group => groupNote(this.key, group), failed: error => { this.attempt(() => { throw error; }); } });
    this.workspace = new LegacyNoteWorkspace({
      key: () => this.key, file: () => this.current, attempt: action => this.attempt(action),
      report: message => this.context.report(message), marksChanged: () => this.context.marksChanged(),
      annotationsChanged: () => this.updateAnnotations(), refreshRecovery: () => this.refreshRecovery(),
      hideSelection: () => this.hidePop(), hideRecovery: () => this.recovery.hide(), showRecovery: () => this.recovery.show(),
      openFile: path => this.context.openFile(path), editGroup: group => this.editGroup(group),
      editorVisibility: open => this.context.editorVisibility(open),
    }, this.drafts);
    this.recovery = this.buildRecovery(); document.body.append(this.recovery.toggle, this.recovery.root);
    this.bindEvents(); this.refreshRecovery();
  }
  private get current(): LoadedFile | null { return this.context.file(); }
  private get readerEditor(): InPlaceReader | null { return this.context.reader(); }
  private get pop(): HTMLElement { return this.selection.root; }
  private get onNote(): (message: string) => void { return this.context.report; }
  private get onMarks(): () => void { return this.context.marksChanged; }
  private get onRevealNote(): (note: HTMLElement) => void { return this.context.revealNote; }
  get recoveryButton(): HTMLButtonElement { return this.recovery.toggle; }
  createDocument(): void { this.workspace.createDocument(); }
  private buildRecovery(): AnnotationRecovery {
    return new AnnotationRecovery({
      resume: draft => this.workspace.resumeDraft(draft),
      discard: draft => {
        if (window.confirm("Discard this draft? The saved annotation is not removed.")) {
          this.attempt(() => this.drafts.remove(draft.id, draft.revision)); this.refreshRecovery();
        }
      },
      edit: group => this.editGroup(group), relink: group => this.startRelink(group),
      export: () => { void this.exportBackup(); },
      fileEdit: id => { this.recovery.hide(); this.readerEditor?.editNote(id); },
      fileCreate: () => { this.recovery.hide(); this.addReaderNote(null); },
    });
  }
  private startRelink(group: string): void {
    this.workspace.closeEditor(false); this.relinkTarget = { fileKey: this.key, group };
    this.recovery.hide();
    if (this.pendingRange) this.showPop(this.pendingRange.getBoundingClientRect(), false);
    this.onNote("Select the correct passage, then choose Attach. Esc cancels.");
  }
  private bindEvents(): void {
    document.addEventListener("mouseup", this.onMouseUp); document.addEventListener("keydown", this.onEscape);
    document.addEventListener("keyup", this.onKeyboardSelection); document.addEventListener("scroll", this.onScroll, true);
    document.addEventListener(STORAGE_EVENT, this.onStorageStatus);
    window.addEventListener("wheel", this.onWheelTip, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize); window.addEventListener("beforeunload", this.onBeforeUnload);
    this.root.addEventListener("click", this.onClick);
  }
  hideTransient(): void { this.hidePop(); this.hideTip(); }
  reset(): void { this.hideTransient(); this.relinkTarget = null; }
  clear(): void { this.reset(); this.unresolved = []; this.refreshRecovery(); }
  hideTip(): void { this.hover.hideTip(); }
  private hidePop(): void {
    this.workspace.captureChanged(); this.selection.hide(); this.pendingRange = null; this.pendingGroup = null;
  }
  private showPop(rect: DOMRect, existing: boolean): void {
    this.hideTip(); this.selection.show(rect, { existing, attaching: !!this.relinkTarget, hasRange: !!this.pendingRange });
  }
  private openNote(): void {
    if (!this.key) return;
    if (this.readerEditor) {
      const group = this.pendingGroup;
      const mark = group ? [...this.root.querySelectorAll<HTMLElement>("mark.hl")].find(mark => mark.dataset.hlGroup === group) : null;
      const range = this.pendingRange?.cloneRange() ?? (mark ? document.createRange() : null);
      if (range && mark && !this.pendingRange) range.selectNodeContents(mark);
      this.attempt(() => this.addReaderNote(range, group ?? undefined)); return;
    }
    this.attempt(() => {
      const group = this.pendingGroup;
      const anchors = group ? getHighlights(this.key).filter(highlight => highlight.group === group)
        : this.pendingRange ? anchorsFromRange(this.pendingRange, this.root) : [];
      this.workspace.openPassage(group, anchors);
    });
  }
  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[contenteditable]")) return;
    const group = groupAt(target);
    if (!group) return;
    event.preventDefault(); event.stopPropagation(); this.hidePop(); this.pendingGroup = group;
    this.showPop(target.closest<HTMLElement>("mark.hl")!.getBoundingClientRect(), true);
  };
  dispose(): void {
    this.hideTransient(); this.hover.dispose(); this.selection.dispose(); this.recovery.dispose(); this.workspace.dispose();
    document.removeEventListener("mouseup", this.onMouseUp); document.removeEventListener("keydown", this.onEscape);
    document.removeEventListener("keyup", this.onKeyboardSelection); document.removeEventListener("scroll", this.onScroll, true);
    document.removeEventListener(STORAGE_EVENT, this.onStorageStatus);
    window.removeEventListener("wheel", this.onWheelTip, true); window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.onBeforeUnload); this.root.removeEventListener("click", this.onClick);
  }


  private get key(): string {
    const file = this.current;
    if (!file) return "";
    return file.path ? canonicalPath(file.path) : file.name;
  }

  openNotes(): void {
    if (!this.readerEditor) { this.recovery.show(); return; }
    if (this.readerEditor.noteEntries().length) { this.refreshRecovery(); this.recovery.show(); }
    else this.addReaderNote(null);
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
    if (event.target instanceof Node && (this.pop.contains(event.target) || this.recovery.root.contains(event.target) || this.workspace.root.contains(event.target))) return;
    this.hidePop();
  };

  private onWheelTip = (): void => this.hideTip();

  private onResize = (): void => { this.hideTip(); this.hidePop(); };

  private onStorageStatus = (): void => this.refreshRecovery();

  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.drafts.unsaved().length) { event.preventDefault(); event.returnValue = ""; }
  };


  /** Native close controls also need to warn about session-only drafts. */
  capturePendingNote(): boolean { return this.readerEditor?.captureNote() ?? true; }

  canClose(): boolean {
    if (!this.capturePendingNote()) return false;
    return !this.drafts.unsaved().length || window.confirm("Some drafts could not be saved. Closing MARK will lose their session copies. Export a backup first. Close anyway?");
  }


  private onMouseUp = (e: MouseEvent): void => {
    if (e.target instanceof Node && (this.pop.contains(e.target) || this.workspace.root.contains(e.target))) return;
    if (e.target instanceof Element && e.target.closest(".block-actions,.reader-share-actions,.share-trigger,[contenteditable],.reader-note,[data-reader-ui]")) return;
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


  private addReaderNote(range: Range | null, group?: string): void {
    if (!this.readerEditor) return;
    const anchors = group ? getHighlights(this.key).filter(highlight => highlight.group === group)
      : range ? fileNoteAnchors(range, this.root) : [];
    const id = group ? `legacy-${group}` : crypto.randomUUID();
    const note = { id, quote: anchors.map(anchor => anchor.text).join(""), anchors: anchors.map(({ text, prefix, suffix }) => ({ text, prefix, suffix })), text: group ? groupNote(this.key, group) : "" };
    if (!this.readerEditor.addNote(range, note)) return;
    window.getSelection()?.removeAllRanges(); this.hidePop();
    const element = this.readerEditor?.editNote(id);
    if (element && this.root.contains(element)) this.onRevealNote?.(element);
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

  updateAnnotations(): void {
    this.unresolved = [];
    this.attempt(() => { this.unresolved = applyHighlights(this.root, this.key); });
    this.refreshRecovery();
  }

  private refreshRecovery(): void {
    if (!this.recovery) return;
    const drafts = this.drafts.list();
    this.recovery.refresh({ fileKey: this.key, unresolved: this.unresolved, drafts, issues: storageIssues(),
      fileNotes: this.readerEditor?.noteEntries(), fileEditable: this.readerEditor != null });
    this.workspace.refreshNotes(drafts);
  }


  private editGroup(group: string): void {
    this.hidePop();
    this.pendingGroup = group;
    this.showPop(new DOMRect(window.innerWidth / 2, 50, 0, 0), true);
    this.openNote();
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
}
