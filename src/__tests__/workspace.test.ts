import { describe, expect, it } from "vitest";
import { groupByFolder, listWorkspace, findAudio, type WorkspaceFile } from "../workspace";

const f = (rel: string): WorkspaceFile => {
  const cut = rel.lastIndexOf("/");
  return { rel, path: "D:/ws/" + rel, name: cut < 0 ? rel : rel.slice(cut + 1) };
};

describe("groupByFolder", () => {
  it("groups by folder and keeps the incoming order", () => {
    const groups = groupByFolder([f("h00.md"), f("h01.md"), f("sub/h02.md"), f("sub/deep/h03.md")]);
    expect(groups.map((g) => g.folder)).toEqual(["", "sub", "sub/deep"]);
    expect(groups[0].files.map((x) => x.name)).toEqual(["h00.md", "h01.md"]);
    expect(groups[2].files.map((x) => x.name)).toEqual(["h03.md"]);
  });

  it("returns nothing for nothing", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});

describe("outside Tauri", () => {
  it("lists no files instead of throwing", async () => {
    await expect(listWorkspace("D:/ws")).resolves.toEqual([]);
  });

  it("finds no audio instead of throwing", async () => {
    await expect(findAudio("D:/ws/h01.md")).resolves.toBeNull();
  });
});
