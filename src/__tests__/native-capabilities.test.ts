import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("permits the guarded Tauri close handler to destroy only the main window", () => {
  const capabilities: unknown = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  expect(capabilities).toMatchObject({ windows: ["main"],
    permissions: expect.arrayContaining(["core:window:allow-destroy"]),
  });
});
