import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../note-editor";
const editors: NoteEditor[] = [];
afterEach(() => { editors.forEach(editor => editor.dispose()); editors.length = 0; document.body.innerHTML = ""; localStorage.clear(); });
function open(text: string) {
  const actions = { change: vi.fn(), save: vi.fn(), close: vi.fn(), create: vi.fn(), export: vi.fn(), recovery: vi.fn(), browse: vi.fn(), visibility: vi.fn() };
  const editor = new NoteEditor(actions); editors.push(editor); document.body.append(editor.root); editor.open(text, "Note.md");
  return { editor, actions };
}
describe("document-like notes", () => {
  it("toggles only the chosen task in a live preview and reports the Markdown change", () => {
    const source = "# Tasks\n\n- [ ] Same task\n- [x] Same task\n";
    const { editor, actions } = open(source);
    editor.root.querySelector<HTMLButtonElement>(".note-preview-toggle")!.click();
    const checks = editor.root.querySelectorAll<HTMLInputElement>(".note-preview input[type=checkbox]");
    expect(checks).toHaveLength(2);
    expect(checks[1].disabled).toBe(false);
    checks[1].click();
    expect(editor.input.value).toBe("# Tasks\n\n- [ ] Same task\n- [ ] Same task\n");
    expect(actions.change).toHaveBeenCalledTimes(1);
    expect(editor.root.querySelectorAll<HTMLInputElement>(".note-preview input[type=checkbox]")[1].checked).toBe(false);
  });
  it("keeps unmapped authored checkboxes disabled in a standalone note preview", () => {
    const { editor } = open('<input type=checkbox data-mark-task=fake>\n\n- [ ] Real task\n');
    editor.showPreview();
    const checks = editor.root.querySelectorAll<HTMLInputElement>(".note-preview input[type=checkbox]");
    expect(checks[0].disabled).toBe(true);
    expect(checks[1].disabled).toBe(false);
  });
  it("opens a table editor, fills a cell and applies it to this draft", () => {
    const { editor, actions } = open("Before\n\n| Topic | Status |\n| --- | --- |\n| Reading | todo |\n\nAfter\n");
    editor.showPreview();
    const edit = editor.root.querySelector<HTMLButtonElement>(".live-edit-table");
    expect(edit).not.toBeNull(); edit!.click();
    const cell = editor.root.querySelector<HTMLInputElement>('input[data-row="1"][data-column="1"]')!;
    cell.value = "done"; cell.dispatchEvent(new Event("input", { bubbles: true }));
    editor.root.querySelector<HTMLButtonElement>(".live-apply")!.click();
    expect(editor.input.value).toBe("Before\n\n| Topic | Status |\n| --- | --- |\n| Reading | done |\n\nAfter\n");
    expect(editor.root.querySelector(".note-preview tbody td:last-child")?.textContent).toBe("done");
    expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("clears table data but retains its headers, and can cancel structural changes", () => {
    const source = "| Topic | Status |\n| :--- | ---: |\n| Reading | todo |\n";
    const { editor, actions } = open(source); editor.showPreview();
    editor.root.querySelector<HTMLButtonElement>(".live-edit-table")!.click();
    editor.root.querySelector<HTMLButtonElement>(".live-add-row")!.click();
    editor.root.querySelector<HTMLButtonElement>(".live-add-column")!.click();
    expect(editor.root.querySelectorAll('.live-table-row input[data-column="2"]')).toHaveLength(3);
    editor.root.querySelector<HTMLButtonElement>(".live-cancel")!.click();
    expect(editor.input.value).toBe(source); expect(actions.change).not.toHaveBeenCalled();
    editor.root.querySelector<HTMLButtonElement>(".live-edit-table")!.click();
    editor.root.querySelector<HTMLButtonElement>(".live-clear-table")!.click();
    editor.root.querySelector<HTMLButtonElement>(".live-apply")!.click();
    expect(editor.input.value).toBe("| Topic | Status |\n| :--- | ---: |\n|  |  |\n");
    expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("edits an artifact body and keeps its fence and surrounding source", () => {
    const source = "Before\n\n```chart\nbar\ntitle Demo\nReading | 12\n```\n\nAfter\n";
    const { editor, actions } = open(source); editor.showPreview();
    const edit = editor.root.querySelector<HTMLButtonElement>(".live-edit-artifact");
    expect(edit).not.toBeNull(); edit!.click();
    const input = editor.root.querySelector<HTMLTextAreaElement>(".live-fence-input")!;
    input.value = "bar\ntitle Updated\nReading | 99\n";
    editor.root.querySelector<HTMLButtonElement>(".live-apply")!.click();
    expect(editor.input.value).toBe(source.replace("title Demo\nReading | 12", "title Updated\nReading | 99"));
    expect(editor.root.querySelector(".artifact-label")?.textContent).toBe("Updated");
    expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("undoes and redoes a live change, reporting each restored Markdown value", () => {
    const source = "- [ ] Study\n";
    const { editor, actions } = open(source); editor.showPreview();
    editor.root.querySelector<HTMLInputElement>(".note-preview input")!.click();
    const undo = editor.root.querySelector<HTMLButtonElement>(".note-undo");
    expect(undo).not.toBeNull(); expect(undo!.disabled).toBe(false);
    undo!.click(); expect(editor.input.value).toBe(source);
    editor.root.querySelector<HTMLButtonElement>(".note-redo")!.click();
    expect(editor.input.value).toBe("- [x] Study\n");
    expect(actions.change).toHaveBeenCalledTimes(3);
  });
  it("formats the selection and reports a change without changing source text elsewhere", () => {
    const { editor, actions } = open("My own idea");
    editor.input.setSelectionRange(3, 6);
    editor.root.querySelector<HTMLButtonElement>(".note-bold")!.click();
    expect(editor.input.value).toBe("My **own** idea");
    expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("handles editor shortcuts without passing save/format to reader shortcuts", () => {
    const { editor, actions } = open("idea");
    editor.input.setSelectionRange(0, 4);
    const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
    editor.input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.input.value).toBe("**idea**");
    editor.input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(actions.save).toHaveBeenCalledTimes(1);
  });
  it("sanitizes preview, keeps exact Markdown, and makes preview links inert", () => {
    const source = '# Idea\n\n**Bold**\n\n<script>alert(1)</script><img src=x onerror="alert(2)">\n\n[link](other.md)';
    const { editor } = open(source);
    editor.root.querySelector<HTMLButtonElement>(".note-preview-toggle")!.click();
    expect(editor.root.querySelector(".note-preview strong")?.textContent).toBe("Bold");
    expect(editor.root.querySelector("script,[onerror]")).toBeNull();
    expect(editor.input.value).toBe(source);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    editor.root.querySelector<HTMLAnchorElement>(".note-preview a")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
