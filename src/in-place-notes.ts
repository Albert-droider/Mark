import { readFileNote, FileNoteReader, removeFileNote, updateFileNote, type FileNote } from "./file-notes";
import type { RenderedSource } from "./renderer/base";
import { indexText, matchAnchor, slicesFor } from "./anchors";
import { el } from "./util";

const HOVER_MS = 300;
interface NoteActions {
  current: () => string;
  change: (source: string, phase: "input" | "commit" | "render") => void;
  report: (message: string) => void;
}
interface NoteControl { note: FileNote; marks: HTMLElement[] }

/** File-owned annotations change ink decoration, never the reading geometry. */
export class InPlaceNotes {
  private controls: NoteControl[] = [];
  private snapshot: RenderedSource;
  private active: NoteControl | null = null;
  private cleanup: (() => void)[] = [];
  private source: string;
  private disposed = false;
  private hoverTimer = 0;
  private popup: HTMLElement;
  private input: HTMLTextAreaElement;
  private tip: HTMLElement;
  constructor(private root: HTMLElement, snapshot: RenderedSource, private actions: NoteActions) {
    this.source = actions.current(); this.snapshot = snapshot;
    this.input = el("textarea", { class: "reader-note-input", "aria-label": "Write note", placeholder: "Write a note…" }, []);
    this.input.rows = 3;
    const done = el("button", { type: "button", class: "reader-note-done" }, ["Done"]);
    const remove = el("button", { type: "button", class: "reader-note-remove" }, ["Delete"]);
    done.addEventListener("click", () => this.close()); remove.addEventListener("click", () => this.remove());
    this.popup = el("div", { class: "reader-note-popup", role: "dialog", "aria-label": "Passage note", "data-reader-ui": "" }, [
      el("div", { class: "reader-note-head" }, [el("span", {}, ["Note"]), remove, done]), this.input,
    ]);
    this.tip = el("div", { class: "reader-note-tip note-tip", role: "tooltip", "data-reader-ui": "" }, []);
    this.popup.hidden = true; this.tip.hidden = true; document.body.append(this.popup, this.tip);
    this.input.addEventListener("input", this.capture);
    this.popup.addEventListener("keydown", this.onKey);
    document.addEventListener("pointerdown", this.outside);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("scroll", this.onScroll, true);
    this.apply(snapshot);
  }
  get isEditing(): boolean { return this.active != null; }
  private isCurrent(): boolean { return !this.disposed && this.actions.current() === this.source; }
  setSource(source: string): void {
    if (source === this.source) return;
    const reader = new FileNoteReader(source);
    for (const control of this.controls) {
      const note = reader.read(control.note.startLine);
      if (note?.id === control.note.id) Object.assign(control.note, note);
    }
    this.source = source;
  }
  refreshMarks(): void {
    if (this.active) return;
    this.hideTip(); this.cleanup.splice(0).forEach(clean => clean());
    for (const mark of this.root.querySelectorAll("mark.reader-note-mark")) mark.replaceWith(...mark.childNodes);
    this.root.normalize();
    this.snapshot = { ...this.snapshot, notes: this.controls.map(control => ({ ...control.note, domId: control.note.id })) };
    this.controls = []; this.apply(this.snapshot);
  }
  private apply(snapshot: RenderedSource): void {
    if (!snapshot.notes?.length) return;
    const fullIndex = indexText(this.root), claimed: { start: number; end: number }[] = [];
    const globalSlices = fullIndex.runs.flatMap(run => run.slices);
    const offsets = new Map(globalSlices.map(slice => [slice.node, slice.start]));
    const jobs: { absolute: number; slice: ReturnType<typeof slicesFor>[number]; control: NoteControl }[] = [];
    for (const note of snapshot.notes ?? []) {
      const control: NoteControl = { note: { ...note }, marks: [] }; this.controls.push(control);
      if (!note.quote) continue;
      let scope = this.root;
      if (!note.anchors?.length) {
        const previous = [...(snapshot.passages ?? []), ...snapshot.blocks].filter(block => block.endLine < note.startLine)
          .sort((a, b) => b.endLine - a.endLine)[0];
        scope = [...this.root.querySelectorAll<HTMLElement>("[data-mark-passage],[data-mark-block]")]
          .find(node => node.dataset.markPassage === previous?.id || node.dataset.markBlock === previous?.id) ?? this.root;
      }
      const index = scope === this.root ? fullIndex : indexText(scope);
      const base = scope === this.root ? 0 : offsets.get(index.runs[0]?.slices[0]?.node) ?? 0;
      const anchors = note.anchors?.length ? note.anchors : [{ text: note.quote, prefix: "", suffix: "" }];
      const matches = anchors.map(anchor => matchAnchor([{ text: index.text, start: 0 }], anchor));
      if (matches.some(match => match.status !== "found")) continue;
      const regions = matches.flatMap(match => match.status === "found" ? [{ start: base + match.start, end: base + match.end }] : []);
      if (regions.some(region => claimed.some(other => region.start < other.end && other.start < region.end))) continue;
      claimed.push(...regions);
      for (const region of regions) for (const slice of slicesFor(fullIndex, region.start, region.end)) {
        jobs.push({ absolute: (offsets.get(slice.node) ?? 0) + slice.start, slice, control });
      }
    }
    for (const { slice, control } of jobs.sort((a, b) => b.absolute - a.absolute)) {
      const range = document.createRange(); range.setStart(slice.node, slice.start); range.setEnd(slice.node, slice.end);
      const mark = el("mark", { class: "reader-note-mark", "data-reader-note": control.note.id, tabindex: "0", role: "button", "aria-label": "Read or edit note" }, []);
      range.surroundContents(mark); control.marks.unshift(mark); this.wireMark(mark, control);
    }
  }
  private wireMark(mark: HTMLElement, control: NoteControl): void {
    const click = (event: Event): void => { event.stopPropagation(); this.open(control); };
    const over = (): void => {
      if (this.active) return;
      this.hideTip(); this.hoverTimer = window.setTimeout(() => {
        this.tip.textContent = control.note.text || "Empty note · click to write";
        this.tip.hidden = false; this.place(this.tip, mark);
      }, HOVER_MS);
    };
    const key = (event: KeyboardEvent): void => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); click(event); } };
    mark.addEventListener("click", click); mark.addEventListener("pointerover", over);
    mark.addEventListener("pointerout", this.hideTip); mark.addEventListener("focus", over); mark.addEventListener("blur", this.hideTip);
    mark.addEventListener("keydown", key);
    this.cleanup.push(() => {
      mark.removeEventListener("click", click); mark.removeEventListener("pointerover", over);
      mark.removeEventListener("pointerout", this.hideTip); mark.removeEventListener("focus", over); mark.removeEventListener("blur", this.hideTip);
      mark.removeEventListener("keydown", key);
    });
  }
  hideTooltip(): void { this.hideTip(); }
  capturePending(): boolean { return !this.active || this.capture(); }
  entries(): { id: string; quote: string; text: string; attached: boolean }[] {
    return this.controls.map(control => ({ id: control.note.id, quote: control.note.quote,
      text: control.note.text, attached: control.marks.length > 0 }));
  }
  edit(id: string): HTMLElement | null {
    const matches = this.controls.filter(control => control.note.id === id);
    if (matches.length !== 1) { this.actions.report("This note ID is not unique. Its source is unchanged."); return null; }
    this.open(matches[0]); return matches[0].marks[0] ?? null;
  }
  private open(control: NoteControl): void {
    if (!this.isCurrent()) return;
    if (this.controls.filter(other => other.note.id === control.note.id).length !== 1) {
      this.actions.report("This note ID is not unique. Its source is unchanged."); return;
    }
    this.hideTip(); this.active = control; this.input.value = control.note.text;
    this.popup.hidden = false; this.place(this.popup, control.marks[0]); this.input.focus({ preventScroll: true });
  }
  private capture = (): boolean => {
    const active = this.active;
    if (!active) return true;
    if (!this.isCurrent()) { this.actions.report("This document changed. Your typed note is still here; copy it before reloading."); return false; }
    const previous = this.source;
    const records = this.controls.map(control => ({ control, note: { ...control.note } }));
    try {
      const original = active.note;
      const source = updateFileNote(previous, original, this.input.value);
      const end = original.endOffset + source.length - previous.length;
      const parsed = readFileNote(source.slice(original.startOffset, end), 1);
      if (!parsed) throw new Error("The edited note could not be read back.");
      const lineDelta = parsed.endLine - 1 - (original.endLine - original.startLine), byteDelta = source.length - previous.length;
      for (const control of this.controls) if (control !== active && control.note.startOffset > original.startOffset) {
        control.note.startOffset += byteDelta; control.note.endOffset += byteDelta;
        control.note.startLine += lineDelta; control.note.endLine += lineDelta;
      }
      Object.assign(original, parsed, { startOffset: original.startOffset, endOffset: end,
        startLine: original.startLine, endLine: original.startLine + parsed.endLine - 1 });
      this.source = source; this.actions.change(source, "input"); return true;
    } catch (error) {
      if (this.actions.current() === previous) {
        this.source = previous;
        for (const { control, note } of records) Object.assign(control.note, note);
      }
      this.actions.report(`Note was not changed: ${String(error)}`); return false;
    }
  };
  private close(): void {
    if (!this.active || !this.capture()) return;
    const id = this.active.note.id; this.active = null; this.popup.hidden = true;
    this.actions.change(this.source, "commit");
    this.controls.find(control => control.note.id === id)?.marks[0]?.focus({ preventScroll: true });
  }
  private remove(): void {
    if (!this.active || !this.isCurrent() || !window.confirm("Delete this note? Earlier versions remain in history.")) return;
    try { this.actions.change(removeFileNote(this.source, this.active.note), "render"); }
    catch (error) { this.actions.report(String(error)); }
  }
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
      event.preventDefault(); event.stopPropagation(); this.close();
    }
  };
  private outside = (event: PointerEvent): void => {
    if (!this.active || !(event.target instanceof Node) || this.popup.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".reader-note-mark")) return;
    this.close();
  };
  private hideTip = (): void => { window.clearTimeout(this.hoverTimer); this.hoverTimer = 0; this.tip.hidden = true; };
  private onResize = (): void => { this.hideTip(); if (this.active) this.place(this.popup, this.active.marks[0]); };
  private onScroll = (event: Event): void => {
    if (event.target instanceof Node && this.popup.contains(event.target)) return;
    this.hideTip(); if (this.active) this.place(this.popup, this.active.marks[0]);
  };
  private place(panel: HTMLElement, anchor?: HTMLElement): void {
    const rect = anchor?.getBoundingClientRect(), margin = 8;
    const width = panel.offsetWidth, height = panel.offsetHeight;
    const left = rect?.left ?? window.innerWidth - width - margin, below = (rect?.bottom ?? 64) + 6;
    const top = below + height <= window.innerHeight - margin ? below : (rect?.top ?? below) - height - 6;
    panel.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
    panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
  }
  dispose(): void {
    this.disposed = true; this.active = null; this.hideTip(); this.cleanup.splice(0).forEach(clean => clean());
    this.input.removeEventListener("input", this.capture); this.popup.removeEventListener("keydown", this.onKey);
    document.removeEventListener("pointerdown", this.outside); window.removeEventListener("resize", this.onResize);
    document.removeEventListener("scroll", this.onScroll, true); this.popup.remove(); this.tip.remove();
  }
}
