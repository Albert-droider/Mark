import { afterEach, describe, expect, it, vi } from "vitest";
import { InPlaceCells } from "../in-place-cells";

const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(clean => clean()); });

function setup() {
  const root = document.createElement("div");
  root.innerHTML = "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>one</td><td>two</td></tr></tbody></table>";
  document.body.append(root);
  const actions = { current: vi.fn(() => true), change: vi.fn(), commit: vi.fn(), render: (text: string) => text, report: vi.fn() };
  const cells = new InPlaceCells(root, "| A | B |\n| --- | --- |\n| one | two |", actions);
  dispose.push(() => { cells.dispose(); root.remove(); });
  const cell = root.querySelector<HTMLTableCellElement>("tbody td")!;
  const key = (value: string, shiftKey = false) => cell.dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }));
  return { root, cells, actions, cell, key };
}

describe("same-cell keyboard actions", () => {
  it("starts with F2, retains multiline Enter, and cancels only this cell with Escape", () => {
    const { cells, actions, cell, key } = setup();
    key("F2"); expect(cells.isEditing).toBe(true);
    cell.textContent = "changed"; cell.dispatchEvent(new Event("input"));
    expect(actions.change).toHaveBeenLastCalledWith(expect.stringContaining("| changed | two |"));
    key("Enter", true); expect(cells.isEditing).toBe(true);
    key("Escape"); expect(cells.isEditing).toBe(false);
    expect(actions.change).toHaveBeenLastCalledWith(expect.stringContaining("| one | two |"));
    expect(cell.textContent).toBe("one");
    expect(actions.commit).toHaveBeenCalledOnce();
  });

  it("keeps a cell available when its cancellation cannot be applied", () => {
    const { cells, actions, cell, key } = setup();
    key("Enter"); cell.textContent = "keep me"; cell.dispatchEvent(new Event("input"));
    actions.change.mockImplementationOnce(() => { throw new Error("source changed"); });
    expect(() => key("Escape")).not.toThrow();
    expect(cells.isEditing).toBe(true); expect(cell.textContent).toBe("keep me");
    expect(actions.report).toHaveBeenLastCalledWith("Cell cancel was not applied: Error: source changed");
    key("Escape"); expect(cells.isEditing).toBe(false);
    expect(cell.textContent).toBe("one");
  });

  it("refuses to begin an edit against a stale source", () => {
    const { cells, actions, cell, key } = setup();
    actions.current.mockReturnValue(false); key("F2");
    expect(cells.isEditing).toBe(false); expect(cell.hasAttribute("contenteditable")).toBe(false);
    expect(actions.change).not.toHaveBeenCalled();
  });

  it("keeps unsupported tables read-only and disposes active cell editing", () => {
    const { root, cells, cell, key } = setup();
    key("Enter"); cells.dispose();
    expect(cell.hasAttribute("contenteditable")).toBe(false);
    const unsupported = new InPlaceCells(root, "not a Markdown table", { current: () => true, change: () => {}, commit: () => {}, render: text => text, report: () => {} });
    dispose.push(() => unsupported.dispose());
    expect(root.title).toContain("cannot be edited safely");
    key("F2"); expect(unsupported.isEditing).toBe(false);
  });
});
