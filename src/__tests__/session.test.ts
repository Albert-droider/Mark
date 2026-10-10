// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileMtime } from "../files";
import { ReadingSession } from "../session";
import { canonicalPath } from "../util";

vi.mock("../platform", () => ({ isTauri: true }));
vi.mock("../files", () => ({ fileMtime: vi.fn() }));
vi.mock("../store", () => ({ getReadingPlace: () => ({ ratio: null, legacyTop: null }), setReadingPlace: vi.fn() }));

const path = "C:/Books/watch.md";
let session: ReadingSession;
beforeEach(() => { vi.useFakeTimers(); vi.mocked(fileMtime).mockReset(); });
afterEach(() => { session?.stop(); vi.useRealTimers(); });

function watching(changed: () => boolean | Promise<boolean>): ReadingSession {
  session = new ReadingSession(document.createElement("main"), {
    hasFile: () => true, onChanged: changed, onMissing: vi.fn(),
  });
  session.key = canonicalPath(path); session.watch(path); return session;
}

describe("file-change notifications while editing", () => {
  it("retries a deferred disk change instead of consuming its timestamp", async () => {
    vi.mocked(fileMtime).mockResolvedValueOnce(100).mockResolvedValue(200);
    const changed = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    watching(changed); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1500); expect(changed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500); expect(changed).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500); expect(changed).toHaveBeenCalledTimes(2);
  });

  it("waits for reload acceptance and acknowledges an accepted timestamp only once", async () => {
    vi.mocked(fileMtime).mockResolvedValueOnce(100).mockResolvedValue(200);
    const changed = vi.fn().mockResolvedValue(true);
    watching(changed); await vi.advanceTimersByTimeAsync(3000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
