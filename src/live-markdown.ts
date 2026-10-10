import type { SourceTask } from "./renderer/base";
import { sliceSourceLines, type SourceBlock } from "./share";

interface SourceReplacement { startLine: number; endLine: number; expected: string; replacement: string }
function replaceLines(source: string, change: SourceReplacement): string {
  const { startLine, endLine, expected, replacement } = change;
  if (!expected || startLine < 1 || endLine < startLine || !Number.isInteger(startLine) || !Number.isInteger(endLine)
    || sliceSourceLines(source, startLine, endLine) !== expected) {
    throw new Error("This preview is out of date. Open it again before editing.");
  }
  let from = 0;
  for (let line = 1; line < startLine; line++) from = source.indexOf("\n", from) + 1;
  return source.slice(0, from) + replacement + source.slice(from + expected.length);
}

/** Change the parser-mapped marker, not the first matching label in the document. */
export function toggleTask(source: string, task: SourceTask, checked: boolean): string {
  const marker = /^((?:\uFEFF)?[\t >]*(?:[-+*]|\d+[.)])[\t ]+\[)([ xX])(\])/.exec(task.markdown);
  if (!marker) throw new Error("This task must be edited in Markdown source.");
  const at = marker[1].length;
  const changed = task.markdown.slice(0, at) + (checked ? "x" : " ") + task.markdown.slice(at + 1);
  return replaceLines(source, { startLine: task.startLine, endLine: task.startLine, expected: task.markdown, replacement: changed });
}

export function replaceBlock(source: string, block: SourceBlock, markdown: string): string {
  return replaceLines(source, { startLine: block.startLine, endLine: block.endLine, expected: block.markdown, replacement: markdown });
}
