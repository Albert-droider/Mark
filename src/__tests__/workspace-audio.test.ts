import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async () => new ArrayBuffer(16));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...(args as [])) }));

import { audioObjectUrl } from "../workspace";

describe("audioObjectUrl", () => {
  let blobs: Blob[];

  beforeEach(() => {
    invoke.mockClear();
    blobs = [];
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return "blob:test";
    };
  });

  it("turns the raw bytes from Rust into a playable object URL", async () => {
    await expect(audioObjectUrl("D:/ws/audio/h01.mp3")).resolves.toBe("blob:test");
    expect(invoke).toHaveBeenCalledWith("read_audio_file", { path: "D:/ws/audio/h01.mp3" });
    expect(blobs[0].type).toBe("audio/mpeg");
    expect(blobs[0].size).toBe(16);
  });

  it("picks the mime type from the extension, defaulting to mp3", async () => {
    await audioObjectUrl("D:/ws/audio/h01.wav");
    expect(blobs[0].type).toBe("audio/wav");
    await audioObjectUrl("D:/ws/audio/h01.m4a");
    expect(blobs[1].type).toBe("audio/mp4");
    await audioObjectUrl("D:/ws/audio/zonder-extensie");
    expect(blobs[2].type).toBe("audio/mpeg");
  });
});
