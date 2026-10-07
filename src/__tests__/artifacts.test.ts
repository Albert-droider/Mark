import { describe, it, expect } from "vitest";
import { artifactHtml, artifactKind, parseChart, parsePlan } from "../artifacts";
import { MarkdownRenderer } from "../renderer/markdown";

describe("artifacts", () => {
  it("reads a bar chart and a progress plan", () => {
    expect(parseChart("bar\ntitle Fruit\nApples | 12\nOranges 7")?.points).toEqual([
      { label: "Apples", value: 12 },
      { label: "Oranges", value: 7 },
    ]);
    const plan = parsePlan("title Quarter\nResearch | 40\nDraft 125%");
    expect(plan?.title).toBe("Quarter");
    expect(plan?.items[1].value).toBe(100);
  });

  it("turns mermaid, charts, and plans into figures", () => {
    expect(artifactKind("mermaid", "graph LR\n  a-->b")).toBe("mermaid");
    expect(artifactKind("grafiek", "pie\nYes 3\nNo 1")).toBe("chart");
    expect(artifactKind("progressie", "Write | 20")).toBe("progress");
    const html = artifactHtml("plan", "title Build\nRead | 80");
    expect(html).toContain("chart-fill");
    expect(html).toContain("Build");
  });

  it("does not syntax-highlight a mermaid fence", () => {
    const html = new MarkdownRenderer().render("```mermaid\ngraph LR\n  a-->b\n```\n");
    expect(html).toContain('data-artifact="mermaid"');
    expect(html).not.toContain("language-mermaid");
  });
});
