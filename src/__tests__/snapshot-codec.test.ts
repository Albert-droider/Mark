// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { compressDocumentSnapshot, readDocumentSnapshot, validSnapshotPayload, MAX_DOCUMENT_BYTES } from "../snapshot-codec";
afterEach(() => vi.unstubAllGlobals());

describe("lossless compressed source versions", () => {
  it("compresses a book snapshot and restores exact Unicode, BOM, and line endings", async () => {
    const source = "\ufeff学习 and hé.\r\n".repeat(20_000);
    const snapshot = await compressDocumentSnapshot(source);
    expect(snapshot.codec).toBe("gzip");
    expect(snapshot.payload.length).toBeLessThan(snapshot.bytes / 10);
    expect(await readDocumentSnapshot(snapshot)).toBe(source);
  });
  it.each(["\ud800", "\udc00", "prefix\ud800suffix", "\ud800\ud800\udc00"])("never acknowledges a lossy incomplete Unicode snapshot: %j", async source => {
    await expect(compressDocumentSnapshot(source)).rejects.toThrow("incomplete Unicode");
  });
  it("keeps valid surrogate pairs exact", async () => {
    const source = "prefix 👌 suffix";
    expect(await readDocumentSnapshot(await compressDocumentSnapshot(source))).toBe(source);
  });
  it("keeps tiny snapshots raw and remains lossless without compression support", async () => {
    expect((await compressDocumentSnapshot("small")).codec).toBe("utf8");
    vi.stubGlobal("CompressionStream", undefined);
    const snapshot = await compressDocumentSnapshot("学习\r\n".repeat(100));
    expect(snapshot.codec).toBe("utf8");
    expect(await readDocumentSnapshot(snapshot)).toBe("学习\r\n".repeat(100));
  });
  it("bounds source size and decompression before accepting a forged payload", async () => {
    await expect(compressDocumentSnapshot("a".repeat(MAX_DOCUMENT_BYTES + 1))).rejects.toThrow("16 MB");
    const snapshot = await compressDocumentSnapshot("text\n".repeat(1000));
    await expect(readDocumentSnapshot({ ...snapshot, bytes: 10 })).rejects.toThrow("declared size");
    await expect(readDocumentSnapshot({ ...snapshot, bytes: snapshot.bytes + 1 })).rejects.toThrow("does not match");
    expect(validSnapshotPayload({ ...snapshot, bytes: MAX_DOCUMENT_BYTES + 1 })).toBe(false);
    expect(validSnapshotPayload({ ...snapshot, bytes: -1 })).toBe(false);
    expect(validSnapshotPayload({ ...snapshot, payload: [] })).toBe(false);
    expect(validSnapshotPayload(null)).toBe(false);
  });
  it("rejects corrupt gzip, raw byte-count mismatches, and invalid UTF-8", async () => {
    const snapshot = await compressDocumentSnapshot("text\n".repeat(1000));
    const truncated = { ...snapshot, payload: snapshot.payload.slice(0, -3) };
    await expect(readDocumentSnapshot(truncated)).rejects.toThrow();
    await expect(readDocumentSnapshot({ codec: "utf8", payload: new Uint8Array([65]), bytes: 0 })).rejects.toThrow("does not match");
    await expect(readDocumentSnapshot({ codec: "utf8", payload: new Uint8Array([255]), bytes: 1 })).rejects.toThrow();
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(readDocumentSnapshot(snapshot)).rejects.toThrow("cannot open compressed");
  });
});
