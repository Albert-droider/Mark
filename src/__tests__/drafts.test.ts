import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY, DraftStore, newDraft } from "../drafts";
import { addHighlight, getHighlights, saveHighlightNote } from "../highlights";

const anchor = { text: "passage", prefix: "before ", suffix: " after" };
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("durable note drafts", () => {
  it("recovers exact text and a copied anchor after a fresh store instance", () => {
    const store = new DraftStore();
    const draft = newDraft("book.md", null, [{ ...anchor }], "  Explanation\nwith unicode ✓  ");
    draft.revision = 1;
    store.save(draft);
    draft.text = "mutated outside store";
    draft.anchors[0].text = "changed outside store";
    expect(new DraftStore().list("book.md")[0].text).toBe("  Explanation\nwith unicode ✓  ");
    expect(new DraftStore().list("book.md")[0].anchors[0].text).toBe("passage");
    expect(store.unsaved()).toEqual([]);
  });

  it("keeps source identity immutable while other sources are being edited", () => {
    const store = new DraftStore();
    store.save(newDraft("a.md", null, [anchor], "A notes"));
    store.save(newDraft("b.md", null, [anchor], "B notes"));
    expect(new DraftStore().list("a.md").map((d) => d.text)).toEqual(["A notes"]);
    expect(new DraftStore().list("b.md").map((d) => d.text)).toEqual(["B notes"]);
  });

  it("retains a session copy when a write fails and can retry it", () => {
    const setItem = Storage.prototype.setItem;
    const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === DRAFT_KEY) throw new DOMException("Full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const store = new DraftStore();
    const draft = newDraft("a.md", null, [anchor], "must not disappear");
    expect(() => store.save(draft)).toThrow();
    expect(store.list("a.md")[0].text).toBe("must not disappear");
    expect(store.unsaved()[0].text).toBe("must not disappear");
    expect(new DraftStore().list()).toEqual([]); // failure cannot survive a restart
    fail.mockRestore();
    store.save(draft);
    expect(store.unsaved()).toEqual([]);
    expect(new DraftStore().list("a.md")[0].text).toBe("must not disappear");
  });

  it.each(["{broken", "null", '{"version":9,"items":[]}'])("preserves unsupported draft data: %s", (raw) => {
    localStorage.setItem(DRAFT_KEY, raw);
    const store = new DraftStore();
    const draft = newDraft("a.md", null, [anchor], "session text");
    expect(() => store.save(draft)).toThrow();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(raw);
    expect(store.unsaved()[0].text).toBe("session text");
  });

  it("does not clean up a newer revision", () => {
    const store = new DraftStore();
    const draft = newDraft("a.md", null, [anchor], "v1");
    draft.revision = 1;
    store.save(draft);
    store.save({ ...draft, text: "v2", revision: 2 });
    expect(store.remove(draft.id, 1)).toBe(false);
    expect(store.list()[0].text).toBe("v2");
    expect(store.remove(draft.id, 2)).toBe(true);
    expect(new DraftStore().list()).toEqual([]);
  });

  it("uses one atomic annotation write and stable group identity for retries", () => {
    const draft = newDraft("a.md", null, [anchor], "explanation");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    saveHighlightNote(draft.fileKey, draft.id, draft.anchors, draft.text);
    expect(writes.mock.calls.filter(([key]) => key === "mark.highlights.v1")).toHaveLength(1);
    saveHighlightNote(draft.fileKey, draft.id, draft.anchors, draft.text);
    expect(getHighlights("a.md")).toHaveLength(1);
    expect(getHighlights("a.md")[0].note).toBe("explanation");
  });

  it("does not invent an annotation when an existing group disappeared", () => {
    const group = addHighlight("a.md", [anchor], "green")[0].group;
    expect(() => saveHighlightNote("b.md", group, null, "my text")).toThrow();
    expect(getHighlights("b.md")).toEqual([]);
  });
});
