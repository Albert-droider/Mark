import { el } from "./util";
import { readMarkdownTable, writeMarkdownTable } from "./markdown-table";

/** A cancellable, Markdown-cell editor. Apply is the only document mutation. */
export function tableEditor(markdown: string, apply: (markdown: string) => void, cancel: () => void): HTMLElement | null {
  const table = readMarkdownTable(markdown);
  if (!table) return null;
  const grid = el("div", { class: "live-table-grid" });
  const root = el("section", { class: "live-block-editor", "data-reader-ui": "true", "aria-label": "Edit table" });
  const button = (label: string, className: string, action: () => void): HTMLButtonElement => {
    const button = el("button", { type: "button", class: `btn ${className}` }, [label]);
    button.addEventListener("click", action); return button;
  };
  const draw = (): void => {
    grid.replaceChildren();
    const matrix = [table.headers, ...table.rows];
    for (const [rowIndex, row] of matrix.entries()) {
      const group = el("div", { class: "live-table-row" });
      group.append(el("span", { class: "live-row-label" }, [rowIndex === 0 ? "Header" : `Row ${rowIndex}`]));
      row.forEach((value, column) => {
        const input = el("input", { type: "text", value, "aria-label": `${rowIndex === 0 ? "Header" : `Row ${rowIndex}`} column ${column + 1} (Markdown)`, "data-row": String(rowIndex), "data-column": String(column) });
        input.addEventListener("input", () => { row[column] = input.value; });
        group.append(input);
      });
      if (rowIndex > 0) group.append(button("Remove row", "live-remove-row", () => { table.rows.splice(rowIndex - 1, 1); draw(); }));
      grid.append(group);
    }
    const columns = el("div", { class: "live-column-actions" });
    table.headers.forEach((_header, column) => {
      const remove = button(`Remove column ${column + 1}`, "live-remove-column", () => {
        table.headers.splice(column, 1); table.separators.splice(column, 1); table.rows.forEach(row => row.splice(column, 1)); draw();
      });
      remove.disabled = table.headers.length <= 1; columns.append(remove);
    });
    grid.append(columns);
    addRow.disabled = table.rows.length >= 200; addColumn.disabled = table.headers.length >= 24;
  };
  const addRow = button("Add row", "live-add-row", () => { table.rows.push(Array(table.headers.length).fill("")); draw(); });
  const addColumn = button("Add column", "live-add-column", () => {
    table.headers.push(`Column ${table.headers.length + 1}`); table.separators.push("---"); table.rows.forEach(row => row.push("")); draw();
  });
  const clear = button("Clear data", "live-clear-table", () => { table.rows = table.rows.map(row => row.map(() => "")); draw(); });
  root.append(el("h3", {}, ["Edit table"]), el("p", { class: "live-help" }, ["Cells contain Markdown. Clear data keeps headers and structure. Apply updates this draft; Cancel changes nothing."]),
    el("div", { class: "live-editor-actions" }, [addRow, addColumn, clear]), grid,
    el("div", { class: "live-editor-actions live-editor-footer" }, [button("Apply", "live-apply primary", () => apply(writeMarkdownTable(table))), button("Cancel", "live-cancel", cancel)]));
  root.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } });
  draw(); return root;
}
