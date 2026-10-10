import { el } from "./util";

interface SourceEditorActions { change: (source: string) => void; done: () => void }

/** Optional raw Markdown replaces the reader, not a second copy or side workspace. */
export class SourceEditor {
  readonly root: HTMLElement;
  private newline: "\n" | "\r\n";
  readonly input = el("textarea", { class: "source-input", "aria-label": "Document Markdown", spellcheck: "true" });
  constructor(source: string, private actions: SourceEditorActions) {
    this.newline = source.includes("\r\n") ? "\r\n" : "\n";
    this.input.value = source;
    const done = el("button", { class: "btn source-done", type: "button" }, ["Back to reading"]);
    done.addEventListener("click", actions.done);
    this.root = el("div", { class: "source-editor" }, [
      el("div", { class: "source-editor-controls", "data-reader-ui": "true" }, [el("span", {}, ["Markdown · autosaved every 5 seconds"]), done]), this.input,
    ]);
    this.input.addEventListener("input", this.onInput); this.root.addEventListener("keydown", this.onKey);
  }
  focus(): void { this.input.focus({ preventScroll: true }); }
  private onInput = (): void => this.actions.change(this.input.value.replace(/\r?\n/g, this.newline));
  private onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); this.actions.done();
  };
  dispose(): void { this.input.removeEventListener("input", this.onInput); this.root.removeEventListener("keydown", this.onKey); this.root.remove(); }
}
