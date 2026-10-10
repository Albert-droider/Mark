import { el } from "./util";
import { parseChart, parsePlan } from "./artifacts";
import { readMarkdownFence, writeMarkdownFence } from "./markdown-fence";

export function fenceEditor(markdown: string, artifact: boolean, apply: (markdown: string) => void, cancel: () => void): HTMLElement | null {
  const fence = readMarkdownFence(markdown);
  if (!fence) return null;
  const title = artifact ? `Edit ${fence.language} artifact` : `Edit ${fence.language} code`;
  const input = el("textarea", { class: "live-fence-input", "aria-label": `${title} source`, spellcheck: "false" });
  input.value = fence.body;
  const status = el("p", { class: "live-help", role: "status", "aria-live": "polite" });
  const root = el("section", { class: "live-block-editor", "data-reader-ui": "true", "aria-label": title });
  const save = el("button", { type: "button", class: "btn live-apply primary" }, ["Apply"]);
  const close = el("button", { type: "button", class: "btn live-cancel" }, ["Cancel"]);
  close.addEventListener("click", cancel);
  save.addEventListener("click", () => { void commit(); });
  const commit = async (): Promise<void> => {
    save.disabled = true;
    try {
      const language = fence.language.toLowerCase();
      if (["chart", "grafiek"].includes(language) && !parseChart(input.value)) throw new Error("A chart needs at least one Label | number row.");
      if (["plan", "progress", "progressie"].includes(language) && !parsePlan(input.value)) throw new Error("A plan needs at least one Label | percentage row.");
      if (language === "mermaid") {
        const { default: mermaid } = await import("mermaid");
        if (!await mermaid.parse(input.value, { suppressErrors: true })) throw new Error("The diagram syntax is invalid.");
      }
      apply(writeMarkdownFence(fence, input.value));
    } catch (error) { status.textContent = `${(error as Error).message} Fix it or Cancel; the draft is unchanged.`; }
    finally { save.disabled = false; }
  };
  root.append(el("h3", {}, [title]), el("p", { class: "live-help" }, ["Apply updates only this draft. Code is never executed." ]), input, status,
    el("div", { class: "live-editor-actions live-editor-footer" }, [save, close]));
  root.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } });
  return root;
}
