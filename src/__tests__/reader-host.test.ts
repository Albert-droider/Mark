import { describe, expect, it, vi } from "vitest";
import { ReaderHost, type ReaderHostActions } from "../reader-host";

function setup(overrides: Partial<ReaderHostActions> = {}) {
  const actions: ReaderHostActions = {
    desktop: false, chrome: () => document.createElement("header"), dropOverlay: () => document.createElement("div"),
    flushPosition: vi.fn(), save: vi.fn().mockResolvedValue(true), dirty: () => false,
    captureNote: vi.fn(() => true), canClose: vi.fn(() => true), openPath: vi.fn(), resumeInitial: vi.fn(),
    openBlob: vi.fn(), report: vi.fn(), ...overrides,
  };
  return { actions, host: new ReaderHost(actions), event: { preventDefault: vi.fn() }, window: { close: vi.fn().mockResolvedValue(undefined) } };
}

describe("reader host close acknowledgement", () => {
  it("captures the active note before saving, then allows the second native close", async () => {
    const order: string[] = [];
    const { host, window, event } = setup({
      captureNote: () => { order.push("capture"); return true; },
      save: async () => { order.push("save"); return true; },
      canClose: () => { order.push("draft guard"); return true; },
    });
    await host.onCloseRequested(event, window);
    expect(order).toEqual(["capture", "save", "draft guard"]); expect(window.close).toHaveBeenCalledOnce();
    const allowed = { preventDefault: vi.fn() };
    await host.onCloseRequested(allowed, window);
    expect(allowed.preventDefault).not.toHaveBeenCalled(); expect(window.close).toHaveBeenCalledOnce();
  });
  it("does not save or close after failed note capture", async () => {
    const { actions, host, event, window } = setup({ captureNote: () => false });
    await host.onCloseRequested(event, window);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(actions.save).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });
  it("does not close after a failed save or rejected legacy draft guard", async () => {
    for (const overrides of [{ save: async () => false }, { canClose: () => false }]) {
      const { host, event, window } = setup(overrides);
      await host.onCloseRequested(event, window);
      expect(event.preventDefault).toHaveBeenCalledOnce(); expect(window.close).not.toHaveBeenCalled();
    }
  });
  it("serializes duplicate close clicks while persistence is pending", async () => {
    let acknowledge: (saved: boolean) => void = () => {};
    const pending = new Promise<boolean>(resolve => { acknowledge = resolve; });
    const { actions, host, event, window } = setup({ save: vi.fn(() => pending) });
    const first = host.onCloseRequested(event, window);
    await host.onCloseRequested(event, window);
    expect(actions.save).toHaveBeenCalledOnce(); expect(window.close).not.toHaveBeenCalled();
    acknowledge(true); await first;
    expect(window.close).toHaveBeenCalledOnce();
  });
  it("restores the guard and permits retry after a native close error", async () => {
    const { actions, host, event, window } = setup();
    window.close.mockRejectedValueOnce(new Error("native close denied"));
    await host.onCloseRequested(event, window);
    expect(actions.report).toHaveBeenCalledWith("Error: native close denied");
    await host.onCloseRequested(event, window);
    expect(actions.save).toHaveBeenCalledTimes(2); expect(window.close).toHaveBeenCalledTimes(2);
  });
  it("keeps the window guarded after a thrown save failure", async () => {
    const { actions, host, event, window } = setup({ save: async () => { throw new Error("disk full"); } });
    await host.onCloseRequested(event, window);
    expect(actions.report).toHaveBeenCalledWith("Error: disk full"); expect(window.close).not.toHaveBeenCalled();
  });
});
