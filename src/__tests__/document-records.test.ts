import { describe, expect, it } from "vitest";
import { expiredVersions, validDocument, validVersions, versionFor } from "../document-records";
import { VERSION_RETENTION_MS } from "../document-session";
const record = { format: "mark-document" as const, version: 1 as const, id: "study", source: "学习", stamp: 10 };
describe("durable browser document records", () => {
  it("requires the expected identity and supported schema", () => {
    expect(validDocument(record, "study")).toBe(true);
    for (const change of [{ id: "other" }, { version: 2 }, { stamp: -1 }, { source: null }]) {
      expect(validDocument({ ...record, ...change }, "study")).toBe(false);
    }
  });
  it("binds every snapshot key and stamp to its document", () => {
    const version = versionFor(record);
    expect(version.bytes).toBe(6); expect(validVersions([version], "study")).toBe(true);
    for (const change of [{ document: "other" }, { key: "other:10" }, { id: "11" }, { bytes: -1 }, { createdAt: Infinity }]) {
      expect(validVersions([{ ...version, ...change }], "study")).toBe(false);
    }
    expect(validVersions([null], "study")).toBe(false);
  });
  it("retains the thirty-day boundary, the newest forever, and empty histories", () => {
    const first = versionFor(record), latest = versionFor({ ...record, stamp: 20 });
    expect(expiredVersions([first, latest], VERSION_RETENTION_MS + 10)).toEqual([]);
    expect(expiredVersions([first, latest], VERSION_RETENTION_MS * 100)).toEqual([first]);
    expect(expiredVersions([], VERSION_RETENTION_MS * 100)).toEqual([]);
  });
  it("does not use a spread argument limit for large histories", () => {
    const versions = Array.from({ length: 140_000 }, (_, stamp) => versionFor({ ...record, stamp }));
    expect(expiredVersions(versions, VERSION_RETENTION_MS * 100)).toHaveLength(139_999);
  });
});
