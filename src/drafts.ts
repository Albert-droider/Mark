import { isAnchor, newId, type Anchor } from "./highlights";
import { isRecord, readStored, reportStorageIssue, writeStored } from "./reader-storage";

export const DRAFT_KEY = "mark.drafts.v1";
export interface NoteDraft {
  id: string;
  fileKey: string;
  group: string | null;
  anchors: Anchor[];
  text: string;
  revision: number;
  updatedAt: number;
}
interface DraftData { version: 1; items: NoteDraft[] }
function validDraft(value: unknown): value is NoteDraft {
  return isRecord(value) && typeof value.id === "string" && !!value.id
    && typeof value.fileKey === "string" && !!value.fileKey
    && (value.group === null || typeof value.group === "string")
    && Array.isArray(value.anchors) && value.anchors.every(isAnchor)
    && typeof value.text === "string" && typeof value.revision === "number"
    && Number.isInteger(value.revision) && value.revision >= 0
    && typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt);
}
function validData(value: unknown): value is DraftData {
  return isRecord(value) && value.version === 1 && Array.isArray(value.items)
    && value.items.every(validDraft) && new Set(value.items.map((d: NoteDraft) => d.id)).size === value.items.length;
}
function readData(): DraftData { return readStored(DRAFT_KEY, validData, () => ({ version: 1, items: [] })); }
function copy(draft: NoteDraft): NoteDraft { return { ...draft, anchors: draft.anchors.map((a) => ({ ...a })) }; }
export function newDraft(fileKey: string, group: string | null, anchors: Anchor[], text = ""): NoteDraft {
  return { id: newId(), fileKey, group, anchors, text, revision: 0, updatedAt: Date.now() };
}

/** Pending copies remain available in this session when storage rejects a write.
 *  Only acknowledged persistence can survive a restart; the UI must say so. */
export class DraftStore {
  private pending = new Map<string, NoteDraft>();

  list(fileKey?: string): NoteDraft[] {
    let items: NoteDraft[] = [];
    try { items = readData().items; }
    catch (error) { reportStorageIssue(error); }
    const merged = new Map(items.map((d) => [d.id, d]));
    for (const [id, draft] of this.pending) merged.set(id, draft);
    return [...merged.values()].filter((d) => fileKey === undefined || d.fileKey === fileKey).map(copy);
  }

  unsaved(): NoteDraft[] { return [...this.pending.values()].map(copy); }

  save(draft: NoteDraft): void {
    const captured = copy(draft);
    this.pending.set(captured.id, captured);
    const data = readData();
    data.items = [...data.items.filter((d) => d.id !== captured.id), captured];
    writeStored(DRAFT_KEY, data);
    if (this.pending.get(captured.id)?.revision === captured.revision) this.pending.delete(captured.id);
  }

  /** A completion for an older revision must never discard newer typing. */
  remove(id: string, revision: number): boolean {
    const data = readData();
    const pending = this.pending.get(id);
    const stored = data.items.find((d) => d.id === id);
    if ((pending && pending.revision !== revision) || (stored && stored.revision > revision)) return false;
    data.items = data.items.filter((d) => d.id !== id);
    writeStored(DRAFT_KEY, data);
    this.pending.delete(id);
    return true;
  }
}
