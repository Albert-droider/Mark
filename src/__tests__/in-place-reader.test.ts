import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Viewer } from "../viewer";
import { addHighlight, getHighlights, setGroupNote } from "../highlights";
import { canonicalPath } from "../util";

const viewers: Viewer[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => { viewers.splice(0).forEach(viewer => { viewer.dispose(); viewer.root.remove(); }); });
function open(source: string): Viewer {
  const viewer = new Viewer(); viewers.push(viewer); document.body.append(viewer.root);
  viewer.setEditable(true); viewer.render({ name: "Study.md", path: "C:/fixtures/Study.md", kind: "markdown", source });
  return viewer;
}
describe("the reading page is the editing surface", () => {
  it("retains a table annotation in recovery immediately after its quote changes", () => {
    const key = canonicalPath("C:/fixtures/Study.md");
    const added = addHighlight(key, [{ text: "Original", prefix: "", suffix: "" }], "pink");
    setGroupNote(key, added[0].group, "Keep my explanation.");
    const viewer = open("| Topic | State |\n| --- | --- |\n| Source | Original |\n");
    const cell = viewer.root.querySelector<HTMLTableCellElement>("tbody td:nth-child(2)")!;
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    cell.textContent = "Changed"; cell.dispatchEvent(new Event("input", { bubbles: true })); cell.blur();
    expect(getHighlights(key)[0].note).toBe("Keep my explanation.");
    expect(viewer.recoveryButton.textContent).toContain("(1)");
    expect(document.querySelector(".recovery-items")?.textContent).toContain("Keep my explanation.");
  });
  it("reports malformed heading links without an uncaught URI error", () => {
    const viewer = open('<a href="#%E0%A4%A">Broken heading</a>');
    const messages: string[] = []; viewer.onNote = message => messages.push(message);
    viewer.root.querySelector<HTMLAnchorElement>("a")!.click();
    expect(messages).toContain("This heading link contains invalid URL encoding.");
  });
  it("has one clipboard action in the code Copy slot and puts table sharing below the table", () => {
    const viewer = open("```ts\nconst joint = true;\n```\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    const code = viewer.root.querySelector<HTMLElement>(".code-block")!;
    expect(code.querySelector(".code-copy")).toBeNull();
    expect(code.querySelector(".code-bar .share-trigger svg")).not.toBeNull();
    expect(code.querySelectorAll(".share-trigger")).toHaveLength(1);
    expect(code.querySelector(":scope > .block-actions")).toBeNull();
    const table = viewer.root.querySelector<HTMLElement>(".table-block")!;
    expect(table.lastElementChild?.classList.contains("block-actions")).toBe(true);
    expect(table.querySelector(".share-trigger")?.getAttribute("aria-label")).toBe("Share table");
  });
  it("toggles the actual reader checkpoint and changes its own Markdown without opening Notes", () => {
    const source = "# Study\r\n\r\n- [ ] Same\r\n- [ ] Same\r\n";
    const viewer = open(source);
    const inputs = viewer.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(inputs[1].disabled).toBe(false); inputs[1].click();
    expect(viewer.file?.source).toBe(source.replace('- [ ] Same\r\n- [ ] Same', '- [ ] Same\r\n- [x] Same'));
    expect(document.querySelector<HTMLElement>(".note-editor")?.hidden).toBe(true);
    inputs[1].click(); expect(viewer.file?.source).toBe(source);
  });
  it("edits Markdown in the reader itself and returns without making a source copy", () => {
    const viewer = open("# Source\n\nOriginal."); viewer.editMarkdown();
    const input = viewer.root.querySelector<HTMLTextAreaElement>(".source-input")!;
    expect(input.value).toBe(viewer.file?.source); expect(viewer.isEditing).toBe(true);
    input.value = "# Source\n\nMy joint attention."; input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(viewer.file?.source).toBe(input.value);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(viewer.root.querySelector(".source-input")).toBeNull(); expect(viewer.root.textContent).toContain("My joint attention.");
    expect(document.querySelector<HTMLElement>(".note-editor")?.hidden).toBe(true);
  });
  it("keeps the existing CRLF convention while editing raw Markdown", () => {
    const viewer = open("# Source\r\n\r\nOriginal.\r\n"); viewer.editMarkdown();
    const input = viewer.root.querySelector<HTMLTextAreaElement>(".source-input")!;
    input.value = "# Source\n\nChanged.\n"; input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(viewer.file?.source).toBe("# Source\r\n\r\nChanged.\r\n");
  });
  it("double-clicks and types in the actual table cell without a duplicate table or form", () => {
    const viewer = open("Before\n\n| Topic | State |\n| --- | ---: |\n| **Study** | pending |\n\nAfter\n");
    const cell = viewer.root.querySelector<HTMLTableCellElement>("tbody td")!;
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(cell.getAttribute("contenteditable")).toBe("true");
    expect(viewer.root.querySelectorAll("table")).toHaveLength(1);
    expect(viewer.root.querySelector(".live-table-editor,textarea")).toBeNull();
    cell.innerHTML = "<strong>Joint</strong> | attention";
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    expect(viewer.file?.source).toContain("| **Joint** \\| attention | pending |");
    expect(viewer.file?.source).toMatch(/^Before\n/);
    cell.blur();
    expect(cell.hasAttribute("contenteditable")).toBe(false);
    expect(cell.querySelector("strong")?.textContent).toBe("Joint");
    expect(document.querySelector<HTMLElement>(".note-editor")?.hidden).toBe(true);
  });
});
