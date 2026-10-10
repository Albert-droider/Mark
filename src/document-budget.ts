export const MEBIBYTE = 1024 * 1024;
export const DEFAULT_DOCUMENT_BUDGET_BYTES = 1024 * MEBIBYTE;
export const MIN_DOCUMENT_BUDGET_MIB = 64;
export const MAX_DOCUMENT_BUDGET_MIB = 16 * 1024;
export interface DocumentStorageUsage { usedBytes: number; limitBytes: number; warning: boolean }

export function validDocumentBudgetMiB(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_DOCUMENT_BUDGET_MIB && value <= MAX_DOCUMENT_BUDGET_MIB;
}

/** Counts managed document data, not database or filesystem allocation overhead. */
export function documentStorageUsage(usedBytes: number, limitBytes: number): DocumentStorageUsage {
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 || !Number.isSafeInteger(limitBytes)
    || limitBytes <= 0 || limitBytes > MAX_DOCUMENT_BUDGET_MIB * MEBIBYTE) {
    throw new Error("Invalid document storage budget or byte count.");
  }
  return { usedBytes, limitBytes, warning: usedBytes * 5 >= limitBytes * 4 };
}

export function requireDocumentBudget(usage: DocumentStorageUsage): void {
  if (usage.usedBytes > usage.limitBytes) {
    throw new Error("Document storage budget exceeded. Increase the limit in Settings or export Markdown. Existing source and history were not changed.");
  }
}

export function documentStorageWarning(usage: DocumentStorageUsage | undefined): string {
  if (!usage?.warning) return "";
  const percent = Math.ceil(usage.usedBytes / usage.limitBytes * 100);
  return `Document storage is ${percent}% full. Increase the budget in Settings or export Markdown. Protected history is not removed to make room.`;
}
