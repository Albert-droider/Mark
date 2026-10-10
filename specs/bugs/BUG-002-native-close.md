---
type: bug
context: "e01s02 actual native save-before-close audit"
id: BUG-002
status: fixed
baseline: 90f89e7
---
# BUG-002 — Native close saves but cannot destroy the window

## Reproduction

Change a task in the native reader. Immediately press the custom close button.

The source flush succeeds, but the native window stays open. WebView2 reports:

```
window.destroy not allowed. Permissions associated with this command: core:window:allow-destroy
```

## Cause

Tauri's close-request listener destroys the window after the permitted request. The main-window capability allowed close, but not destroy.

## Fix

Add `core:window:allow-destroy` to the existing main-window capability. Keep the source flush and close guard unchanged.

## Validation

The capability regression failed before the permission change and passed afterward.

Actual native UAT passed 20 checks, including dirty-source acknowledgement before the owned window closes. No other MARK session was closed.

Evidence: `C:/Users/vandi/AppData/Local/Temp/mark-native-audit-yhk2sh/results.json`.
