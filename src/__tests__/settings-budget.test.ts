import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../settings";
import * as settingsStore from "../store";
import { DEFAULT_SETTINGS } from "../types";

const original = structuredClone(settingsStore.getSettings());
beforeEach(() => {
  vi.spyOn(settingsStore, "onSettings").mockImplementation(() => () => {});
  settingsStore.setSettings(structuredClone(DEFAULT_SETTINGS));
});
afterEach(() => {
  document.body.replaceChildren();
  settingsStore.setSettings(structuredClone(original));
  vi.restoreAllMocks();
});

describe("document storage setting", () => {
  it("starts at 1 GiB, persists a changed limit, and keeps that limit when appearance resets", () => {
    const panel = new SettingsPanel(); document.body.append(panel.root);
    const budget = panel.root.querySelector<HTMLInputElement>('[aria-label="Document storage budget"]');
    expect(budget).not.toBeNull();
    expect(budget!.value).toBe("1024");
    budget!.value = "512";
    budget!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(settingsStore.getSettings().documentBudgetMiB).toBe(512);
    panel.root.querySelector<HTMLButtonElement>(".reset-btn")!.click();
    expect(settingsStore.getSettings().documentBudgetMiB).toBe(512);
    expect(panel.root.textContent).toContain("80%");
  });
});
