import type { RenderedSource } from "./renderer/base";
import { sliceSourceLines } from "./share";
import { replaceBlock, toggleTask } from "./live-markdown";
import { InPlaceCells } from "./in-place-cells";
import { MarkdownRenderer } from "./renderer/markdown";
import { InPlaceNotes } from "./in-place-notes";
import { insertFileNote, type NewFileNote } from "./file-notes";

export type SourceChangePhase = "input" | "commit" | "render";
export interface ReaderActions {
  current: () => string;
  change: (source: string, phase: SourceChangePhase) => void;
  report: (message: string) => void;
}
interface ReaderSnapshot { source: string; rendered: RenderedSource }

/** Parser-owned controls edit the same source the reader and exports use. */
export class InPlaceReader {
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private source: string;
  private cells: InPlaceCells[] = [];
  private notes: InPlaceNotes;
  constructor(private root: HTMLElement, private snapshot: ReaderSnapshot, private actions: ReaderActions) {
    this.source = snapshot.source;
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const task = snapshot.rendered.tasks.find(task => task.id === input.dataset.markTask);
      input.disabled = !task;
      if (!task) continue;
      const change = (): void => {
        if (!this.isCurrent()) { input.checked = task.checked; return; }
        try {
          this.update(toggleTask(this.source, task, input.checked), "commit");
          task.checked = input.checked;
          task.markdown = sliceSourceLines(this.source, task.startLine, task.startLine);
        } catch (error) { input.checked = task.checked; actions.report(String(error)); }
      };
      input.addEventListener("change", change);
      this.cleanup.push(() => input.removeEventListener("change", change));
    }
    this.notes = new InPlaceNotes(root, snapshot.rendered, {
      current: () => actions.current(), change: (source, phase) => this.update(source, phase), report: actions.report,
    });
    const renderer = new MarkdownRenderer();
    for (const block of snapshot.rendered.blocks.filter(block => block.kind === "table")) {
      const element = [...root.querySelectorAll<HTMLElement>("[data-mark-block]")].find(element => element.dataset.markBlock === block.id);
      if (element) this.cells.push(new InPlaceCells(element, block.markdown, {
        current: () => this.isCurrent(),
        change: markdown => {
          const source = replaceBlock(this.source, block, markdown);
          block.markdown = markdown; this.update(source, "input");
        },
        commit: () => { if (this.isCurrent()) this.actions.change(this.source, "commit"); },
        render: markdown => renderer.renderInline(markdown),
        report: message => actions.report(message),
      }));
    }
  }
  get isEditing(): boolean { return this.notes.isEditing || this.cells.some(cells => cells.isEditing); }
  editNote(id: string): HTMLElement | null { return this.notes.edit(id); }
  noteEntries(): { id: string; quote: string; text: string; attached: boolean }[] { return this.notes.entries(); }
  captureNote(): boolean { return this.notes.capturePending(); }
  hideNoteTip(): void { this.notes.hideTooltip(); }
  refreshNotes(): void { this.notes.refreshMarks(); }
  hasNote(id: string): boolean { return (this.snapshot.rendered.notes ?? []).some(note => note.id === id); }
  addNote(range: Range | null, note: NewFileNote): boolean {
    if (!this.isCurrent() || this.isEditing) return false;
    if (this.hasNote(note.id)) return true;
    const start = range?.startContainer;
    const parent = start instanceof Element ? start : start?.parentElement;
    const element = parent?.closest<HTMLElement>("[data-mark-passage],[data-mark-block]");
    const passage = (this.snapshot.rendered.passages ?? []).find(passage => passage.id === element?.dataset.markPassage)
      ?? this.snapshot.rendered.blocks.find(block => block.id === element?.dataset.markBlock);
    if (range && !passage) { this.actions.report("This passage cannot receive a note safely. Use Add note at the end of the document."); return false; }
    try {
      this.update(insertFileNote(this.source, this.source.split("\n").length, note), "render");
      return true;
    } catch (error) { this.actions.report(`Note was not added: ${String(error)}`); return false; }
  }
  private isCurrent(): boolean { return !this.disposed && this.actions.current() === this.source; }
  private update(source: string, phase: SourceChangePhase): void {
    this.source = source; this.notes?.setSource(source); this.actions.change(source, phase);
  }
  dispose(): void { this.disposed = true; this.notes.dispose(); this.cells.forEach(cells => cells.dispose()); this.cleanup.splice(0).forEach(clean => clean()); }
}
