import { describe, expect, it } from "vitest";
import { inlineMarkdown, rememberImageSource } from "../inline-markdown";
import { MarkdownRenderer } from "../renderer/markdown";

function serialize(source: string): string {
  const cell = document.createElement("td");
  cell.innerHTML = new MarkdownRenderer().renderInline(source);
  return inlineMarkdown(cell);
}
describe("edited inline content", () => {
  it("preserves images and link titles instead of silently deleting them", () => {
    expect(serialize('![Figure](./diagram.png "My diagram")')).toBe('![Figure](<./diagram.png> "My diagram")');
    expect(serialize('[Read](./chapter.md "Next chapter")')).toBe('[Read](<./chapter.md> "Next chapter")');
  });
  it("uses the original local image path rather than hydrated image bytes", () => {
    const image = document.createElement("img"); image.alt = "Local"; image.src = "./diagram.png";
    rememberImageSource(image, "./diagram.png"); image.src = "data:image/png;base64,AA==";
    expect(inlineMarkdown(image)).toBe("![Local](<./diagram.png>)");
  });
  it("keeps literal Markdown and HTML as text, and omits reader controls", () => {
    const cell = document.createElement("td");
    cell.textContent = '*literal* <script> & [brackets]';
    const control = document.createElement("button");
    control.dataset.readerUi = "true"; control.textContent = "Share"; cell.append(control);
    expect(inlineMarkdown(cell)).toBe('\\*literal\\* &lt;script> &amp; \\[brackets\\]');
  });
  it("preserves code fences, inline math and annotation text", () => {
    expect(serialize('**Bold** and `a`')).toBe('**Bold** and `a`');
    expect(serialize('$x^2$')).toBe('$x^2$');
    const cell = document.createElement("td"); cell.innerHTML = '<mark class="hl">Kept</mark><br>next';
    expect(inlineMarkdown(cell)).toBe('Kept\nnext');
  });
});
