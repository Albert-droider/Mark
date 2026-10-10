import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { exportFilename, exportText } from "../export-text";
const platform = vi.hoisted(() => ({ isTauri: false }));
vi.mock("../platform", () => platform);
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); platform.isTauri = false; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("explicit Markdown and context export", () => {
  it("uses safe UTF-8 filenames within the native limit", () => {
    expect(exportFilename("../../README.md", "markdown")).not.toMatch(/[/\\]/);
    expect(exportFilename("CON.md", "markdown")).toBe("MARK-CON.md");
    const name = exportFilename("学习".repeat(100) + ".md", "context");
    expect(new TextEncoder().encode(name).length).toBeLessThan(160);
    expect(name).toMatch(/\.json$/);
  });
  it("requests a browser download without claiming durable disk success", async () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:document"), revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("README-edited.md");
    });
    expect(await exportText("    exact Markdown\n", "README-edited.md", "markdown")).toBe("requested");
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledWith("blob:document");
  });
  it("waits for native acknowledgment, passes no destination path, and handles cancellation/failure", async () => {
    platform.isTauri = true;
    vi.mocked(invoke).mockResolvedValueOnce("C:/chosen/new.md").mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Existing file must not be overwritten"));
    expect(await exportText("# Exact\n", "new.md", "markdown")).toBe("saved");
    expect(invoke).toHaveBeenNthCalledWith(1, "export_reader_text", { contents: "# Exact\n", name: "new.md", kind: "markdown" });
    expect(await exportText("# Exact\n", "new.md", "markdown")).toBe("cancelled");
    await expect(exportText("# Exact\n", "new.md", "markdown")).rejects.toThrow("Existing file must not be overwritten");
  });
});
