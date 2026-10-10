import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT_BUDGET_BYTES, documentStorageUsage, documentStorageWarning, requireDocumentBudget, validDocumentBudgetMiB } from "../document-budget";

describe("managed document storage budget", () => {
  it("defaults to 1 GiB and accepts whole-MiB configuration from 64 through 16384", () => {
    expect(DEFAULT_DOCUMENT_BUDGET_BYTES).toBe(1073741824);
    for (const value of [64, 1024, 16384]) expect(validDocumentBudgetMiB(value)).toBe(true);
    for (const value of [63, 16385, 64.5, NaN, Infinity, "1024", undefined]) expect(validDocumentBudgetMiB(value)).toBe(false);
  });
  it("warns at 80% and refuses only when the projected count exceeds the limit", () => {
    expect(documentStorageWarning(undefined)).toBe("");
    expect(documentStorageWarning(documentStorageUsage(79, 100))).toBe("");
    expect(documentStorageWarning(documentStorageUsage(80, 100))).toContain("80% full");
    expect(() => requireDocumentBudget(documentStorageUsage(100, 100))).not.toThrow();
    expect(() => requireDocumentBudget(documentStorageUsage(101, 100))).toThrow("Existing source and history were not changed.");
  });
  it("rejects unsafe byte counts rather than disabling the storage check", () => {
    for (const bytes of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => documentStorageUsage(bytes, 100)).toThrow("Invalid document storage budget or byte count.");
    }
    for (const limit of [0, -1, NaN, 17 * DEFAULT_DOCUMENT_BUDGET_BYTES]) {
      expect(() => documentStorageUsage(1, limit)).toThrow("Invalid document storage budget or byte count.");
    }
  });
});
