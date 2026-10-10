import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addHighlight } from "../highlights";
import { BACKUP_KEY, captureReaderBackup, LEGACY_KEYS } from "../reader-storage";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("raw reader backup", () => {
  it("exports exact corrupt bytes, missing keys and unknown MARK data without writing", () => {
    localStorage.setItem("mark.highlights.v1", "{broken annotations");
    localStorage.setItem("mark.settings.v1", '{"version":1,"recent":["old.md"]}');
    localStorage.setItem("mark.future.v8", "new data");
    localStorage.setItem("unrelated", "private other app");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const backup = captureReaderBackup();
    expect(backup.complete).toBe(true);
    expect(backup.entries["mark.highlights.v1"]).toBe("{broken annotations");
    expect(backup.entries["mark.settings.v1"]).toBe('{"version":1,"recent":["old.md"]}');
    expect(backup.entries["mark.future.v8"]).toBe("new data");
    for (const key of LEGACY_KEYS) expect(Object.hasOwn(backup.entries, key)).toBe(true);
    expect(backup.entries["mark.positions.v1"]).toBeNull();
    expect(backup.entries.unrelated).toBeUndefined();
    expect(backup.includesSourceFiles).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("retains the original raw annotations before the first mutation", () => {
    const raw = '{"old.md":[{"id":"one","group":"g","color":"pink","text":"old","prefix":"","suffix":"","note":"my note"}]}';
    localStorage.setItem("mark.highlights.v1", raw);
    addHighlight("new.md", [{ text: "new", prefix: "", suffix: "" }], "yellow");
    const first = localStorage.getItem(BACKUP_KEY);
    expect(JSON.parse(first!).entries["mark.highlights.v1"]).toBe(raw);
    addHighlight("new.md", [{ text: "more", prefix: "", suffix: "" }], "green");
    expect(localStorage.getItem(BACKUP_KEY)).toBe(first);
  });

  it("reports an incomplete export rather than inventing empty inaccessible data", () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === "mark.highlights.v1") throw new DOMException("Denied", "SecurityError");
      return getItem.call(this, key);
    });
    const backup = captureReaderBackup();
    expect(backup.complete).toBe(false);
    expect(backup.errors.some((error) => error.key === "mark.highlights.v1")).toBe(true);
    expect(Object.hasOwn(backup.entries, "mark.highlights.v1")).toBe(false);
  });
});
