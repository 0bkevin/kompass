# Assets and attachments interactive review

Independent reviewer `interactive_assets`, 2026-10-18 UTC. **The bounded asset workflow passed. Two presentation defects were corrected and passed the coordinator's final compiled browser retest.** This reviewer made no functional/server changes, external provider calls, publication, global build or commits.

The normal production host was `http://127.0.2.70:5470`, `DATA_DIR=/tmp/radar-interactive-assets-20261018`. The synthetic 30X company offers practical AI education for Latin American leaders, with separate Ventas EdTech and Operaciones HealthTech audiences. No actual student or follower data was used. The initial report checkpoint preceded browser interaction.

## Method and setup

The local API created accounts, two companies, audiences and an original draft, and invited the reviewer role. Later, it moved the already UI-attached original draft through review to approved only to prepare the protected-deletion case. [Fixture manifest](evidence/assets/api-seed.json) and [supplementary assertions](evidence/assets/11-api-supplemental.json) distinguish setup and HTTP authorization probes from UI observations.

All uploads, filters/search, details, downloads, reference capture, draft resource selection/unselection, save/reload, delete confirmation/cancellation and company switching used the **native T3 browser**, one own incognito tab with explicit `tabId`, at 1440 × 900 and 390 × 844 CSS pixels. No alternate browser automation was used. Screenshots came from `preview_snapshot(save:true)` and its returned filesystem path.

Fixtures remain under `/tmp/radar-interactive-assets-20261018-private/fixtures`; [their manifest](evidence/assets/fixtures.json) contains byte sizes and hashes. They include UTF-8 TXT/Markdown/CSV, a valid tiny PNG, malformed Latin-1 text, unsupported EXE and sparse 25 MiB + 1 byte file. The MP4 has a synthetic file-type signature only: it tests policy messaging and absence of processing, not valid video playback.

## Expected and actual outcomes

| Case                                                          | Expected                                                   | Actual / evidence                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty company → Archivos                                      | Purpose, upload action, size and encoding explained        | First-upload guidance, 25 MiB and UTF-8 visible. [Empty desktop](evidence/assets/01-empty-desktop.png).                                                                                                                                                                       |
| Native batch: TXT, MD, CSV, PNG                               | Save all once with accurate names/results                  | Four 201 responses, four “Guardado” rows, four cards; PNG loaded. [Success](evidence/assets/02-upload-success.png).                                                                                                                                                           |
| Mixed batch: valid TXT + malformed UTF-8 + EXE + oversize TXT | Keep success and report individual failures                | One saved, three failed. UTF-8 and format returned distinct 400 instructions. Oversize stopped locally before a POST. [Partial result](evidence/assets/03-partial-upload.png).                                                                                                |
| Reload, type tabs, Unicode search                             | Persist and filter actual library                          | Five initial valid files survived reload. Imágenes showed only PNG; Documentos showed four documents. `ñandú` found exactly its original-name card.                                                                                                                           |
| Unicode detail → native download                              | Preserve filename and original bytes                       | `30X-ñandú-日本語-🙂.txt`, 161 bytes, exact match. [Detail](evidence/assets/04-unicode-detail.png), [byte checks](evidence/assets/21-native-downloads-verified.json).                                                                                                         |
| Capture reference with malformed file                         | Reject while retaining valid work                          | Title, Spanish language and context remained after UTF-8 error. Replacing only the file with Markdown saved one reference.                                                                                                                                                    |
| Text reference detail / attachment download                   | Context and authenticated file available                   | Supplied text, Markdown name/MIME/133-byte size and private download shown. Native download matched original bytes. [Detail](evidence/assets/07-reference-attachment.png). Attached-document body is not implicitly claimed to have been parsed.                              |
| Reference → Crear guion → Recursos                            | Inherit attachment; permit changes and persist             | Local-structure draft inherited capture Markdown. Unselect/save/reload left it unchecked; select CSV/save/reload retained only CSV. [Derived draft](evidence/assets/09-derived-draft-resources.png). No external AI generation claimed.                                       |
| Original draft → Recursos                                     | Associate chosen files and persist                         | PNG and Unicode TXT remained selected after save and full reload. [Original draft](evidence/assets/10-original-draft-resources.png).                                                                                                                                          |
| Delete attached asset from approved piece                     | Reject and preserve history                                | Real UI DELETE returned 409 with approved/scheduled/published explanation; card remained. [Protection](evidence/assets/12-approved-deletion-protected.png).                                                                                                                   |
| Disposable asset → cancel / confirm delete                    | Cancel preserves; confirm removes file                     | Cancel kept one matching card. Confirm showed “Archivo eliminado”, zero matching cards; old authenticated file URL returned 404.                                                                                                                                              |
| Company switch after image filter/search                      | Only selected-company assets; discard local asset UI state | No foreign cards, no modal, no upload results; type filter reset to Todos. Global search remained visible/editable as `pixel`; clearing restored full results on return. [Company reset](evidence/assets/13-company-reset.png).                                               |
| Reviewer → library / detail / download                        | Disable edits; permit reads                                | Upload and all delete buttons disabled. Detail and native Unicode download worked, exact 161 bytes. [Library](evidence/assets/18-reviewer-library.png), [download](evidence/assets/22-reviewer-download.png).                                                                 |
| Supplementary HTTP authorization                              | Enforce server roles/company boundaries                    | Reviewer upload/delete 403; main-company asset ID under second company 404; unjoined-company collection 404. [Sanitized results](evidence/assets/11-api-supplemental.json). These are API probes, not UI clicks.                                                              |
| Video reference upload                                        | Store without claiming audiovisual processing              | Detail said “Lectura audiovisual restringida”; no Examinar video action. Reference stayed `new`, no `videoAnalysis`. [Video detail](evidence/assets/08-video-restricted.png). Capture help contradicted this and was corrected below.                                         |
| Mobile library and Unicode detail                             | Readable, reachable controls, no page overflow             | At 390 px, document width 390; no main-content overflow. Unicode modal width 370, right edge 380; filename/download fit. [Library](evidence/assets/15-mobile-library.png), [detail](evidence/assets/16-mobile-detail.png). Emulated CSS viewport, not physical touch testing. |

