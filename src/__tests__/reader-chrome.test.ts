import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderChrome, type ReaderChromeActions } from "../reader-chrome";
import { RecentFiles } from "../recent";

let chrome: ReaderChrome;
function setup() {
  const actions: ReaderChromeActions = {
    openPicker: vi.fn(), closeFile: vi.fn(), openNotes: vi.fn(), showHistory: vi.fn(), exportDocument: vi.fn(),
    openFind: vi.fn(), toggleOutline: vi.fn(), toggleTheme: vi.fn(), toggleSettings: vi.fn(),
    chooseLayout: vi.fn(), dark: () => false,
  };
  chrome = new ReaderChrome(actions, new RecentFiles({ openPath: () => {}, placeKey: () => "" }), document.createElement("button"));
  document.body.append(chrome.root, chrome.toastRoot);
  return actions;
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { chrome?.dispose(); document.body.replaceChildren(); vi.useRealTimers(); });

describe("reader shell contracts", () => {
  it("keeps a newer warning visible when an older toast would expire", () => {
    setup(); chrome.toast("First"); vi.advanceTimersByTime(3000); chrome.toast("Not saved");
    vi.advanceTimersByTime(200); expect(chrome.toastRoot.hidden).toBe(false);
    expect(chrome.toastRoot.textContent).toBe("Not saved");
    vi.advanceTimersByTime(3000); expect(chrome.toastRoot.hidden).toBe(true);
  });
  it("reflects file kinds without enabling notes on text or an empty reader", () => {
    setup(); chrome.refresh(null, false); expect(chrome.notesButton.disabled).toBe(true);
    chrome.refresh({ name: "plain.txt", path: "", source: "plain", kind: "text" }, true);
    expect(chrome.notesButton.disabled).toBe(true);
    chrome.refresh({ name: "book.md", path: "", source: "# Book", kind: "markdown" }, true);
    expect(chrome.notesButton.disabled).toBe(false);
    expect(chrome.root.querySelector(".contents-btn")?.getAttribute("aria-expanded")).toBe("true");
  });
  it("routes menu intentions and closes their own menu", () => {
    const actions = setup(); chrome.fileMenu.show();
    chrome.root.querySelector<HTMLButtonElement>(".open-btn")!.click();
    expect(actions.openPicker).toHaveBeenCalledOnce(); expect(chrome.fileMenu.isOpen).toBe(false);
    chrome.viewMenu.show(); chrome.root.querySelector<HTMLButtonElement>('[data-layout="book"]')!.click();
    expect(actions.chooseLayout).toHaveBeenCalledWith("book"); expect(chrome.viewMenu.isOpen).toBe(false);
    chrome.notesButton.click(); expect(actions.openNotes).toHaveBeenCalledOnce();
  });
  it("uses text for source names and synchronizes mode, notes, progress and empty state", () => {
    setup(); const file = { name: "<script>.md", path: "C:/books/<script>.md", source: "", kind: "markdown" as const };
    chrome.setFile(file); expect(chrome.fileName.textContent).toBe(file.name);
    expect(chrome.fileName.querySelector("script")).toBeNull(); expect(chrome.emptyState.classList.contains("hidden")).toBe(true);
    chrome.refreshAppearance("book");
    expect(chrome.root.querySelector('[data-layout="book"]')?.getAttribute("aria-pressed")).toBe("true");
    chrome.setNoteOpen(true); expect(chrome.notesButton.getAttribute("aria-expanded")).toBe("true");
    chrome.updateProgress(0.5); expect(chrome.progress.firstElementChild?.getAttribute("style")).toContain("scaleX(0.5)");
    chrome.setFile(null); expect(chrome.emptyState.classList.contains("hidden")).toBe(false); expect(document.title).toBe("Mark");
  });
});
