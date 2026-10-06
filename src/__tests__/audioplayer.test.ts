import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioBar } from "../audioplayer";

// jsdom has no media stack: `load()` is "not implemented" and object URLs don't exist.
beforeEach(() => {
  HTMLMediaElement.prototype.load = () => {};
  URL.createObjectURL = () => "blob:http://localhost/stub";
  URL.revokeObjectURL = () => {};
});

describe("AudioBar", () => {
  it("stays hidden when the document has no audio", async () => {
    const bar = new AudioBar(async () => null);
    await bar.setDocument("D:/ws/h01.md");
    expect(bar.root.hidden).toBe(true);
    expect(bar.audio.getAttribute("src")).toBeNull();
  });

  it("shows the player and its label when there is audio", async () => {
    const bar = new AudioBar(async () => ({ url: "blob:http://localhost/1", label: "h01.mp3" }));
    await bar.setDocument("D:/ws/h01.md");
    expect(bar.root.hidden).toBe(false);
    expect(bar.audio.src).toBe("blob:http://localhost/1");
    expect(bar.audio.getAttribute("src")).toBe("blob:http://localhost/1");
    expect(bar.root.querySelector(".audio-label")!.textContent).toBe("h01.mp3");
  });

  it("releases the previous audio when the next document has none", async () => {
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const bar = new AudioBar(async (doc) => (doc.endsWith("h01.md") ? { url: "blob:http://localhost/1", label: "h01.mp3" } : null));
    await bar.setDocument("D:/ws/h01.md");
    await bar.setDocument("D:/ws/h02.md");
    expect(revoke).toHaveBeenCalledWith("blob:http://localhost/1");
    expect(bar.root.hidden).toBe(true);
  });

  it("releases the previous audio when switching chapters", async () => {
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    let n = 0;
    const bar = new AudioBar(async () => ({ url: `blob:http://localhost/${++n}`, label: "x.mp3" }));
    await bar.setDocument("D:/ws/h01.md");
    await bar.setDocument("D:/ws/h02.md");
    expect(revoke).toHaveBeenCalledWith("blob:http://localhost/1");
    expect(bar.audio.src).toBe("blob:http://localhost/2");
  });

  it("does not autoplay", async () => {
    const play = vi.fn();
    HTMLMediaElement.prototype.play = play;
    const bar = new AudioBar(async () => ({ url: "blob:http://localhost/1", label: "h01.mp3" }));
    await bar.setDocument("D:/ws/h01.md");
    expect(play).not.toHaveBeenCalled();
  });
});
