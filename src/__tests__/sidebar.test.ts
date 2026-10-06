import { beforeEach, describe, expect, it } from "vitest";
import { Sidebar, SIDEBAR_OPEN_KEY } from "../sidebar";
import type { WorkspaceFile } from "../workspace";

const FILES: WorkspaceFile[] = [
  { path: "D:/ws/h00.md", rel: "h00.md", name: "h00.md" },
  { path: "D:/ws/md/h01.md", rel: "md/h01.md", name: "h01.md" },
];

function make(deps: Partial<{ load: (root: string) => Promise<WorkspaceFile[]>; pick: () => Promise<string | null> }> = {}) {
  const opened: string[] = [];
  const assigned: string[] = [];
  const sidebar = new Sidebar(
    (p) => opened.push(p),
    (r) => assigned.push(r),
    { load: async () => FILES, pick: async () => "D:/ws", ...deps },
  );
  document.body.append(sidebar.root);
  return { sidebar, opened, assigned };
}

const rows = (s: Sidebar) => [...s.root.querySelectorAll<HTMLElement>(".sb-file")];

/** Let an async click handler (pick → load → render) finish. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("Sidebar", () => {
  it("offers to pick a folder when there is no workspace", () => {
    const { sidebar } = make();
    expect(sidebar.root.querySelector(".sb-empty")).not.toBeNull();
    expect(rows(sidebar)).toHaveLength(0);
  });

  it("picks a folder, loads it and reports it back for persistence", async () => {
    const { sidebar, assigned } = make();
    const pick = sidebar.root.querySelector<HTMLButtonElement>(".sb-empty-btn")!;
    pick.click();
    await flush();
    expect(assigned).toEqual(["D:/ws"]);
    expect(rows(sidebar).map((r) => r.textContent)).toEqual(["h00.md", "h01.md"]);
    expect(sidebar.root.querySelector(".sb-root")!.textContent).toBe("ws");
    expect(sidebar.root.querySelector(".sb-count")!.textContent).toBe("2");
  });

  it("groups documents by folder", async () => {
    const { sidebar } = make();
    await sidebar.setWorkspace("D:/ws");
    const folders = [...sidebar.root.querySelectorAll(".sb-folder")].map((f) => f.textContent);
    expect(folders).toEqual(["md"]); // the root documents have no folder header
  });

  it("opens a document on click", async () => {
    const { sidebar, opened } = make();
    await sidebar.setWorkspace("D:/ws");
    rows(sidebar)[1].click();
    expect(opened).toEqual(["D:/ws/md/h01.md"]);
  });

  it("marks the active row and moves it", async () => {
    const { sidebar } = make();
    await sidebar.setWorkspace("D:/ws");
    sidebar.setActive("D:/ws/md/h01.md");
    expect(rows(sidebar).map((r) => r.classList.contains("active"))).toEqual([false, true]);
    sidebar.setActive("D:/ws/h00.md");
    expect(rows(sidebar).map((r) => r.classList.contains("active"))).toEqual([true, false]);
  });

  it("remembers being open, without touching Settings", () => {
    const { sidebar } = make();
    expect(sidebar.isOpen()).toBe(false);
    sidebar.toggle();
    expect(sidebar.isOpen()).toBe(true);
    expect(sidebar.root.classList.contains("open")).toBe(true);
    expect(localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe("1");
    expect(localStorage.getItem("mark.settings.v1")).toBeNull();
  });

  it("shows an empty message when a folder yields nothing", async () => {
    const { sidebar } = make({ load: async () => [] });
    await sidebar.setWorkspace("D:/leeg");
    expect(sidebar.root.querySelector(".sb-empty")).not.toBeNull();
    expect(rows(sidebar)).toHaveLength(0);
  });

  it("survives a folder that cannot be read", async () => {
    const { sidebar } = make({ load: async () => { throw new Error("nope"); } });
    await expect(sidebar.setWorkspace("D:/weg")).resolves.toBeUndefined();
    expect(sidebar.root.querySelector(".sb-empty")).not.toBeNull();
  });
});
