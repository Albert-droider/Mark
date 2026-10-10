import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderDocuments } from "../reader-documents";
import { Viewer } from "../viewer";
import type { DocumentStore } from "../document-session";
import type { LoadedFile } from "../types";
const documents: ReaderDocuments[] = [], viewers: Viewer[] = [];
const file: LoadedFile = { name: "Study.md", path: "C:/fixtures/Study.md", source: "- [ ] Pending", kind: "markdown" };
function setup() {
  const viewer = new Viewer(); viewers.push(viewer); document.body.append(viewer.root);
  const store: DocumentStore = {
    open: vi.fn(async f => ({ id: f.name, source: f.source, hasUnappliedVersion: false })),
    save: vi.fn(async () => ({ savedAt: 10 })), versions: vi.fn(), read: vi.fn(),
  };
  const status = vi.fn(), changed = vi.fn();
  const docs = new ReaderDocuments(viewer, store, { status, changed }); documents.push(docs);
  return { viewer, docs, store, changed };
}
afterEach(() => { documents.splice(0).forEach(docs => docs.dispose()); viewers.splice(0).forEach(viewer => viewer.dispose()); localStorage.clear(); });
describe("versioned reader transitions", () => {
  it("binds the original reader and saves its task before switching files", async () => {
    const { viewer, docs, store } = setup(); viewer.render((await docs.open(file, () => true))!);
    viewer.root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(docs.session.dirty).toBe(true); expect(docs.canReload).toBe(false);
    const next = await docs.open({ ...file, name: "Next.md", source: "next" }, () => true);
    expect(store.save).toHaveBeenCalledWith("Study.md", { expected: "- [ ] Pending", source: "- [x] Pending" });
    expect(next?.name).toBe("Next.md"); expect(docs.session.id).toBe("Next.md");
  });
  it("blocks switching and closing after a failed write without discarding the reader", async () => {
    const { viewer, docs, store } = setup(); viewer.render((await docs.open(file, () => true))!);
    viewer.root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    vi.mocked(store.save).mockRejectedValue(new Error("disk unavailable"));
    expect(await docs.open({ ...file, name: "Next.md" }, () => true)).toBeNull();
    expect(await docs.close(() => true)).toBe(false);
    expect(viewer.file?.source).toBe("- [x] Pending"); expect(docs.session.id).toBe("Study.md");
  });
  it("ignores superseded opens and flushes edits made while the next file was loading", async () => {
    const { viewer, docs, store } = setup(); viewer.render((await docs.open(file, () => true))!);
    let finish!: (binding: { id: string; source: string; hasUnappliedVersion: boolean }) => void;
    vi.mocked(store.open).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const next = docs.open({ ...file, name: "Next.md" }, () => true);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    viewer.root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    finish({ id: "Next.md", source: "next", hasUnappliedVersion: false });
    expect((await next)?.source).toBe("next"); expect(store.save).toHaveBeenCalledTimes(1);
    expect(await docs.open(file, () => false)).toBeNull(); expect(docs.session.id).toBe("Next.md");
  });
});
