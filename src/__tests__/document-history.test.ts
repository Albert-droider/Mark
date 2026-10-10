import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentHistory } from "../document-history";
import { DocumentSession, type DocumentStore } from "../document-session";
const clean: (() => void)[] = [];
function setup() {
  const store: DocumentStore = { open: vi.fn(), save: vi.fn(async () => ({ savedAt: 20 })), versions: vi.fn(async () => [{ id: "10", createdAt: 10, bytes: 5 }]), read: vi.fn(async () => "older") };
  const session = new DocumentSession(store, vi.fn()); session.bind({ id: "doc", source: "current", hasUnappliedVersion: false });
  const actions = { restore: vi.fn(async () => true), report: vi.fn() };
  const history = new DocumentHistory(session, actions); clean.push(() => { history.dispose(); session.dispose(); });
  return { history, session, store, actions };
}
afterEach(() => { clean.splice(0).forEach(run => run()); vi.restoreAllMocks(); });
describe("explicit version history", () => {
  it("previews source as inert text and restores only after explicit confirmation", async () => {
    const { history, actions } = setup(); vi.spyOn(window, "confirm").mockReturnValue(true);
    await history.show(); history.root.querySelector<HTMLButtonElement>(".version-item")!.click();
    await vi.waitFor(() => expect(history.root.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("older"));
    expect(history.root.querySelector<HTMLTextAreaElement>("textarea")!.readOnly).toBe(true);
    history.root.querySelector<HTMLButtonElement>(".version-restore")!.click();
    await vi.waitFor(() => expect(actions.restore).toHaveBeenCalledWith("older", "doc"));
    expect(history.root.hidden).toBe(true);
  });
  it("does not apply a selected version to a different document", async () => {
    const { history, session, actions } = setup(); vi.spyOn(window, "confirm").mockReturnValue(true);
    await history.show(); history.root.querySelector<HTMLButtonElement>(".version-item")!.click();
    await vi.waitFor(() => expect(history.root.querySelector<HTMLButtonElement>(".version-restore")!.disabled).toBe(false));
    session.bind({ id: "other", source: "other", hasUnappliedVersion: false });
    history.root.querySelector<HTMLButtonElement>(".version-restore")!.click(); expect(actions.restore).not.toHaveBeenCalled();
    history.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(history.root.hidden).toBe(true);
  });
  it("allows retry after a failed restore without changing the selected version", async () => {
    const { history, actions } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    actions.restore.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await history.show();
    history.root.querySelector<HTMLButtonElement>(".version-item")!.click();
    const restore = history.root.querySelector<HTMLButtonElement>(".version-restore")!;
    await vi.waitFor(() => expect(restore.disabled).toBe(false));
    restore.click();
    await vi.waitFor(() => expect(actions.restore).toHaveBeenCalledTimes(1));
    expect(history.root.hidden).toBe(false);
    expect(restore.disabled).toBe(false);
    restore.click();
    await vi.waitFor(() => expect(actions.restore).toHaveBeenCalledTimes(2));
    expect(actions.restore).toHaveBeenLastCalledWith("older", "doc");
    expect(history.root.hidden).toBe(true);
  });

  it("does not close a newly opened history dialog when an earlier restore completes", async () => {
    const { history, session, actions } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let finish!: (restored: boolean) => void;
    actions.restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await history.show();
    history.root.querySelector<HTMLButtonElement>(".version-item")!.click();
    await vi.waitFor(() => expect(history.root.querySelector<HTMLButtonElement>(".version-restore")!.disabled).toBe(false));
    history.root.querySelector<HTMLButtonElement>(".version-restore")!.click();
    session.bind({ id: "other", source: "other", hasUnappliedVersion: false });
    await history.show();
    finish(true);
    await Promise.resolve();
    expect(history.root.hidden).toBe(false);
    expect(history.root.querySelector<HTMLButtonElement>(".version-restore")!.disabled).toBe(true);
  });

  it("shows storage failures without deleting or restoring any document", async () => {
    const { history, store, actions } = setup(); vi.mocked(store.versions).mockRejectedValue(new Error("history unavailable"));
    await history.show(); expect(history.root.textContent).toContain("history unavailable"); expect(actions.restore).not.toHaveBeenCalled();
  });
});
