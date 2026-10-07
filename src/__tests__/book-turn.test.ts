import { describe, expect, it, vi } from "vitest";
import { Book } from "../book";

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

describe("book page turns", () => {
  it("turns from the page edge and leaves a marked word alone", () => {
    const sheet = document.createElement("div");
    const article = document.createElement("article");
    const mark = document.createElement("mark");
    mark.className = "hl hl-yellow has-note";
    mark.textContent = "geneeskunde";
    article.append(mark);
    sheet.append(article);
    document.body.append(sheet);
    sheet.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);

    const book = new Book(sheet, article, () => {});
    book.setEnabled(true);
    book.spreads = 4;
    book.index = 1;

    mark.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 950, button: 0 }));
    expect(book.index).toBe(1);

    mark.remove();
    article.textContent = "plain";
    article.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 950, button: 0 }));
    expect(book.index).toBe(2);
    sheet.remove();
  });
});
