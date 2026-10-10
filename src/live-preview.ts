import type { RenderedSource } from "./renderer/base";
import type { SourceBlock } from "./share";
import { replaceBlock, toggleTask } from "./live-markdown";
import { tableEditor } from "./live-table-editor";
import { fenceEditor } from "./live-fence-editor";
import { el } from "./util";

export interface LiveFocus { taskLine?: number; blockLine?: number }
interface LiveActions {
  current: () => string;
  change: (source: string, focus?: LiveFocus) => void;
  report: (message: string) => void;
}

/** Owns handlers for one rendered snapshot; the read-only reader never constructs this. */
export class LivePreview {
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private editor: HTMLElement | null = null;
  constructor(root: HTMLElement, private source: string, rendered: RenderedSource, private actions: LiveActions) {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const task = rendered.tasks.find(task => task.id === input.dataset.markTask);
      input.disabled = !task;
      if (!task) continue;
      input.dataset.liveTaskLine = String(task.startLine);
      const change = (): void => {
        if (!this.current()) { input.checked = task.checked; return; }
        try { actions.change(toggleTask(source, task, input.checked), { taskLine: task.startLine }); }
        catch (error) { input.checked = task.checked; actions.report((error as Error).message); }
      };
      input.addEventListener("change", change);
      this.cleanup.push(() => input.removeEventListener("change", change));
    }
    for (const block of rendered.blocks) {
      const element = [...root.querySelectorAll<HTMLElement>("[data-mark-block]")].find(element => element.dataset.markBlock === block.id);
      if (!element) continue;
      const kind = block.kind === "table" ? "table" : block.kind === "artifact" ? "artifact" : "code";
      const edit = el("button", { class: `btn live-edit-${kind}`, type: "button", "data-live-block-line": String(block.startLine) }, [`Edit ${kind}`]);
      edit.addEventListener("click", () => this.editBlock(element, block, edit));
      element.querySelector(".block-actions")?.prepend(edit);
      this.cleanup.push(() => edit.remove());
      const copy = element.querySelector<HTMLButtonElement>(".code-copy");
      if (copy) {
        const copyCode = (): void => {
          if (!this.current()) return;
          const text = element.querySelector("pre code")?.textContent ?? "";
          void navigator.clipboard.writeText(text).then(() => {
            if (this.current()) actions.report("Code copied. No code was executed or uploaded.");
          }).catch(() => { if (this.current()) actions.report("Copy failed. Use Share code → Download Markdown instead."); });
        };
        copy.addEventListener("click", copyCode);
        this.cleanup.push(() => copy.removeEventListener("click", copyCode));
      }
    }
  }
  private editBlock(element: HTMLElement, block: SourceBlock, edit: HTMLButtonElement): void {
    if (!this.current()) return;
    this.editor?.remove();
    const cancel = (): void => { this.editor?.remove(); this.editor = null; edit.focus({ preventScroll: true }); };
    const apply = (markdown: string): void => {
      if (!this.current()) return;
      try { this.actions.change(replaceBlock(this.source, block, markdown), { blockLine: block.startLine }); }
      catch (error) { this.actions.report((error as Error).message); }
    };
    this.editor = block.kind === "table" ? tableEditor(block.markdown, apply, cancel)
      : fenceEditor(block.markdown, block.kind === "artifact", apply, cancel);
    if (!this.editor) { this.actions.report("This block uses unsupported nested, unclosed or large syntax. Edit its Markdown source instead."); return; }
    element.append(this.editor);
    this.editor.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea")?.focus({ preventScroll: true });
    this.editor.scrollIntoView?.({ block: "nearest" });
  }
  private current(): boolean {
    if (this.disposed) return false;
    if (this.actions.current() === this.source) return true;
    this.actions.report("This preview is out of date. Open it again before editing.");
    return false;
  }
  dispose(): void {
    this.disposed = true; this.editor?.remove(); this.editor = null;
    this.cleanup.forEach(clean => clean()); this.cleanup = [];
  }
}
