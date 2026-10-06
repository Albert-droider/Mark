import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioBar, formatTime } from "../audioplayer";
import { DEFAULT_AUDIO_PREFS, getAudioPrefs, setAudioPrefs } from "../audioprefs";

// jsdom has no media stack: `load()`/`play()` are "not implemented" and object URLs don't exist.
beforeEach(() => {
  HTMLMediaElement.prototype.load = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  URL.createObjectURL = () => "blob:http://localhost/stub";
  URL.revokeObjectURL = () => {};
  localStorage.clear();
  setAudioPrefs({ ...DEFAULT_AUDIO_PREFS });
  document.body.innerHTML = "";
});

const track = { url: "blob:http://localhost/1", label: "h01.mp3" };

/** jsdom has no clock on a media element; give the instance one. */
function fakeMedia(audio: HTMLAudioElement, duration = 1689) {
  let position = 0;
  let paused = true;
  Object.defineProperty(audio, "duration", { configurable: true, get: () => duration });
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => position,
    set: (value: number) => {
      position = value;
    },
  });
  Object.defineProperty(audio, "paused", { configurable: true, get: () => paused });
  return {
    get position() {
      return position;
    },
    set position(value: number) {
      position = value;
    },
    set paused(value: boolean) {
      paused = value;
    },
  };
}

async function readyBar(load = async () => track): Promise<AudioBar> {
  const bar = new AudioBar(load);
  document.body.append(bar.root);
  await bar.setDocument("D:/ws/h01.md");
  return bar;
}

describe("formatTime", () => {
  it("formats minutes and seconds, hours when needed", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9.4)).toBe("0:09");
    expect(formatTime(187)).toBe("3:07");
    expect(formatTime(3725)).toBe("1:02:05");
  });

  it("shows dashes when the length is unknown", () => {
    expect(formatTime(NaN)).toBe("--:--");
    expect(formatTime(-1)).toBe("--:--");
  });
});

describe("AudioBar", () => {
  it("stays hidden when the document has no audio", async () => {
    const bar = new AudioBar(async () => null);
    await bar.setDocument("D:/ws/h01.md");
    expect(bar.root.hidden).toBe(true);
    expect(bar.audio.getAttribute("src")).toBeNull();
  });

  it("shows the player and its label when there is audio", async () => {
    const bar = await readyBar();
    expect(bar.root.hidden).toBe(false);
    expect(bar.audio.src).toBe("blob:http://localhost/1");
    expect(bar.audio.getAttribute("src")).toBe("blob:http://localhost/1");
    expect(bar.root.querySelector(".audio-label")!.textContent).toBe("h01.mp3");
  });

  it("releases the previous audio when the next document has none", async () => {
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const bar = new AudioBar(async (doc) => (doc.endsWith("h01.md") ? track : null));
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
    const play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play = play;
    await readyBar();
    expect(play).not.toHaveBeenCalled();
  });

  it("toggles play and pause from the button", async () => {
    const bar = await readyBar();
    const clock = fakeMedia(bar.audio);
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    bar.audio.play = play;
    bar.audio.pause = pause;

    const button = bar.root.querySelector<HTMLButtonElement>(".audio-play")!;
    button.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("\u25b6"); // the glyph follows the event, not the click

    bar.audio.dispatchEvent(new Event("play"));
    expect(button.textContent).toBe("\u23f8");

    clock.paused = false; // the element reports playing now
    button.click();
    expect(pause).toHaveBeenCalledTimes(1);
    bar.audio.dispatchEvent(new Event("pause"));
    expect(button.textContent).toBe("\u25b6");
  });

  it("jumps back and forward, clamped to the track", async () => {
    const prefs = getAudioPrefs();
    const bar = await readyBar();
    const clock = fakeMedia(bar.audio);
    bar.root.querySelector<HTMLButtonElement>(".audio-forward")!.click();
    expect(clock.position).toBe(prefs.forward);
    bar.root.querySelector<HTMLButtonElement>(".audio-back")!.click();
    expect(clock.position).toBe(prefs.forward - prefs.back);
    bar.root.querySelector<HTMLButtonElement>(".audio-back")!.click();
    expect(clock.position).toBe(0);
    bar.root.querySelector<HTMLButtonElement>(".audio-back")!.click();
    expect(clock.position).toBe(0); // never below zero
    bar.audio.currentTime = bar.audio.duration - 1;
    bar.root.querySelector<HTMLButtonElement>(".audio-forward")!.click();
    expect(clock.position).toBe(bar.audio.duration); // never past the end
  });

  it("seeks by dragging the progress bar", async () => {
    const bar = await readyBar();
    const clock = fakeMedia(bar.audio, 1000);
    const seek = bar.root.querySelector<HTMLInputElement>(".audio-seek")!;
    seek.value = "250";
    seek.dispatchEvent(new Event("input"));
    expect(clock.position).toBe(250);
    seek.dispatchEvent(new Event("change"));
    expect(seek.value).toBe("250"); // the thumb stays where the user put it
  });

  it("follows the clock, showing position and length", async () => {
    const bar = await readyBar();
    const clock = fakeMedia(bar.audio, 1689);
    clock.position = 187.5;
    bar.audio.dispatchEvent(new Event("timeupdate"));
    expect(bar.root.querySelector(".audio-time")!.textContent).toBe("3:07 / 28:09");
    expect(bar.root.querySelector<HTMLInputElement>(".audio-seek")!.value).toBe("111");
  });

  it("applies and remembers the speed", async () => {
    const bar = await readyBar();
    fakeMedia(bar.audio);
    const speed = bar.root.querySelector<HTMLSelectElement>(".audio-speed")!;
    expect(Number(speed.value)).toBe(DEFAULT_AUDIO_PREFS.speed);
    speed.value = "1.5";
    speed.dispatchEvent(new Event("change"));
    expect(bar.audio.playbackRate).toBe(1.5);
    expect(getAudioPrefs().speed).toBe(1.5);
    expect(JSON.parse(localStorage.getItem("mark.audio.v1")!).speed).toBe(1.5);
    // The next chapter keeps the chosen speed.
    await bar.setDocument("D:/ws/h02.md");
    expect(bar.audio.playbackRate).toBe(1.5);
  });

  it("applies and remembers the volume", async () => {
    const bar = await readyBar();
    const volume = bar.root.querySelector<HTMLInputElement>(".audio-vol")!;
    volume.value = "0.4";
    volume.dispatchEvent(new Event("input"));
    expect(bar.audio.volume).toBeCloseTo(0.4);
    expect(getAudioPrefs().volume).toBeCloseTo(0.4);
  });

  it("remembers whether to follow the spoken word", async () => {
    const bar = await readyBar();
    const follow = bar.root.querySelector<HTMLInputElement>(".audio-follow-box")!;
    expect(follow.checked).toBe(true);
    follow.checked = false;
    follow.dispatchEvent(new Event("change"));
    expect(getAudioPrefs().follow).toBe(false);
  });

  it("reports a track that cannot be played instead of failing silently", async () => {
    const bar = await readyBar();
    const heard = vi.fn();
    document.addEventListener("mark:toast", heard);
    bar.audio.dispatchEvent(new Event("error"));
    expect(heard).toHaveBeenCalledTimes(1);
    document.removeEventListener("mark:toast", heard);
  });
});
