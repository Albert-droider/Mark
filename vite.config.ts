import { defineConfig } from "vite";

// Tauri expects a fixed port during dev, and to not clear the console.
export default defineConfig({
  clearScreen: false,
  // Use relative base so assets resolve under Tauri's custom protocol on every OS.
  base: "./",
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: false,
    cssCodeSplit: false,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
