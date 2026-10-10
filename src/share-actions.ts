import { el } from "./util";
import { ActionPopover } from "./action-popover";
import { icon } from "./icons";
import { exportText, type TextExportKind } from "./export-text";
import { agentContext, tableCsv, type SourceBlock, type ShareSource } from "./share";

/** Explicit local actions, bound to parser provenance rather than author-supplied HTML attributes. */
export function attachShareActions(root: HTMLElement, blocks: SourceBlock[], source: ShareSource, report: (message: string) => void): () => void {
  const menus: ActionPopover[] = [];
  const elements = [...root.querySelectorAll<HTMLElement>("[data-mark-block]")];
  for (const block of blocks) {
    const element = elements.find(el => el.dataset.markBlock === block.id);
    if (!element) continue;
    const tools = el("div", { class: "block-actions", "data-reader-ui": "true" });
    const trigger = el("button", { class: "icon-btn share-trigger", type: "button", title: `Share ${block.kind}`, "aria-label": `Share ${block.kind}` }, [icon("clipboard")]);
    const run = (label: string, className: string, action: () => Promise<void>): HTMLButtonElement => {
      const button = el("button", { class: `btn ${className}`, type: "button" }, [label]);
      button.addEventListener("click", event => {
        event.stopPropagation(); menu.hide();
        if (!root.contains(element)) return;
        void action().catch(() => report("Sharing failed. Your source is unchanged; retry or use reader backup."));
      });
      return button;
    };
    const save = async (contents: string, kind: TextExportKind): Promise<void> => {
      const result = await exportText(contents, `${source.name.replace(/\.[^.]+$/, "")}-${block.kind}-L${block.startLine}`, kind);
      report(result === "cancelled" ? "Export cancelled." : `${block.kind} ${result === "saved" ? "saved to a new file" : "download requested"}. No upload was made.`);
    };
    const buttons = [
      run("Copy Markdown", "share-copy", async () => { await navigator.clipboard.writeText(block.markdown); report("Markdown copied. No upload was made."); }),
      run("Download Markdown…", "share-markdown", () => save(block.markdown, "markdown")),
      run("Download context for agent…", "share-context", async () => save(await agentContext(source, block), "context")),
    ];
    if (block.kind === "code") buttons.unshift(run("Copy code", "share-code", async () => {
      await navigator.clipboard.writeText(element.querySelector("code")?.textContent ?? ""); report("Code copied. No upload was made.");
    }));
    if (block.kind === "table") buttons.splice(2, 0, run("Download CSV…", "share-csv", async () => {
      const table = element.querySelector("table");
      if (!table) throw new Error("Table unavailable");
      await save(tableCsv(table), "csv");
    }));
    const menu = new ActionPopover(trigger, buttons, `actions-${block.id}`, true);
    menu.root.classList.add("reader-share-actions");
    menus.push(menu);
    if (block.kind === "code") {
      const copy = element.querySelector(".code-bar .code-copy");
      if (copy) copy.replaceWith(menu.wrap);
      else element.querySelector(".code-bar")?.append(menu.wrap);
    } else { tools.append(menu.wrap); element.append(tools); }
  }
  return () => { for (const menu of menus) menu.dispose(); };
}
