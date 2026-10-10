import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../note-editor";
const editors: NoteEditor[] = [];
afterEach(() => { editors.forEach(editor => editor.dispose()); editors.length = 0; document.body.innerHTML = ""; localStorage.clear(); });
function open(text: string) {
  const actions = { change: vi.fn(), save: vi.fn(), close: vi.fn(), create: vi.fn(), copySource: vi.fn(), export: vi.fn(), recovery: vi.fn(), browse: vi.fn(), visibility: vi.fn() };
  const editor = new NoteEditor(actions); editors.push(editor); document.body.append(editor.root); editor.open(text, "Note.md");
  return { editor, actions };
}
describe("document-like notes", () => {
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
