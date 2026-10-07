import { describe, it, expect } from "vitest";
import { resolveAgainst, canonicalPath, isDocumentPath, isImagePath } from "../util";

describe("resolveAgainst", () => {
  it("resolves a sibling and a parent", () => {
    expect(resolveAgainst("C:\\docs\\a.md", "./b.md")).toBe("C:\\docs\\b.md");
    expect(resolveAgainst("C:\\docs\\a.md", "../b.md")).toBe("C:\\b.md");
    expect(resolveAgainst("C:\\docs\\a.md", "img/a.png")).toBe("C:\\docs\\img\\a.png");
  });

  it("decodes spaces and ignores schemes and fragments", () => {
    expect(resolveAgainst("C:\\docs\\a.md", "./my%20file.md")).toBe("C:\\docs\\my file.md");
    expect(resolveAgainst("C:\\docs\\a.md", "https://example.com")).toBeNull();
    expect(resolveAgainst("C:\\docs\\a.md", "#heading")).toBeNull();
    expect(resolveAgainst("", "./b.md")).toBeNull();
  });

  it("classifies documents and images", () => {
    expect(isDocumentPath("notes/a.md")).toBe(true);
    expect(isDocumentPath("a.txt")).toBe(true);
    expect(isImagePath("a.PNG")).toBe(true);
    expect(isDocumentPath("a.png")).toBe(false);
  });

  it("folds windows paths for the recent-file key", () => {
    expect(canonicalPath("C:/Docs/A.md")).toBe("c:\\docs\\a.md");
    expect(canonicalPath("/home/A.md")).toBe("/home/A.md");
  });
});
