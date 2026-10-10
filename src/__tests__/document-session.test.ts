import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSession, DOCUMENT_SAVE_MS, type DocumentStore } from "../document-session";

const sessions: DocumentSession[] = [];
function setup(save = vi.fn<DocumentStore["save"]>().mockResolvedValue({ savedAt: 10 })) {
  const store: DocumentStore = { open: vi.fn(), save, versions: vi.fn(), read: vi.fn() };
  const status = vi.fn(); const session = new DocumentSession(store, status); sessions.push(session);
  session.bind({ id: "opened", source: "original", hasUnappliedVersion: false });
  return { session, save, status };
}
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); vi.useRealTimers(); });

describe("five-second versioned document session", () => {
  it("warns at the storage threshold without reporting a successful open as unsaved", () => {
    const { session, status } = setup();
    session.bind({ id: "opened", source: "original", hasUnappliedVersion: false,
      storage: { usedBytes: 80, limitBytes: 100, warning: true } });
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ state: "saved", message: expect.stringContaining("80% full") }));
    expect(session.dirty).toBe(false);
  });
  it("refreshes a changed budget without saving or discarding pending edits", () => {
    const { session, save, status } = setup();
    session.bind({ id: "opened", source: "original", hasUnappliedVersion: false,
      storage: { usedBytes: 80, limitBytes: 200, warning: false } });
    session.change("still pending"); session.refreshBudget(100);
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ state: "pending", message: expect.stringContaining("80% full") }));
    expect(session.source).toBe("still pending"); expect(save).not.toHaveBeenCalled();
  });
  it("saves changed Markdown on the five-second clock, not on every keystroke or while idle", async () => {
    vi.useFakeTimers(); const { session, save } = setup();
    session.change("first edit"); await vi.advanceTimersByTimeAsync(DOCUMENT_SAVE_MS - 1);
    expect(save).not.toHaveBeenCalled(); session.change("latest edit");
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith("opened", { expected: "original", source: "latest edit" });
    expect(session.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(DOCUMENT_SAVE_MS * 3); expect(save).toHaveBeenCalledTimes(1);
  });
  it("does not emit save states or write when unchanged content is reported", async () => {
    vi.useFakeTimers(); const { session, save, status } = setup(); status.mockClear();
    session.change("original"); await vi.advanceTimersByTimeAsync(DOCUMENT_SAVE_MS * 3);
    expect(status).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("does not write or add a saving state when an edit is undone before the clock tick", async () => {
    vi.useFakeTimers(); const { session, save, status } = setup(); status.mockClear();
    session.change("temporary edit"); session.change("original");
    await vi.advanceTimersByTimeAsync(DOCUMENT_SAVE_MS);
    expect(session.dirty).toBe(false); expect(save).not.toHaveBeenCalled();
    expect(status.mock.calls.map(([value]) => value.state)).toEqual(["pending", "saved"]);
  });
  it("does not hide a failed save when unchanged pending content is reported again", async () => {
    const save = vi.fn<DocumentStore["save"]>().mockRejectedValue(new Error("Disk full"));
    const { session, status } = setup(save); session.change("keep me"); await session.flush();
    status.mockClear(); session.change("keep me");
    expect(status).not.toHaveBeenCalled(); expect(session.dirty).toBe(true);
  });
  it.each(["Document storage budget exceeded", "Document storage budget exceeded."])("reports the failure %s with one sentence separator and retains pending source", async (message) => {
    const save = vi.fn<DocumentStore["save"]>().mockRejectedValue(new Error(message));
    const { session, status } = setup(save); session.change("keep me");
    expect(await session.flush()).toBe(false);
    expect(status).toHaveBeenLastCalledWith({ state: "error", message: "Not saved: Error: Document storage budget exceeded. Keep MARK open or export Markdown before closing." });
    expect(session.dirty).toBe(true); expect(session.source).toBe("keep me");
  });
  it("keeps failed writes dirty and retries the same expected source", async () => {
    const save = vi.fn<DocumentStore["save"]>().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue({ savedAt: 20 });
    const { session, status } = setup(save); session.change("keep me");
    expect(await session.flush()).toBe(false); expect(session.dirty).toBe(true);
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ state: "error", message: expect.stringContaining("Disk full") }));
    expect(() => session.bind(null)).toThrow("Save the current document before switching.");
    expect(await session.flush()).toBe(true); expect(session.dirty).toBe(false);
    expect(save).toHaveBeenNthCalledWith(2, "opened", { expected: "original", source: "keep me" });
  });
  it("serializes slow writes and flushes edits made while the first write was pending", async () => {
    let acknowledge!: (value: { savedAt: number }) => void;
    const save = vi.fn<DocumentStore["save"]>().mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; })).mockResolvedValue({ savedAt: 30 });
    const { session } = setup(save); session.change("first");
    const flushed = session.flush(); session.change("newer");
    expect(save).toHaveBeenCalledTimes(1); acknowledge({ savedAt: 20 });
    expect(await flushed).toBe(true);
    expect(save).toHaveBeenNthCalledWith(2, "opened", { expected: "first", source: "newer" });
    expect(session.source).toBe("newer"); expect(session.dirty).toBe(false);
  });
  it("does not return a version for a document changed during the read", async () => {
    let finish!: (source: string) => void;
    const store: DocumentStore = { open: vi.fn(), save: vi.fn(), versions: vi.fn(), read: vi.fn<DocumentStore["read"]>(() => new Promise(resolve => { finish = resolve; })) };
    const session = new DocumentSession(store, vi.fn()); sessions.push(session);
    session.bind({ id: "one", source: "text", hasUnappliedVersion: false });
    const read = session.readVersion("10"); session.change("new edit"); finish("older");
    await expect(read).rejects.toThrow("The document changed. Open version history again.");
  });
});
