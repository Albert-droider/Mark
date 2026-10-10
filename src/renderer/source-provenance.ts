import type MarkdownIt from "markdown-it";
import type { SourceTask } from "./base";
import { sliceSourceLines, type SourceBlock } from "../share";

interface SourceRender { source: string; offset: number; blocks: SourceBlock[]; tasks: SourceTask[] }
export function sourceBlock(env: SourceRender, map: [number, number] | null, kind: SourceBlock["kind"]): string {
  if (!map) return "";
  const block: SourceBlock = { id: `block-${crypto.randomUUID()}`, kind, startLine: env.offset + map[0] + 1, endLine: env.offset + map[1], markdown: "" };
  block.markdown = sliceSourceLines(env.source, block.startLine, block.endLine);
  env.blocks.push(block);
  return ` data-mark-block="${block.id}"`;
}


/** Only parser-generated task inputs receive source-write authority. */
export function installTaskProvenance(md: MarkdownIt): void {
  md.core.ruler.after("github-task-lists", "mark-task-source", state => {
    const env = state.env as SourceRender;
    for (let i = 2; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== "inline" || !token.map || state.tokens[i - 2].attrGet("class") !== "task-list-item") continue;
      const checkbox = token.children?.find(child => child.type === "html_inline" && child.content.startsWith('<input class="task-list-item-checkbox"'));
      if (!checkbox) continue;
      const startLine = env.offset + token.map[0] + 1;
      const markdown = sliceSourceLines(env.source, startLine, startLine);
      const marker = /^(?:\uFEFF)?[\t >]*(?:[-+*]|\d+[.)])[\t ]+\[([ xX])\](?=\s)/.exec(markdown);
      if (!marker) continue;
      const task: SourceTask = { id: `task-${crypto.randomUUID()}`, startLine, markdown, checked: marker[1] !== " " };
      env.tasks.push(task);
      checkbox.content = checkbox.content.replace("<input ", `<input data-mark-task="${task.id}" `);
    }
  });
}
