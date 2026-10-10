import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderFiles, type ReaderFileServices } from "../reader-files";
import type { LoadedFile } from "../types";
function file(name: string): LoadedFile { return { name, path: "C:/books/" + name, source: "# " + name, kind: "markdown" }; }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let current: LoadedFile | null = file("first.md");
  let reloadable = true;
  const services: ReaderFileServices = {
    files: { pick: vi.fn(async () => file("picked.md")), readPath: vi.fn(async path => file(path.split("/").at(-1)!)) },
    documents: { get canReload() { return reloadable; }, open: vi.fn(async requested => requested), close: vi.fn(async () => true) },
    history: { hide: vi.fn() },
    viewer: { get file() { return current; }, render: vi.fn(next => { current = next; }), clear: vi.fn(() => { current = null; }) },
    navigation: { flushPosition: vi.fn(), opened: vi.fn(), reset: vi.fn(), ratio: () => 0.4, paint: vi.fn() },
    chrome: { setFile: vi.fn(), hideMenus: vi.fn() }, recent: { refresh: vi.fn() },
    desktop: true, recentPaths: () => ["C:/books/recent.md"], addRecent: vi.fn(), removeRecent: vi.fn(), forgetPlace: vi.fn(),
    refreshMetadata: vi.fn(), refreshChrome: vi.fn(), report: vi.fn(), exportText: vi.fn(async () => "saved" as const),
  };
  return { controller: new ReaderFiles(services), services, setReloadable: (value: boolean) => { reloadable = value; } };
}
afterEach(() => vi.restoreAllMocks());
describe("acknowledged reader file transitions", () => {
  it("lets the latest open win over both a slow file and its late failure", async () => {
    const { controller, services } = setup(), first = deferred<LoadedFile>();
    vi.mocked(services.files.readPath).mockReturnValueOnce(first.promise);
    const old = controller.openPath("C:/books/old.md"); await controller.openPath("C:/books/new.md");
    first.reject(new Error("old read failed")); await old;
    expect(services.viewer.file?.name).toBe("new.md"); expect(services.report).not.toHaveBeenCalled();
    expect(services.addRecent).toHaveBeenCalledWith("C:/books/new.md"); expect(controller.hasRequests).toBe(true);
  });
  it("keeps the current reader when source acknowledgement prevents switching or closing", async () => {
    const { controller, services } = setup();
    vi.mocked(services.documents.open).mockResolvedValue(null);
    await controller.openPath("C:/books/new.md"); expect(services.viewer.file?.name).toBe("first.md");
    vi.mocked(services.documents.close).mockResolvedValue(false); await controller.closeFile();
    expect(services.viewer.file?.name).toBe("first.md"); expect(services.viewer.clear).not.toHaveBeenCalled();
  });
  it("ignores a cancelled picker but reports and removes a genuinely missing file", async () => {
    const { controller, services } = setup(); vi.mocked(services.files.pick).mockResolvedValue(null);
    await controller.openPicker(); expect(services.viewer.render).not.toHaveBeenCalled();
    vi.mocked(services.files.readPath).mockRejectedValue(new Error("os error 2"));
    await controller.openPath("missing.md");
    expect(services.report).toHaveBeenCalledWith("Could not open: Error: os error 2");
    expect(services.removeRecent).toHaveBeenCalledWith("missing.md"); expect(services.forgetPlace).toHaveBeenCalledWith("missing.md");
  });
  it("does not report or forget an old reload failure after another file opens", async () => {
    const { controller, services } = setup(), pending = deferred<LoadedFile>();
    vi.mocked(services.files.readPath).mockReturnValueOnce(pending.promise);
    const reload = controller.reloadCurrent(); await controller.openPath("C:/books/new.md");
    pending.reject(new Error("not found")); expect(await reload).toBe(false);
    expect(services.report).not.toHaveBeenCalled(); expect(services.removeRecent).not.toHaveBeenCalled();
    expect(services.viewer.file?.name).toBe("new.md");
  });
  it("defers dirty reloads and restores the current ratio for an accepted external change", async () => {
    const { controller, services, setReloadable } = setup(); setReloadable(false);
    expect(await controller.reloadCurrent()).toBe(false); expect(services.files.readPath).not.toHaveBeenCalled();
    setReloadable(true);
    vi.mocked(services.files.readPath).mockResolvedValue({ ...file("first.md"), source: "external change" });
    expect(await controller.reloadCurrent()).toBe(true);
    expect(services.viewer.file?.source).toBe("external change"); expect(services.navigation.paint).toHaveBeenCalledWith(0.4);
  });
  it("uses acknowledged export results and retains the current source on export errors", async () => {
    const { controller, services } = setup();
    await controller.exportDocument();
    expect(services.exportText).toHaveBeenCalledWith("# first.md", "first-export", "markdown");
    expect(services.report).toHaveBeenLastCalledWith("Current Markdown saved to a new file.");
    vi.mocked(services.exportText).mockResolvedValue("requested"); await controller.exportDocument();
    expect(services.report).toHaveBeenLastCalledWith("Current Markdown download requested. No upload was made.");
    vi.mocked(services.exportText).mockResolvedValue("cancelled"); await controller.exportDocument();
    expect(services.report).toHaveBeenLastCalledWith("Export cancelled.");
    vi.mocked(services.exportText).mockRejectedValue(new Error("disk full")); await controller.exportDocument();
    expect(services.report).toHaveBeenLastCalledWith("Export failed: Error: disk full. Keep MARK open.");
    expect(services.viewer.file?.source).toBe("# first.md");
  });
  it("flushes position, clears chrome and resets navigation only after close is accepted", async () => {
    const { controller, services } = setup(); await controller.closeFile();
    expect(services.viewer.file).toBeNull(); expect(services.navigation.flushPosition).toHaveBeenCalledOnce();
    expect(services.navigation.reset).toHaveBeenCalledOnce(); expect(services.chrome.setFile).toHaveBeenCalledWith(null);
  });
});
