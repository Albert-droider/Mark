import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderNavigation } from "../reader-navigation";
import type { LoadedFile, ReadingLayout } from "../types";

const dependencies = vi.hoisted(() => ({
  book: {
    index: 0, spreads: 4, setEnabled: vi.fn(), layout: vi.fn(), ratio: vi.fn(() => 0.5), scrollToRatio: vi.fn(),
    prev: vi.fn(), next: vi.fn(), show: vi.fn(), go: vi.fn(), label: vi.fn(() => "1–2 / 8"),
    canPrev: vi.fn(() => false), canNext: vi.fn(() => true), headingId: vi.fn(() => "intro"),
  },
  session: {
    key: "", ratio: vi.fn(() => 0.4), scrollToRatio: vi.fn(), flush: vi.fn(), follow: vi.fn(),
    place: vi.fn(() => ({ ratio: 0.4, legacyTop: null })), restore: vi.fn(), queue: vi.fn(), watch: vi.fn(), stop: vi.fn(),
  },
  outline: { rebuild: vi.fn(), sync: vi.fn(), mark: vi.fn(), toggle: vi.fn(() => "opened") },
  find: { close: vi.fn(), open: vi.fn(), reapply: vi.fn() },
  audio: { setDocument: vi.fn(async () => {}) },
  karaoke: { setDocument: vi.fn(async () => {}), rebuild: vi.fn() },
  callbacks: {
    book: undefined as (() => void) | undefined,
    changed: undefined as (() => Promise<boolean>) | undefined,
    hasFile: undefined as (() => boolean) | undefined,
    missing: undefined as ((path: string) => void) | undefined,
    jump: undefined as ((id: string) => void) | undefined,
    outlineChanged: undefined as (() => void) | undefined,
    findRoot: undefined as (() => HTMLElement) | undefined,
    findHit: undefined as ((node: HTMLElement) => void) | undefined,
    spoken: undefined as ((node: HTMLElement) => void) | undefined,
  },
}));
vi.mock("../book", () => ({ Book: class {
  constructor(_sheet: HTMLElement, _article: HTMLElement, changed: () => void) {
    dependencies.callbacks.book = changed; return dependencies.book;
  }
} }));
vi.mock("../session", () => ({ ReadingSession: class {
  constructor(_workspace: HTMLElement, actions: { hasFile(): boolean; onChanged(): Promise<boolean>; onMissing(path: string): void }) {
    dependencies.callbacks.changed = actions.onChanged; dependencies.callbacks.hasFile = actions.hasFile;
    dependencies.callbacks.missing = actions.onMissing;
    return dependencies.session;
  }
} }));
vi.mock("../outline", () => ({ Outline: class {
  constructor(_workspace: HTMLElement, actions: { jump(id: string): void; changed(): void }) {
    dependencies.callbacks.jump = actions.jump; dependencies.callbacks.outlineChanged = actions.changed;
    return { ...dependencies.outline, root: document.createElement("nav") };
  }
} }));
vi.mock("../find", () => ({ FindBar: class {
  constructor(root: () => HTMLElement, hit: (node: HTMLElement) => void) {
    dependencies.callbacks.findRoot = root; dependencies.callbacks.findHit = hit;
    return dependencies.find;
  }
} }));
vi.mock("../audioplayer", () => ({ AudioBar: class {
  constructor() { return { ...dependencies.audio, root: document.createElement("div"), audio: document.createElement("audio") }; }
} }));
vi.mock("../karaoke", () => ({ Karaoke: class {
  constructor(_audio: HTMLAudioElement, actions: { reveal(node: HTMLElement): void }) {
    dependencies.callbacks.spoken = actions.reveal; return dependencies.karaoke;
  }
} }));
vi.mock("../files", () => ({ loadTiming: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixtureFile(name = "first.md", path = ""): LoadedFile {
  return { name, path, kind: "markdown", source: "# Introduction" };
}
function navigationFixture() {
  let layout: ReadingLayout = "scroll";
  const viewer = {
    file: fixtureFile() as LoadedFile | null, root: document.createElement("article"), hideNoteTip: vi.fn(),
    hydrateImages: vi.fn(async () => {}), hydrateArtifacts: vi.fn(async () => {}),
  };
  viewer.root.innerHTML = '<h1 id="intro">Introduction</h1><h2 id="later">Later</h2>';
  const actions = {
    reloadCurrent: vi.fn(async () => true), missing: vi.fn(), refreshChrome: vi.fn(),
    progress: vi.fn(), layout: () => layout, toast: vi.fn(),
  };
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  const navigation = new ReaderNavigation(viewer, actions);
  return { navigation, viewer, actions, frames, setLayout: (next: ReadingLayout) => { layout = next; navigation.setLayout(next); } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks(); dependencies.book.index = 0; dependencies.session.key = "";
  dependencies.outline.toggle.mockReturnValue("opened");
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("reader navigation and late-layout ownership", () => {
  it("mounts the single reader surface and delegates position without owning storage", () => {
    const { navigation, viewer } = navigationFixture(), parent = document.createElement("div"), empty = document.createElement("div");
    navigation.mount(parent, empty); document.body.append(parent);
    expect(parent.contains(navigation.workspace)).toBe(true); expect(navigation.desk.contains(viewer.root)).toBe(true);
    expect(navigation.workspace.contains(empty)).toBe(true); expect(navigation.ratio()).toBe(0.4);
    navigation.scrollToRatio(0.8); navigation.flushPosition();
    expect(dependencies.session.scrollToRatio).toHaveBeenCalledWith(0.8); expect(dependencies.session.flush).toHaveBeenCalledOnce();
  });
  it("uses book position only while the book layout owns navigation", () => {
    const { navigation, setLayout } = navigationFixture(); setLayout("book");
    expect(navigation.workspace.classList.contains("layout-book")).toBe(true);
    const follow = dependencies.session.follow.mock.calls.at(-1)?.[0] as { ratio(): number; scrollToRatio(ratio: number): void };
    expect(follow.ratio()).toBe(0.5); follow.scrollToRatio(0.7);
    expect(dependencies.book.scrollToRatio).toHaveBeenCalledWith(0.7);
    setLayout("scroll"); expect(dependencies.session.follow).toHaveBeenLastCalledWith(null);
  });
  it("opens native audio, watch and outline for the same file and forwards watcher actions", async () => {
    const { navigation, viewer, actions } = navigationFixture(); document.body.append(navigation.workspace);
    const file = fixtureFile("native.md", "C:\\books\\native.md"); viewer.file = file; navigation.opened(file); await settle();
    expect(navigation.workspace.classList.contains("has-file")).toBe(true); expect(document.activeElement).toBe(navigation.workspace);
    expect(dependencies.session.key).toContain("books"); expect(dependencies.session.watch).toHaveBeenCalledWith(file.path);
    expect(dependencies.audio.setDocument).toHaveBeenCalledWith(file.path);
    expect(dependencies.karaoke.setDocument).toHaveBeenCalledWith(file.path, viewer.root);
    expect(dependencies.callbacks.hasFile?.()).toBe(true);
    expect(await dependencies.callbacks.changed?.()).toBe(true); expect(actions.reloadCurrent).toHaveBeenCalledOnce();
    dependencies.callbacks.missing?.(file.path); expect(actions.missing).toHaveBeenCalledWith(file.path);
    expect(actions.toast).toHaveBeenCalledWith("This file is no longer available.");
    dependencies.callbacks.outlineChanged?.(); expect(actions.refreshChrome).toHaveBeenCalledOnce();
  });
  it("restores a reading place after images, artifacts and the next frame", async () => {
    const { navigation, viewer, frames } = navigationFixture(); const place = { ratio: 0.6, legacyTop: null };
    navigation.paint(place); frames[0](0); await settle();
    expect(dependencies.session.restore).toHaveBeenCalledTimes(3); expect(dependencies.session.restore).toHaveBeenLastCalledWith(place);
    expect(viewer.hydrateImages).toHaveBeenCalledOnce(); expect(viewer.hydrateArtifacts).toHaveBeenCalledOnce();
    navigation.refreshOutline(); navigation.sourceCommitted(); navigation.rebuildKaraoke();
    expect(dependencies.outline.sync).toHaveBeenCalledWith(true); expect(dependencies.karaoke.rebuild).toHaveBeenCalledWith(viewer.root);
  });
  it("does not let an old uploaded file restore its ratio after another upload", async () => {
    const { navigation, viewer, frames } = navigationFixture(), images = deferred();
    viewer.hydrateImages.mockReturnValueOnce(images.promise); navigation.paint(0.1);
    viewer.file = fixtureFile("second.md"); navigation.paint(0.8); await settle();
    dependencies.session.scrollToRatio.mockClear(); viewer.hydrateArtifacts.mockClear();
    frames[0](0); images.resolve(); await settle();
    expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled(); expect(viewer.hydrateArtifacts).not.toHaveBeenCalled();
  });
  it("lets the newest paint win even when the same file and position key are reused", async () => {
    const { navigation, viewer, frames } = navigationFixture(), images = deferred();
    viewer.hydrateImages.mockReturnValueOnce(images.promise); navigation.paint(0.1); navigation.paint(0.8); await settle();
    dependencies.session.scrollToRatio.mockClear(); frames[0](0); images.resolve(); await settle();
    expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled();
  });
  it("does not apply an old restyle after the reader changes files", async () => {
    const { navigation, viewer } = navigationFixture(), artifacts = deferred();
    viewer.hydrateArtifacts.mockReturnValueOnce(artifacts.promise); navigation.restyle(0.2);
    viewer.file = fixtureFile("second.md"); navigation.paint(0.8); await settle();
    dependencies.session.scrollToRatio.mockClear(); artifacts.resolve(); await settle();
    expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled();
  });
  it("invalidates pending layout when the current reader is reset", async () => {
    const { navigation, viewer, frames, actions } = navigationFixture(), images = deferred();
    viewer.hydrateImages.mockReturnValueOnce(images.promise); navigation.paint(0.2); viewer.file = null; navigation.reset();
    dependencies.session.scrollToRatio.mockClear(); frames[0](0); images.resolve(); await settle();
    expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled(); expect(actions.progress).toHaveBeenLastCalledWith(0);
    expect(dependencies.session.stop).toHaveBeenCalledOnce(); expect(dependencies.find.close).toHaveBeenCalledOnce();
    expect(dependencies.audio.setDocument).toHaveBeenLastCalledWith(""); expect(dependencies.karaoke.setDocument).toHaveBeenLastCalledWith("", null);
    expect(navigation.workspace.classList.contains("has-file")).toBe(false); expect(dependencies.outline.rebuild).toHaveBeenLastCalledWith(null);
  });
  it("does not restore a paint whose artifacts complete after a newer paint", async () => {
    const { navigation, viewer } = navigationFixture(), artifacts = deferred();
    viewer.hydrateArtifacts.mockReturnValueOnce(artifacts.promise); navigation.paint(0.1); await Promise.resolve();
    navigation.paint(0.8); await settle(); dependencies.session.scrollToRatio.mockClear();
    artifacts.resolve(); await settle(); expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled();
  });
  it("invalidates an initial position after a source commit while images are pending", async () => {
    const { navigation, viewer, frames } = navigationFixture(), images = deferred();
    viewer.hydrateImages.mockReturnValueOnce(images.promise); navigation.paint(0.1); navigation.sourceCommitted();
    dependencies.session.scrollToRatio.mockClear(); frames[0](0); images.resolve(); await settle();
    expect(dependencies.session.scrollToRatio).not.toHaveBeenCalled();
  });
  it("reports unavailable contents and find without opening another surface", () => {
    const { navigation, viewer, actions } = navigationFixture(); viewer.file = null;
    expect(dependencies.callbacks.hasFile?.()).toBe(false);
    dependencies.outline.toggle.mockReturnValue("no-file"); navigation.toggleOutline(); navigation.openFind();
    expect(actions.toast).toHaveBeenLastCalledWith("Open a file first."); expect(dependencies.find.open).not.toHaveBeenCalled();
    viewer.file = fixtureFile(); dependencies.outline.toggle.mockReturnValue("no-headings"); navigation.toggleOutline();
    expect(actions.toast).toHaveBeenLastCalledWith("This file has no headings.");
    dependencies.outline.toggle.mockReturnValue("opened"); navigation.toggleOutline(); navigation.openFind();
    expect(actions.refreshChrome).toHaveBeenCalledOnce(); expect(dependencies.find.open).toHaveBeenCalledOnce();
  });
  it("routes find, contents and spoken follow to the current scroll or book surface", () => {
    const { navigation, viewer, setLayout } = navigationFixture(); const heading = viewer.root.querySelector<HTMLElement>("h1")!;
    heading.scrollIntoView = vi.fn(); vi.stubGlobal("CSS", { escape: (id: string) => id });
    dependencies.callbacks.jump?.("intro"); dependencies.callbacks.findHit?.(heading); dependencies.callbacks.spoken?.(heading);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" }); expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(dependencies.callbacks.findRoot?.()).toBe(viewer.root); navigation.scrollToId("absent");
    setLayout("book"); navigation.showInDocument(heading); dependencies.callbacks.spoken?.(heading);
    expect(dependencies.book.show).toHaveBeenCalledTimes(2);
  });
  it("marks the active heading and queues position when the reader scrolls", () => {
    const { navigation, viewer, actions, setLayout } = navigationFixture();
    const [first, later] = viewer.root.querySelectorAll<HTMLElement>("h1,h2");
    first.getBoundingClientRect = () => ({ top: 20 }) as DOMRect; later.getBoundingClientRect = () => ({ top: 80 }) as DOMRect;
    navigation.workspace.dispatchEvent(new Event("scroll")); expect(dependencies.outline.mark).toHaveBeenCalledWith("intro");
    expect(dependencies.session.queue).toHaveBeenCalledOnce(); expect(actions.progress).toHaveBeenCalledWith(0.4);
    setLayout("book"); dependencies.outline.mark.mockClear(); navigation.markReading(); expect(dependencies.outline.mark).not.toHaveBeenCalled();
    viewer.file = null; navigation.markReading(); navigation.refreshOutline(); expect(dependencies.outline.sync).toHaveBeenLastCalledWith(false);
  });
  it("refreshes book chrome and hides a note tooltip only when the spread changes", () => {
    const { navigation, viewer } = navigationFixture(); dependencies.callbacks.book?.(); dependencies.callbacks.book?.();
    expect(viewer.hideNoteTip).toHaveBeenCalledOnce(); expect(navigation.desk.querySelector(".folio")?.textContent).toBe("1–2 / 8");
    expect(navigation.desk.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    dependencies.book.index = 1; dependencies.callbacks.book?.(); expect(viewer.hideNoteTip).toHaveBeenCalledTimes(2);
    viewer.file = null; dependencies.callbacks.book?.(); expect(navigation.desk.querySelector(".folio")?.textContent).toBe("");
  });
  it("keeps a current restyle ratio and ignores restyling or reading keys without a file", async () => {
    const { navigation, viewer } = navigationFixture(); navigation.restyle(); await settle();
    expect(dependencies.session.scrollToRatio).toHaveBeenLastCalledWith(0.4);
    viewer.file = null; dependencies.book.layout.mockClear(); navigation.restyle(); navigation.onReadKey(new KeyboardEvent("keydown", { key: "End" }));
    expect(dependencies.book.layout).not.toHaveBeenCalled();
  });
  it("maps book reading keys to spreads and does not consume unrelated keys", () => {
    const { navigation, setLayout } = navigationFixture(); setLayout("book");
    for (const key of ["PageDown", "ArrowRight", "ArrowDown", " "]) navigation.onReadKey(new KeyboardEvent("keydown", { key, cancelable: true }));
    for (const key of ["PageUp", "ArrowLeft", "ArrowUp"]) navigation.onReadKey(new KeyboardEvent("keydown", { key, cancelable: true }));
    navigation.onReadKey(new KeyboardEvent("keydown", { key: " ", shiftKey: true }));
    expect(dependencies.book.next).toHaveBeenCalledTimes(4); expect(dependencies.book.prev).toHaveBeenCalledTimes(4);
    navigation.onReadKey(new KeyboardEvent("keydown", { key: "Home" })); navigation.onReadKey(new KeyboardEvent("keydown", { key: "End" }));
    expect(dependencies.book.go).toHaveBeenCalledWith(0, true); expect(dependencies.book.go).toHaveBeenCalledWith(3, true);
    const unknown = new KeyboardEvent("keydown", { key: "x", cancelable: true }); navigation.onReadKey(unknown); expect(unknown.defaultPrevented).toBe(false);
    navigation.desk.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = false; button.click(); });
    expect(dependencies.book.next).toHaveBeenCalledTimes(5); expect(dependencies.book.prev).toHaveBeenCalledTimes(5);
  });
  it("scrolls by pages or lines while leaving horizontal arrows and unrelated keys alone", () => {
    const { navigation } = navigationFixture(); const workspace = navigation.workspace; workspace.scrollBy = vi.fn();
    Object.defineProperty(workspace, "clientHeight", { value: 500 }); Object.defineProperty(workspace, "scrollHeight", { value: 4000 });
    for (const [key, shiftKey, delta] of [["PageDown", false, 450], ["PageUp", false, -450], [" ", false, 450], [" ", true, -450], ["ArrowDown", false, 64], ["ArrowUp", false, -64]] as const) {
      const event = new KeyboardEvent("keydown", { key, shiftKey, cancelable: true }); navigation.onReadKey(event);
      expect(workspace.scrollBy).toHaveBeenLastCalledWith({ top: delta }); expect(event.defaultPrevented).toBe(true);
    }
    navigation.onReadKey(new KeyboardEvent("keydown", { key: "End" })); expect(workspace.scrollTop).toBe(4000);
    navigation.onReadKey(new KeyboardEvent("keydown", { key: "Home" })); expect(workspace.scrollTop).toBe(0);
    for (const key of ["ArrowLeft", "ArrowRight", "x"]) { const event = new KeyboardEvent("keydown", { key, cancelable: true }); navigation.onReadKey(event); expect(event.defaultPrevented).toBe(false); }
  });
});
