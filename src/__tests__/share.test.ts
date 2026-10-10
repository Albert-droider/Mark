import { beforeEach, describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../renderer/markdown";
import { sliceSourceLines, tableCsv, agentContext } from "../share";

beforeEach(() => localStorage.clear());
describe("source-aware sharing", () => {
  it("keeps original lines and Markdown formatting", () => {
    expect(sliceSourceLines("intro\r\n| **A** | B |\r\n| --- | --- |\r\n| a | b |\r\nEnd", 2, 4)).toBe("| **A** | B |\r\n| --- | --- |\r\n| a | b |\r\n");
  });
  it("binds tables/code to original line numbers past frontmatter, without trusting raw HTML", () => {
    const source = "---\r\ntitle: README\r\n---\r\n# Intro\r\n\r\n| A | B |\r\n| --- | --- |\r\n| a | b |\r\n\r\n```ts\r\nlet x = 1;\r\n```\r\n\r\n<table data-mark-block='spoof'><tr><td>fake</td></tr></table>";
    const result = new MarkdownRenderer().renderWithSource(source);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({ kind: "table", startLine: 6, endLine: 8, markdown: sliceSourceLines(source, 6, 8) });
    expect(result.blocks[1]).toMatchObject({ kind: "code", startLine: 10, endLine: 12 });
    expect(result.blocks.every(b => b.id !== "spoof")).toBe(true);
  });
  it("quotes CSV values and neutralizes formulas", () => {
    const table = document.createElement("table");
    table.innerHTML = '<tr><td>plain, value</td><td>"quote"</td></tr><tr><td> =HYPERLINK("bad")</td><td>@SUM(1,2)</td></tr>';
    expect(tableCsv(table)).toBe('"plain, value","""quote"""\r\n"\' =HYPERLINK(""bad"")","\'@SUM(1,2)"\r\n');
  });
  it("captures one consistent source and block even when editing continues during hashing", async () => {
    const source = { name: "Original.md", source: "Original source" };
    const block = { id: "one", kind: "table" as const, startLine: 1, endLine: 3, markdown: "Original table" };
    const pending = agentContext(source, block);
    source.name = "Other.md"; source.source = "Later source";
    block.markdown = "Later table"; block.startLine = 10;
    const result = JSON.parse(await pending);
    expect(result.source.name).toBe("Original.md");
    expect(result.source.startLine).toBe(1);
    expect(result.block.markdown).toBe("Original table");
  });
  it("exports only the selected block plus verifiable source metadata", async () => {
    const source = { name: "README.md", source: "private unrelated paragraph\n\n```ts\nlet x = 1;\n```" };
    const result = JSON.parse(await agentContext(source, { id: "test", kind: "code", startLine: 3, endLine: 5, markdown: "```ts\nlet x = 1;\n```" }));
    expect(result.source.name).toBe("README.md");
    expect(result.source.sourceTextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.block.markdown).toContain("let x = 1;");
    expect(JSON.stringify(result)).not.toContain("private unrelated paragraph");
    expect(result.includesFullSource).toBe(false);
  });
});