## Defects and corrections

1. **P2 — Capture help advertised unavailable processing.** Agregar referencia said “Un video se procesa con Gemini…” and advertised a 20-minute analysis limit. The saved-video detail and stored reference correctly restricted processing, isolating stale help text as the cause. [Before](evidence/assets/06-video-copy-red.png). `CaptureModal` in `src/features/Discovery.tsx` now explains that provided text can be analyzed, files/links retained, audiovisual analysis is currently unavailable, and upload does not process the video. The 25 MiB limit remains explicit.

2. **P2 — Preview buttons had no accessible names.** Native accessibility output named document/video previews only `button`; filenames were sibling text. [Before tree](evidence/assets/17-preview-accessibility-red.json). `src/features/Assets.tsx` now adds `aria-label={\`Abrir ${asset.name}\`}` to the existing preview button. One attribute changed; no nested control or action change.

Changes were coordinated before editing. The coordinator requested native before/after proof for these reversible text/label changes instead of brittle source-string tests. After the production rebuild, the coordinator independently verified six filename-labelled preview buttons, the native button name “Abrir 30X-ñandú-日本語-🙂.txt”, and opening the correct detail. At 390 px, CaptureModal explained audiovisual unavailability without the Gemini/20-minute/Examinar promise; document width remained 390. No browser runtime errors or failed requests occurred during that retest. [Compiled assertions](evidence/assets/compiled-checks.json), [accessibility tree](evidence/assets/compiled-accessibility-tree.txt), [named mobile preview](evidence/assets/compiled-named-preview-mobile.png), [corrected mobile capture copy](evidence/assets/compiled-capture-copy-mobile.png). This compiled after-check was performed by the coordinator, separately from the independent workflow review above.

## Commands and checks

Normal host launch:

```bash
env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN -u RADAR_API_ONLY PORT=5470 DATA_DIR=/tmp/radar-interactive-assets-20261018 DISCOVERY_ENABLED=false npm start
```

Retained private scripts for API setup and supplementary probes (credentials read from the private file, never copied into this report):

```bash
node /tmp/radar-interactive-assets-20261018-private/seed.mjs
node /tmp/radar-interactive-assets-20261018-private/probes.mjs
```

Nearby tests traverse multipart storage/downloads, UTF-8/size boundaries, upload recovery and blocked video processing:

```bash
node --test tests/remediation-assets-1.test.mjs tests/remediation-assets-2.test.mjs tests/workflow-recovery.test.mjs tests/compliance-media-ai.test.mjs tests/video-analysis.test.mjs
```

**31 passed, 0 failed/skipped/cancelled.** [Output](evidence/assets/20-nearby-tests.txt). Automated tests include inclusive 25 MiB and server-side 25 MiB + 1 rejection. The UI tested the oversize guard with the sparse file, avoiding a large network/browser-memory upload.

```bash
/home/ubuntu/.agents/skills/impeccable/scripts/impeccable detect --json src/features/Discovery.tsx
/home/ubuntu/.agents/skills/impeccable/scripts/impeccable detect --json src/features/Assets.tsx
git diff --check
```

Both detector outputs were `[]`; whitespace check passed. [Capture detector](evidence/assets/14-copy-detector.json), [preview detector](evidence/assets/19-preview-detector.json). Targeted verification does not establish full WCAG conformance.

Native selectors included `input[type=file]` with `preview_upload`, `.library-tabs button` with `preview_click`, the labelled global search input with `preview_type`, `.asset-picker label … input` with `preview_click`, and real browser confirmations with `preview_dialog`. Download checks read the actual browser-downloaded files and compared bytes against fixtures, rather than substituting HTTP fetch for the download click.

## Diagnostics, limits and cleanup

- Intentional failures produced 400 for invalid files, 409 for approved attachment, 403 for reviewer mutation and 404 for deleted/wrong-company asset. No JavaScript runtime exception was observed. One tester-entered `/references` URL correctly showed not found; the route was corrected to `/inbox` and not counted as a product failure. Early invalid exact-selector syntax was corrected before filter assertions.
- Approved attachment deletion was exercised. Scheduled/published protection shares the existing server guard, but this review did not publish or construct a separate published attachment history. No PDF/codec matrix, live video analysis, physical touch, screen-reader application or exhaustive fuzzing is claimed.
- Global search persistence across companies was explicitly checked with the coordinator and preserved as existing behavior. The query remained visible/editable; no foreign-company asset appeared.
- The only owned browser tab, `tab_g_c3cfa641-d7e6-4a79-9606-68ffb03b615c`, was closed. Host session `93371` stopped gracefully; listener exited and port 5470 was free. No Vite host started. Nearby-test session `77453` exited 0. The coordinator subsequently restarted this data directory in its own host session `95534` for compiled checks and closed its own test tab.
- Synthetic data/fixtures remain available for final retest. Private login/cookie/ID pointer: `/tmp/radar-interactive-assets-20261018-private/private.json`; host log: `/tmp/radar-interactive-assets-20261018-private/host.log`. These remain outside the repository.
