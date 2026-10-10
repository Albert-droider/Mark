const imageSources = new WeakMap<HTMLImageElement, string>();
export function rememberImageSource(image: HTMLImageElement, source: string): void { imageSources.set(image, source); }
function literalInline(text: string): string {
  return text.replace(/[\\`*_[\]~]/g, "\\$&").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
function inlineDestination(node: Element, destination: string): string {
  const url = destination.replace(/[<>\r\n]/g, ch => encodeURIComponent(ch));
  const title = node.getAttribute("title");
  return `<${url}>${title ? ' "' + title.replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, " ") + '"' : ""}`;
}
function atomicInline(node: Element): string | null {
  if (node.matches("[data-reader-ui],script,style")) return "";
  if (node instanceof HTMLImageElement) return `![${literalInline(node.alt)}](${inlineDestination(node, imageSources.get(node) ?? node.getAttribute("src") ?? "")})`;
  if (node.matches(".katex")) return `$${node.getAttribute("data-mark-tex") ?? node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? ""}$`;
  if (node.matches("br")) return "\n";
  if (!node.matches("code")) return null;
  const text = node.textContent ?? "", fence = "`".repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map(match => match[0].length)) + 1);
  const padding = text.includes("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}
function formattedInline(node: Element, content: string): string {
  if (node.matches("strong,b")) return `**${content}**`;
  if (node.matches("em,i")) return `*${content}*`;
  if (node.matches("del,s")) return `~~${content}~~`;
  if (node.matches("a[href]")) return `[${content}](${inlineDestination(node, node.getAttribute("href") ?? "")})`;
  if (node.matches("sup")) return `^${content}^`;
  if (node.matches("sub")) return `~${content}~`;
  if (node.matches("mark:not(.hl):not(.find-hit):not(.reader-note-mark)")) return `==${content}==`;
  if (node.matches("div,p")) return content + "\n";
  return content;
}
/** Keep edited data, not reader controls, hydrated image bytes or annotation wrappers. */
export function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return literalInline(node.textContent ?? "");
  if (!(node instanceof Element)) return "";
  return atomicInline(node) ?? formattedInline(node, [...node.childNodes].map(inlineMarkdown).join(""));
}
