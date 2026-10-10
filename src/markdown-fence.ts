export interface MarkdownFence { opening: string; closing: string; marker: string; body: string; eol: string; trailing: boolean; language: string }

export function readMarkdownFence(markdown: string): MarkdownFence | null {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const trailing = lines.at(-1) === "";
  if (trailing) lines.pop();
  const head = /^([ ]{0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(lines[0] ?? "");
  if (!head || lines.length < 2) return null;
  const closing = lines.at(-1)!;
  const tail = /^([ ]{0,3})(`+|~+)[\t ]*$/.exec(closing);
  if (!tail || tail[2][0] !== head[2][0] || tail[2].length < head[2].length) return null;
  const bodyLines = lines.slice(1, -1);
  return { opening: lines[0], closing, marker: head[2], language: head[3].trim().split(/\s+/)[0] || "text",
    body: bodyLines.join(eol) + (bodyLines.length ? eol : ""), eol, trailing };
}

export function writeMarkdownFence(fence: MarkdownFence, body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\n/g, fence.eol);
  const char = fence.marker[0];
  const runs = [...normalized.matchAll(char === "`" ? /`+/g : /~+/g)].map(match => match[0].length + 1);
  const marker = char.repeat(Math.max(fence.marker.length, ...runs));
  const opening = fence.opening.replace(/`{3,}|~{3,}/, marker);
  const closing = marker.length === fence.marker.length ? fence.closing : fence.closing.replace(/`+|~+/, marker);
  return opening + fence.eol + normalized + (normalized && !normalized.endsWith(fence.eol) ? fence.eol : "") + closing + (fence.trailing ? fence.eol : "");
}
