---
type: security_review
context: "e01s02 direct reader and e01s03 file-owned notes against 90f89e7"
status: reviewed_with_residual_limits
---
# Reader and versioning — security self-review

Date: 2026-10-09. Reviewer: parent. This is a source and boundary review, not a penetration test.

The owner explicitly approved original Markdown writes with versions. The old e01s01 read-only boundary is superseded.

## Same-file note update

The owner rejected visible note blocks. New notes use a subtle underline and a floating reader control.

- PASS ✓ Quote and context anchors resolve against the full owned text index. Ambiguous matches are not guessed.
- PASS ✓ Parser records, safe IDs, and exact-source guards authorize note edits.
- PASS ✓ HTML-sensitive metadata is escaped. Quoted marker examples do not become live controls.
- PASS ✓ Hover displays plain text outside the article, never injected note HTML.
- PASS ✓ Note bytes use the existing version store. Actual native save retained original BOM/CRLF prose.
- PASS ✓ Existing legacy notes and drafts remain intact. No automatic migration or deletion.
- PASS ✓ Rejected writes retain input and expose failure. Current Markdown export includes new notes.
- PASS ✓ Same-file note changes introduce no network request, auth flow, secret, eval, or automatic upload.

Residual source-write and storage limits still apply. This update is not a release approval.

## Traced boundaries

| Input → sink | Protection |
| --- | --- |
| Markdown → HTML | DOMPurify sanitizes renderer output. Authored stylesheets and forms are forbidden. |
| Mermaid → SVG | Strict Mermaid configuration and an SVG sanitization pass remain active. |
| Authored checkbox → source edit | Only parser-generated IDs with out-of-band task metadata receive authority. |
| Cell input/paste → Markdown | Plain-text paste, inline serialization, exact block replacement, and sanitized cell rendering. |
| Code/artifact editor → source | Text only. No eval, shell, runtime, or automatic agent request. |
| Renderer → native version write | Registered canonical document identity, Markdown extension checks, and a 16 MB source limit. |
| Version ID → filesystem | Strict version filenames, identity/path checks, and no renderer-controlled snapshot destination. |
| Native source replacement | Durable attempted snapshot, expected-source checks, copied Rust permissions, and same-directory replacement. |
| Cleanup → files | Only parsed expired snapshots are eligible. Latest snapshot, source, and unknown files are protected. |
| Browser storage → document | Runtime schema/identity guards and acknowledged IndexedDB transactions. |
| Share/export → recipient | Explicit action. Current snapshot/hash binding, selected block only, no automatic upload. |
| CSV → spreadsheet | Formula-like cells become text. |
| Native close → window | Flush before close. Required destroy permission is restricted to the main window capability. |

## Reproduced and fixed

Two renderer regressions showed that default sanitization retained authored global CSS and submitting forms.

These features can hide app status or navigate the webview. The shared sanitization config now forbids `style` and `form` tags.

KaTeX inline styles remain available. Full browser checks still render math and diagrams.

Malformed heading-link encoding also produced `URIError: URI malformed`. The reader now reports the invalid link instead of throwing.

Actual native close failed with:

```
window.destroy not allowed. Permissions associated with this command: core:window:allow-destroy
```

The main-window capability now permits the API's guarded destruction. Actual native save-before-close passed after the fix.

No confirmed HIGH security finding remains from this review. The complete strict audit is still NOT READY for other reasons.

## Compression and transaction update

Browser history stores gzip/raw payloads separately from validated metadata. IndexedDB transaction acknowledgements follow commit; failed writes roll back working content and version insertion.

Native gzip snapshots retain readable legacy raw versions. Decoders check logical size, compressed bounds, malformed/trailing input, and the 16-MiB source limit. Metadata listing avoids decompressing every snapshot.

These changes reduce history payloads, not total storage growth. No history cap silently deletes required data.

## Supply chain

Audit remediation adds official `@vitest/coverage-v8` 4.1.11 and matching Vitest 4.1.11. Native gzip uses `flate2` 1.1.9 with default features disabled and `rust_backend` enabled.

The npm/Bun and Cargo lockfiles are updated. No forced major upgrade is applied. Formal local slopcheck tooling is still absent.

Both production and full npm audits report 0 high, critical, or moderate entries and 2 low package entries.

KaTeX and Mermaid share GHSA-238p-pmpm-9mq7. Its prototype-pollution prerequisite is not disproved merely by using DOMPurify.

Forced KaTeX 0.19.0 or Mermaid 10.8.0 changes remain outside this task. No package is silently downgraded.

## Residual limits

- Two native source checks are best-effort conflict detection, not cross-process compare-and-swap.
- Compressed history still has no total storage budget.
- Local data and versions are not encrypted.
- Existing external image URLs can contact their hosts.
- Inline document styling remains supported. Sanitization is not a complete visual trust boundary.
- Copying Rust permissions does not prove full NTFS security-descriptor preservation.
- Browser storage can be cleared or evicted outside MARK.
- Reader backup does not include the version repository.
- No auth flow, remote API, secret, or automatic upload was introduced.

The current [strict audit](../verifications/AUDIT-e01-s03.md) records the remaining hard-gate failures.
