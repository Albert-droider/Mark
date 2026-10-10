import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentStore } from "../document-store";
import { getSettings } from "../store";
import { MEBIBYTE } from "../document-budget";

const boundary = vi.hoisted(() => ({ desktop: true, invoke: vi.fn(), budgets: [] as Array<() => number> }));
vi.mock("../platform", () => ({ get isTauri() { return boundary.desktop; } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: boundary.invoke }));
vi.mock("../browser-documents", () => ({ BrowserDocumentStore: class {
  constructor(readBudget: () => number) { boundary.budgets.push(readBudget); }
} }));
beforeEach(() => { boundary.invoke.mockReset(); boundary.budgets.length = 0; boundary.desktop = true; });

describe("document storage boundary", () => {
  it("passes the current byte limit to native open and save without changing version commands", async () => {
    let budget = 1024 * MEBIBYTE;
    const store = createDocumentStore(() => budget);
    const file = { path: "C:/books/source.md", name: "source.md", kind: "markdown" as const, source: "Original" };
    const opened = { id: "registered", source: file.source, hasUnappliedVersion: false };
    boundary.invoke.mockResolvedValueOnce(opened).mockResolvedValueOnce({ savedAt: 5 }).mockResolvedValueOnce([]).mockResolvedValueOnce("Version");
    expect(await store.open(file)).toEqual(opened);
    expect(boundary.invoke).toHaveBeenNthCalledWith(1, "open_versioned_document", { path: file.path, budgetBytes: budget });
    budget = 512 * MEBIBYTE;
    await store.save(opened.id, { expected: "Original", source: "Edited" });
    expect(boundary.invoke).toHaveBeenNthCalledWith(2, "save_versioned_document", { id: opened.id, expected: "Original", source: "Edited", budgetBytes: budget });
    expect(await store.versions(opened.id)).toEqual([]);
    expect(await store.read(opened.id, "snapshot.md")).toBe("Version");
    expect(boundary.invoke).toHaveBeenNthCalledWith(3, "list_document_versions", { id: opened.id });
    expect(boundary.invoke).toHaveBeenNthCalledWith(4, "read_document_version", { id: opened.id, version: "snapshot.md" });
  });
  it("gives browser storage a live settings reader instead of a frozen default", () => {
    boundary.desktop = false; createDocumentStore();
    expect(boundary.budgets).toHaveLength(1);
    expect(boundary.budgets[0]()).toBe(getSettings().documentBudgetMiB * MEBIBYTE);
  });
});
