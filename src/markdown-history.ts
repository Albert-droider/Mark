interface Edit { at: number; before: string; after: string }

/** Bounded text deltas, so tiny edits do not copy a whole book into each undo step. */
export class MarkdownHistory {
  private current = "";
  private past: Edit[] = [];
  private future: Edit[] = [];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  reset(text: string): void { this.current = text; this.past = []; this.future = []; }
  record(text: string): void {
    if (text === this.current) return;
    let at = 0;
    while (at < Math.min(text.length, this.current.length) && text[at] === this.current[at]) at++;
    let tail = 0;
    while (tail < Math.min(text.length, this.current.length) - at
      && text[text.length - 1 - tail] === this.current[this.current.length - 1 - tail]) tail++;
    const edit = { at, before: this.current.slice(at, this.current.length - tail), after: text.slice(at, text.length - tail) };
    this.past.push(edit); this.future = []; this.current = text;
    let size = this.past.reduce((sum, edit) => sum + edit.before.length + edit.after.length, 0);
    while (this.past.length > 100 || size > 2_000_000) {
      const removed = this.past.shift()!; size -= removed.before.length + removed.after.length;
    }
  }
  undo(): string | null {
    const edit = this.past.pop(); if (!edit) return null;
    this.current = this.current.slice(0, edit.at) + edit.before + this.current.slice(edit.at + edit.after.length);
    this.future.push(edit); return this.current;
  }
  redo(): string | null {
    const edit = this.future.pop(); if (!edit) return null;
    this.current = this.current.slice(0, edit.at) + edit.after + this.current.slice(edit.at + edit.before.length);
    this.past.push(edit); return this.current;
  }
}
