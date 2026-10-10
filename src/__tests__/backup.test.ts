import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { saveReaderBackup } from "../backup";

const platform = vi.hoisted(() => ({ isTauri: false }));
vi.mock("../platform", () => platform);
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  platform.isTauri = false;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("reader backup destinations", () => {
  it("requests a browser download without claiming it was saved to disk", async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:backup");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await saveReaderBackup("exact raw backup bytes")).toBe("requested");
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download^="mark-reader-backup"]')).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledWith("blob:backup");
  });

  it("acknowledges desktop export only after the native write resolves", async () => {
    platform.isTauri = true;
    vi.mocked(invoke).mockResolvedValue("C:/backup/reader.json");
    expect(await saveReaderBackup("unaltered JSON including corrupt legacy strings")).toBe("saved");
    expect(invoke).toHaveBeenCalledWith("export_reader_backup", { contents: "unaltered JSON including corrupt legacy strings" });
  });

  it("does not claim success when the native save dialog is cancelled", async () => {
    platform.isTauri = true;
    vi.mocked(invoke).mockResolvedValue(null);
    expect(await saveReaderBackup("{}")).toBe("cancelled");
  });

  it("propagates native write failures instead of showing a success message", async () => {
    platform.isTauri = true;
    vi.mocked(invoke).mockRejectedValue(new Error("Existing file must not be overwritten"));
    await expect(saveReaderBackup("{}")).rejects.toThrow("Existing file must not be overwritten");
  });
});
