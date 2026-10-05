// Detect whether we are running inside the Tauri webview (native) or a plain browser.

export const isTauri: boolean =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const SHOW_RUNTIME_WARNING = false;
export { SHOW_RUNTIME_WARNING };
