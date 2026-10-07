import { describe, it, expect } from "vitest";
import { resolvePreset, themeFamily } from "../themes";

describe("palette mode", () => {
  it("picks the variant that matches light or dark", () => {
    expect(resolvePreset("github-dark", "light").id).toBe("mark");
    expect(resolvePreset("mark", "dark").id).toBe("mark-dark");
    expect(resolvePreset("mono-light", "dark").id).toBe("mark-dark");
    expect(themeFamily("github-dark")).toBe("mark");
    expect(themeFamily("custom")).toBe("mark");
  });
});