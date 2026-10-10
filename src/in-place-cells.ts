import { inlineMarkdown } from "./inline-markdown";
import { readMarkdownTable, writeMarkdownTable, type MarkdownTable } from "./markdown-table";

interface CellLocation { cell: HTMLTableCellElement; row: number; column: number }
interface CellEdit extends CellLocation { original: string; changed: boolean }

interface CellActions {
  current: () => boolean;
  change: (markdown: string) => void;
  commit: () => void;
  render: (markdown: string) => string;
  report: (message: string) => void;
}

/** Typing stays inside the existing cell; the table itself is never duplicated. */
export class InPlaceCells {
  private table: MarkdownTable | null;
  private active: CellEdit | null = null;
  private cleanup: (() => void)[] = [];
  constructor(element: HTMLElement, markdown: string, private actions: CellActions) {
    this.table = readMarkdownTable(markdown);
    const rendered = element.querySelector("table");
    if (!this.table || !rendered || rendered.rows.length !== this.table.rows.length + 1 || [...rendered.rows].some(row => row.cells.length !== this.table!.headers.length)) {
      element.title = "This table cannot be edited safely in place. Its source is unchanged."; return;
    }
    [...rendered.rows].forEach((row, index) => {
      [...row.cells].forEach((cell, column) => this.wire({ cell, row: index, column }));
    });
  }
  get isEditing(): boolean { return this.active != null; }
  private wire(location: CellLocation): void {
    const { cell } = location;
    cell.title = "Double-click or press F2 to edit this cell"; cell.tabIndex = 0;
    const edit = (): void => this.begin(location);
    const input = (): void => { if (this.active?.cell === cell) this.capture(); };
    const blur = (): void => this.finish();
    const key = (event: KeyboardEvent): void => this.onKey(event, location);
    const paste = (event: ClipboardEvent): void => {
      if (this.active?.cell !== cell || !event.clipboardData) return;
      event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    };
    cell.addEventListener("dblclick", edit); cell.addEventListener("input", input); cell.addEventListener("blur", blur);
    cell.addEventListener("keydown", key); cell.addEventListener("paste", paste);
    this.cleanup.push(() => { cell.removeEventListener("dblclick", edit); cell.removeEventListener("input", input); cell.removeEventListener("blur", blur); cell.removeEventListener("keydown", key); cell.removeEventListener("paste", paste); });
  }
  private value(row: number, column: number): string { return (row === 0 ? this.table!.headers : this.table!.rows[row - 1])[column]; }
  private begin(location: CellLocation): void {
    const { cell, row, column } = location;
    if (!this.actions.current() || this.active?.cell === cell) return;
    this.finish();
    this.active = { ...location, original: this.value(row, column), changed: false };
    cell.setAttribute("contenteditable", "true"); cell.spellcheck = true; cell.focus({ preventScroll: true });
  }
  private capture(): void {
    const active = this.active;
    if (!active || !this.actions.current()) return;
    const rows = active.row === 0 ? this.table!.headers : this.table!.rows[active.row - 1];
    const previous = rows[active.column];
    rows[active.column] = inlineMarkdown(active.cell).replace(/\n$/, "");
    try { this.actions.change(writeMarkdownTable(this.table!)); active.changed = true; }
    catch (error) {
      rows[active.column] = previous; active.cell.innerHTML = this.actions.render(previous);
      this.actions.report(`Cell edit was not applied: ${String(error)}`);
    }
  }
  private finish(): void {
    const active = this.active;
    if (!active) return;
    this.active = null; active.cell.removeAttribute("contenteditable");
    if (active.changed) active.cell.innerHTML = this.actions.render(this.value(active.row, active.column));
    this.actions.commit();
  }
  private onKey(event: KeyboardEvent, location: CellLocation): void {
    if (!this.active && (event.key === "F2" || event.key === "Enter")) {
      event.preventDefault(); event.stopPropagation(); this.begin(location); return;
    }
    if (this.active?.cell !== location.cell) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); this.cancelCell();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); location.cell.blur();
    }
  }
  private cancelCell(): void {
    const active = this.active;
    if (!active) return;
    const rows = active.row === 0 ? this.table!.headers : this.table!.rows[active.row - 1];
    const changed = rows[active.column];
    rows[active.column] = active.original;
    try {
      this.actions.change(writeMarkdownTable(this.table!)); active.changed = true;
      this.finish(); active.cell.blur();
    } catch (error) {
      rows[active.column] = changed;
      this.actions.report(`Cell cancel was not applied: ${String(error)}`);
    }
  }
  dispose(): void { this.active?.cell.removeAttribute("contenteditable"); this.active = null; this.cleanup.splice(0).forEach(clean => clean()); }
}
