import { Book } from "./book";
import { ReadingSession } from "./session";
import { Outline } from "./outline";
import { FindBar } from "./find";
import { AudioBar } from "./audioplayer";
import { Karaoke } from "./karaoke";
import { loadTiming } from "./files";
import { el, canonicalPath } from "./util";
import type { ReadingPlace } from "./store";
import type { LoadedFile, ReadingLayout } from "./types";
export interface ReaderNavigationViewer {
  readonly root: HTMLElement; readonly file: LoadedFile | null;
  hydrateImages(): Promise<void>; hydrateArtifacts(): Promise<void>; hideNoteTip(): void;
}
export interface ReaderNavigationActions {
  reloadCurrent(): Promise<boolean>; missing(path: string): void; refreshChrome(): void;
  progress(ratio: number): void; layout(): ReadingLayout; toast(message: string): void;
}
/** Owns position, pagination, find/outline and audio follow for one reader surface. */
export class ReaderNavigation {
  readonly workspace = el("main", { class: "workspace", tabindex: "-1" });
  readonly session: ReadingSession;
  readonly outline: Outline;
  readonly find: FindBar;
  readonly audioBar: AudioBar;
  private karaoke: Karaoke;
  private sheet = el("div", { class: "sheet" });
  private folio = el("div", { class: "folio" });
  private turnPrev = el("button", { class: "page-turn", type: "button", "aria-label": "Previous pages" }, ["‹"]);
  private turnNext = el("button", { class: "page-turn", type: "button", "aria-label": "Next pages" }, ["›"]);
  private book: Book;
  private bookIndex = -1;
  private layoutGeneration = 0;
  readonly desk: HTMLElement;
  constructor(private viewer: ReaderNavigationViewer, private actions: ReaderNavigationActions) {
    this.session = new ReadingSession(this.workspace, {
      hasFile: () => !!viewer.file, onChanged: () => actions.reloadCurrent(),
      onMissing: path => { actions.missing(path); actions.toast("This file is no longer available."); },
    });
    this.outline = new Outline(this.workspace, { jump: id => this.scrollToId(id), changed: () => actions.refreshChrome() });
    this.find = new FindBar(() => viewer.root, hit => this.showInDocument(hit));
    this.sheet.append(viewer.root);
    this.desk = el("div", { class: "desk" }, [
      el("div", { class: "book-row" }, [this.turnPrev, this.sheet, this.turnNext]), this.folio,
    ]);
    this.book = new Book(this.sheet, viewer.root, () => this.onBook());
    this.turnPrev.addEventListener("click", () => this.book.prev()); this.turnNext.addEventListener("click", () => this.book.next());
    this.audioBar = new AudioBar(); this.karaoke = new Karaoke(this.audioBar.audio, {
      load: loadTiming, reveal: node => this.revealSpoken(node),
    });
    this.workspace.addEventListener("scroll", () => { this.updateProgress(); this.session.queue(); this.markReading(); });
  }
  ratio(): number { return this.session.ratio(); }
  scrollToRatio(ratio: number): void { this.session.scrollToRatio(ratio); }
  flushPosition(): void { this.session.flush(); }
  mount(parent: HTMLElement, emptyState: HTMLElement): void {
    parent.append(el("div", { class: "reading" }, [this.outline.root, this.workspace]), this.audioBar.root);
    this.workspace.append(emptyState, this.desk);
  }
  setLayout(layout: ReadingLayout): void {
    const book = layout === "book";
    this.workspace.classList.toggle("layout-book", book); this.workspace.classList.toggle("layout-scroll", !book);
    this.book.setEnabled(book);
    this.session.follow(book ? { ratio: () => this.book.ratio(), scrollToRatio: ratio => this.book.scrollToRatio(ratio) } : null);
  }
  sourceCommitted(): void { this.layoutGeneration++; this.book.layout(); this.rebuildKaraoke(); }
  rebuildKaraoke(): void { if (this.viewer.file) this.karaoke.rebuild(this.viewer.root); }
  opened(file: LoadedFile): void {
    this.session.key = file.path ? canonicalPath(file.path) : "";
    this.workspace.classList.add("has-file"); this.paint(this.session.place());
    void this.audioBar.setDocument(file.path); void this.karaoke.setDocument(file.path, this.viewer.root);
    this.session.watch(file.path); this.workspace.focus();
  }
  reset(): void {
    this.layoutGeneration++;
    this.session.flush(); this.session.stop(); this.find.close();
    void this.audioBar.setDocument(""); void this.karaoke.setDocument("", null); this.session.key = "";
    this.workspace.classList.remove("has-file"); this.outline.rebuild(null); this.updateProgress();
  }
  refreshOutline(): void { this.outline.sync(!!this.viewer.file); }


