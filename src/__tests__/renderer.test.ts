import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownRenderer } from "../renderer/markdown";
import { setSettings } from "../store";
import { DEFAULT_SETTINGS } from "../types";

const sample = [
  "# My Document",
  "",
  "Inline `code` and a [link](https://example.com).",
  "",
  "```ts",
  "const x: number = 42;",
  "console.log(x);",
  "```",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "- [x] done",
  "- [ ] todo",
  "",
  "Inline math $E=mc^2$ and block:",
  "",
  "$$\\int_0^1 x\\,dx$$",
  "",
  "Footnote[^1].",
  "",
  "[^1]: note text",
  "",
  ":::tip",
  "tip body",
  ":::",
  "",
  ":smile:",
  "",
  "==highlighted==",
  "",
  "Term",
  ": definition",
  "",
  "H~2~O and X^2^",
].join("\n");

describe("MarkdownRenderer", () => {
  beforeEach(() => setSettings(structuredClone(DEFAULT_SETTINGS)));

  it("renders fenced code with copy button + highlight.js", () => {
    const r = new MarkdownRenderer();
    const div = document.createElement("div");
    div.innerHTML = r.render(sample);
    expect(div.querySelector(".code-block .code-copy")).toBeTruthy();
    expect(div.querySelector("code.hljs.language-ts")).toBeTruthy();
  });

  it("renders GFM tables", () => {
    const div = document.createElement("div");
    div.innerHTML = new MarkdownRenderer().render(sample);
    expect(div.querySelector("table th")?.textContent?.trim()).toBe("A");
  });

  it("renders task list checkboxes", () => {
    const div = document.createElement("div");
    div.innerHTML = new MarkdownRenderer().render(sample);
    const boxes = div.querySelectorAll(".task-list-item input[type=checkbox]");
    expect(boxes.length).toBe(2);
  });

  it("renders math via KaTeX and keeps inline styles after sanitization", () => {
    const div = document.createElement("div");
    div.innerHTML = new MarkdownRenderer().render(sample);
    expect(div.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(div.querySelector(".katex-display")).toBeTruthy();
    // KaTeX relies on inline styles; DOMPurify must preserve them.
    expect(div.querySelector(".katex span[style]")).toBeTruthy();
  });

  it("renders footnotes, callouts, mark, deflist, sub/sup", () => {
    const div = document.createElement("div");
    div.innerHTML = new MarkdownRenderer().render(sample);
    expect(div.querySelector(".footnotes")).toBeTruthy();
    expect(div.querySelector(".callout.callout-tip")).toBeTruthy();
    expect(div.querySelector("mark")?.textContent).toBe("highlighted");
    expect(div.querySelector("dl")).toBeTruthy();
    expect(div.querySelector("sub")?.textContent).toBe("2");
    const sups = [...div.querySelectorAll("sup")].map((s) => s.textContent);
    expect(sups).toContain("2");
  });

  it("adds heading anchors", () => {
    const div = document.createElement("div");
    div.innerHTML = new MarkdownRenderer().render(sample);
    expect(div.querySelector("h1")?.getAttribute("id")).toBe("h-my-document");
  });

  it("expands emoji shortcodes", () => {
    const html = new MarkdownRenderer().render(sample);
    expect(html).not.toContain(":smile:");
    expect(html).toMatch(/\u{1F600}|\u{1F604}/u);
  });

  it("strips dangerous markup but keeps content", () => {
    const r = new MarkdownRenderer();
    const html = r.render("<script>alert(1)</script>\n\n**bold**");
    expect(html).not.toContain("<script");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("drops YAML frontmatter instead of turning it into a heading", () => {
    const html = new MarkdownRenderer().render("---\ntitle: Hello\nauthor: Ada\n---\n\n# Body\n");
    const div = document.createElement("div");
    div.innerHTML = html;
    expect(div.querySelector("h2")).toBeNull();
    expect(div.querySelector("h1")?.id).toBe("h-body");
    expect(div.textContent).not.toContain("author: Ada");
  });

  it("renders GitHub alerts and details titles", () => {
    const html = new MarkdownRenderer().render([
      "> [!NOTE]",
      "> Keep going",
      "",
      ":::details More",
      "hidden",
      ":::",
    ].join("\n"));
    const div = document.createElement("div");
    div.innerHTML = html;
    const quote = div.querySelector("blockquote");
    expect(quote?.classList.contains("callout-note")).toBe(true);
    expect(quote?.getAttribute("data-alert")).toBe("Note");
    expect(html).not.toContain("[!NOTE]");
    expect(div.querySelector("summary")?.textContent).toBe("More");
  });

  it("gives duplicate and non-latin headings stable ids", () => {
    const html = new MarkdownRenderer().render("# Code\n\n# Code\n\n# Café — één\n");
    const div = document.createElement("div");
    div.innerHTML = html;
    const ids = [...div.querySelectorAll("h1")].map((h) => h.id);
    expect(ids).toEqual(["h-code", "h-code-2", "h-cafe-een"]);
  });

  it("removes authored stylesheets that could impersonate the app chrome", () => {
    const html = new MarkdownRenderer().render('<div><style>.file-meta { display: none }</style>Book</div>');
    expect(html).not.toContain("<style"); expect(html).not.toContain("display: none"); expect(html).toContain("Book");
  });

  it("removes authored form submission while keeping ordinary document content", () => {
    const html = new MarkdownRenderer().render('<form action="https://example.invalid/collect" method="post"><p>Book</p></form>');
    expect(html).not.toContain("<form"); expect(html).not.toContain("/collect"); expect(html).toContain("Book");
  });

  it("neutralises fixed-position overlays", () => {
    const html = new MarkdownRenderer().render('<div style="position:fixed;z-index:9">x</div>\n');
    expect(html).not.toMatch(/position:\s*fixed/i);
    expect(html).not.toMatch(/z-index/i);
  });

  it("respects parse-affecting settings (math toggle)", () => {
    setSettings({ ...structuredClone(DEFAULT_SETTINGS), render: { ...DEFAULT_SETTINGS.render, math: false } });
    const r = new MarkdownRenderer();
    const div = document.createElement("div");
    div.innerHTML = r.render("$E=mc^2$");
    expect(div.querySelectorAll(".katex").length).toBe(0);
  });
});