  /** Render, contents, find, then put the reading place back after layout and images. */
  paint(place: ReadingPlace | number): void {
    const generation = ++this.layoutGeneration, file = this.viewer.file, key = this.session.key;
    this.outline.rebuild(file ? this.viewer.root : null);
    if (file) this.karaoke.rebuild(this.viewer.root);
    this.find.reapply(false);
    const apply = () => {
      if (!this.isCurrentLayout(generation, file) || this.session.key !== key) return;
      this.book.layout();
      if (typeof place === "number") this.session.scrollToRatio(place);
      else this.session.restore(place);
      this.updateProgress();
    };
    apply();
    requestAnimationFrame(apply);
    void this.viewer.hydrateImages().then(async () => {
      if (!this.isCurrentLayout(generation, file)) return;
      await this.viewer.hydrateArtifacts();
      apply();
    });
  }


  toggleOutline(): void {
    const count = this.viewer.root.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
    const result = this.outline.toggle(!!this.viewer.file, count);
    if (result === "no-file") this.actions.toast("Open a file first.");
    else if (result === "no-headings") this.actions.toast("This file has no headings.");
    else this.actions.refreshChrome();
  }


  scrollToId(id: string): void {
    const node = this.viewer.root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!node) return;
    this.showInDocument(node);
  }


  openFind(): void {
    if (!this.viewer.file) {
      this.actions.toast("Open a file first.");
      return;
    }
    this.find.open();
  }


  showInDocument(node: HTMLElement): void {
    if (this.actions.layout() === "book") {
      this.book.show(node);
      return;
    }
    node.scrollIntoView({ block: "start" });
  }


  /** Karaoke follow: turn the page, or scroll the column. */
  private revealSpoken(el: HTMLElement): void {
    if (this.actions.layout() === "book") {
      this.book.show(el);
      return;
    }
    el.scrollIntoView({ block: "center" });
  }


  markReading(): void {
    if (!this.viewer.file || this.actions.layout() === "book") return;
    const line = this.workspace.getBoundingClientRect().top + 32;
    let current: string | null = null;
    for (const head of this.viewer.root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      if (!head.id) continue;
      if (head.getBoundingClientRect().top <= line) current = head.id;
      else break;
    }
    this.outline.mark(current);
  }


  private onBook(): void {
    if (this.book.index !== this.bookIndex) {
      this.bookIndex = this.book.index;
      this.viewer.hideNoteTip();
    }
    this.folio.textContent = this.viewer.file ? this.book.label() : "";
    this.turnPrev.disabled = !this.book.canPrev();
    this.turnNext.disabled = !this.book.canNext();
    this.outline.mark(this.viewer.file ? this.book.headingId() : null);
    this.updateProgress();
    if (this.viewer.file) this.session.queue();
  }


  updateProgress(): void {
    const r = this.viewer.file ? this.session.ratio() : 0;
    this.actions.progress(r);
  }


  /** Reflow the open book and redraw diagrams after a theme or measure change. */
  restyle(saved?: number): void {
    if (!this.viewer.file) return;
    const generation = ++this.layoutGeneration, file = this.viewer.file;
    const ratio = saved ?? this.session.ratio();
    this.book.layout();
    this.session.scrollToRatio(ratio);
    void this.viewer.hydrateArtifacts().then(() => {
      if (!this.isCurrentLayout(generation, file)) return;
      this.book.layout();
      this.session.scrollToRatio(ratio);
      this.updateProgress();
    });
  }


  onReadKey(e: KeyboardEvent): void {
    if (!this.viewer.file) return;
    if (this.actions.layout() === "book") {
      this.onBookKey(e);
      return;
    }
    this.onScrollKey(e);
  }


  private onBookKey(e: KeyboardEvent): void {
    if (e.key === "Home") {
      e.preventDefault();
      this.book.go(0, true);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      this.book.go(this.book.spreads - 1, true);
      return;
    }
    let dir = 0;
    if (e.key === "PageDown" || e.key === "ArrowRight" || e.key === "ArrowDown" || (e.key === " " && !e.shiftKey)) dir = 1;
    else if (e.key === "PageUp" || e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === " " && e.shiftKey)) dir = -1;
    if (dir === 0) return;
    e.preventDefault();
    if (dir > 0) this.book.next();
    else this.book.prev();
  }


  private onScrollKey(e: KeyboardEvent): void {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") return;
    const view = this.workspace;
    const page = Math.max(80, Math.round(view.clientHeight * 0.9));
    if (e.key === "Home") {
      e.preventDefault();
      view.scrollTop = 0;
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      view.scrollTop = view.scrollHeight;
      return;
    }
    let delta = 0;
    if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) delta = page;
    else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) delta = -page;
    else if (e.key === "ArrowDown") delta = 64;
    else if (e.key === "ArrowUp") delta = -64;
    if (delta === 0) return;
    e.preventDefault();
    view.scrollBy({ top: delta });
  }

  private isCurrentLayout(generation: number, file: LoadedFile | null): boolean {
    // Uploads share an empty position key; layout ownership must not depend on path alone.
    const sameLayout = generation === this.layoutGeneration;
    const sameFile = file === this.viewer.file;
    return sameLayout && sameFile;
  }
}
