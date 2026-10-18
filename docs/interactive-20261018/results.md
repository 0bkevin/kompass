# Results and manual learning — interactive review, 2026-10-18

Completed with one confirmed defect fixed: clearing an optional publication URL previously reported success while retaining the old URL. A failing HTTP regression reproduced it before the change. Explicit blank now removes the URL from both the outcome and piece; omitted API fields preserve the existing URL. The same outcome ID, creation date, publication date and metrics survive the correction.

All data is synthetic: 30X practical AI for LatAm; CEOs de EdTech and Operaciones de HealthTech. No external publication, scraping or provider request occurred. Discovery was disabled and all default sources were disabled. The isolated production host was `http://127.0.2.68:5468`, with `DATA_DIR=/tmp/radar-interactive-results-20261018`. Initial checks used the existing production build. After the source fix, a temporary Vite frontend at `http://127.0.2.68:5477` used the same production API and dataset. The coordinator owns the final integrated production build check.

Fixture preparation is distinct from the tested UI: a local API registered the synthetic owner and created a company, two audience groups, draft/review/approved/scheduled pieces, a second empty company, and an explicitly synthetic own-material reference. API transitions prepared approval; this review does not claim to retest the whole approval workflow. A second host (`127.0.3.68`) held a separate synthetic reviewer login; its membership was a local database fixture. All four publication outcomes, corrections, URL clearing and the all-zero record were saved through the actual Results form using native T3 interactions. Direct API probes tested server boundaries independently.

## Expected and actual outcomes

| Check | Expected | Actual |
|---|---|---|
| Empty company / no approved pieces | Explain prerequisites and offer Studio; no results | Pass. Empty state names approval and a real publication; no fabricated metrics. [Desktop](evidence/results/01-empty-desktop.png). |
| Piece eligibility | Approved/scheduled/published own pieces only | Pass. Approved A/B and scheduled HealthTech available; draft and review absent. Direct writes to both unapproved pieces returned 409. |
| Required fields | Date and all metrics required; optional URL and notes | Pass. Blank metrics/date invalid in native form. URL intentionally optional. Date defaults to current time; publication date is editable. |
| Numeric validation | Finite 0–10¹²; decimals preserved | Pass. Native fields reject blanks, negatives, values above limit and nonfinite text. Zero, 0.125 and the inclusive upper boundary are valid. The intentional contract permits decimals (`step=any`), not integers only. API negative/null/string Infinity/excess values returned 400. |
| Date and URL validation | Reject invalid/future dates and private URLs without mutation | Pass. Native future date invalid; API invalid/future date and private URL returned 400. The full form retained a rejected private URL, date, 1300.75 / 80.25 / 4.5 and notes. Persisted learning stayed unchanged. [Rejected form](evidence/results/03-rejected-preserved-desktop.png). |
| First manual save | One manual outcome; approved content preserved | Pass. Form POST returned 200. Outcome and piece retained title/channel/group; `origin=manual`, `metricsOrigin=manual`, `publicationOrigin=manual_record`. No connector receipt was created. [Saved](evidence/results/02-saved-desktop.png). |
| Correct metrics / notes / URL | Update same record, not duplicate | Pass. A corrected to 1300.75 views, 80.25 interactions, 4.5 contacts; same ID `3925b356-3722-41a7-9279-e7b2afb6ae88` and original `createdAt`. |
| Clear optional URL | Remove link from outcome and piece, persist after reload | **Failed before; fixed.** Previously input became blank but POST 200 retained the old link. Regression was red, then green. Fixed UI sends explicit blank; server distinguishes it from omission. Desktop/mobile clear and reload show no stale link. [Desktop](evidence/results/04-cleared-url-desktop.png), [mobile](evidence/results/07-cleared-url-mobile.png), [reloaded](evidence/results/09-mobile-reload.png). |
| Zero results | Store zero, not treat as missing | Pass. Scheduled HealthTech piece saved 0 / 0 / 0, became manually recorded published, and remains its own audience/channel row. [Mobile](evidence/results/05-zero-mobile.png). |
| Attribution | Match the selected piece, group, channel and own reference | Pass. Outcomes use server-owned title/channel/group. Fourth piece retains its original own-material `referenceId`, reference source and URL; its publication URL is distinct. No external source or connector delivery is invented. Results describes the metric source as manual; the form names group/channel/format. [Linked record](evidence/results/12-source-linked-record.png). |
| Arithmetic and channel separation | Sum stored values exactly; separate networks | Pass. EdTech LinkedIn: 2 pieces, 1500 / 100 / 4.5. EdTech Instagram: 1 piece, 10.125 / 1.5 / 0.25. HealthTech Instagram: 1 piece, 0 / 0 / 0. Server audience total for EdTech is 1510.125 / 101.5 / 4.75; UI separates channels. [Desktop summary](evidence/results/10-summary-desktop.png), [mobile summary](evidence/results/11-summary-mobile.png). |
| Learning claims / sample size | No causal or success guarantee; no adjustment without comparable sample | Pass. Summary warns about manual counts, different windows, networks and causality; UI says it does not predict success. Actual opportunity reason leaves editorial learning pending until 3 topic + 3 other publications match segment/channel/format/measurement window. Four mixed records do not satisfy it. |
| Dirty piece selection | Cancel retains form; accept discards it | Pass. Confirm dialog appeared. Cancel retained piece B and unsaved 999 views without POST. Accept switched to HealthTech and fresh blank metrics. |
| Reload protection / persistence | Unsaved edits guarded; saved values reload | Pass. Native beforeunload dialog was observed; cancel kept the form. After save, reload completed and reselecting A restored exact decimals, date, notes and cleared URL. |
| Company change | Guard edits, then reset selected form and results | Pass. Cancel retained company A, piece A and unsaved note. Accept showed B's empty state, no form/table. Returning to A restored persisted totals with blank piece selection and no active form. [B empty](evidence/results/08-company-b-empty.png). |
| Reviewer | Readable results, no editor form/actions; API write 403 | Pass. Insights GET 200, no outcome form/select, POST 403 “Necesitas permisos de edición.” [Reviewer](evidence/results/06-reviewer-desktop.png). |
| Company isolation | Foreign company and foreign piece unavailable | Pass. Reviewer GET for company B returned 404; owner POST using A's piece under B also returned 404. No outcomes changed. |
| Responsive interface | 1440×900 and 390×844 usable | Pass. Mobile document width equals 390 px, inputs are 16 px and fit 320 px. Summary table scrolls inside a keyboard-focusable region (table 610 px, region 358 px); document does not overflow. This is Chromium viewport emulation, not physical-device touch testing. |

## Fix and repeatable checks

The root cause spanned two boundaries: OutcomeForm converted blank URL to `undefined`, so JSON omitted the correction; `outcomeInput` and the outcome route also collapsed explicit blank into an absent value and revived the previous URL. Persistence replaces the outcome JSON, but the piece spread retained its old field. The fix sends the trimmed blank, keeps explicit presence in validated input, chooses fallback only on omission, and writes the resolved URL (including absence) into the piece within the existing transaction.

Changed source: `src/features/Journey.tsx` OutcomeForm and `server/audience-insights.mjs`. Added `tests/interactive-results.test.mjs` exercises the real authenticated HTTP route and persistence: save → omitted correction preserves → invalid correction nonmutating → explicit blank clears both → same ID/creation date/metrics → subsequent omission cannot revive the link.

```sh
node --test tests/interactive-results.test.mjs
# Before: 0 passed, 1 failed; explicit blank retained https://example.org/synthetic-post.

node --test tests/interactive-results.test.mjs tests/remediation-results-1.test.mjs tests/audience-insights.test.mjs
# After: 20 passed, 0 failed, 0 skipped.
```

[Red output](evidence/results/url-clear-before.txt), [green output](evidence/results/url-clear-after.txt), [structured observations](evidence/results/observations.json). Impeccable detector on Journey returned `[]`: [detector](evidence/results/design-detector.json). No debug instrumentation was added to source. Browser-only request/error instrumentation stayed in the isolated test page.

Host commands used (provider variables unset):

```sh
PORT=5468 DATA_DIR=/tmp/radar-interactive-results-20261018 DISCOVERY_ENABLED=false npm start
RADAR_API_PORT=5468 WEB_PORT=5477 npx vite --host 0.0.0.0
```

Native T3 was the only browser automation: preview_status → own preview_open (`open:false`, `reuseExistingTab:false`, incognito, distinct hostname) → explicit tab IDs for every interaction. Desktop measured 1440×900 and mobile 390×844; screenshots were saved with preview_snapshot `save:true`, copied here, and visually inspected. Own tabs were closed after evidence capture.

## Diagnostics and limits

No unexpected browser exception or failed happy-path request appeared. Expected adversarial 400, 403, 404 and 409 responses are listed in the observations. Assigning literal Infinity to native numeric inputs intentionally produced browser validation warnings. Native confirm dialogs can cause preview_select to time out until resolved; these timeouts were the exercised guard, not an application failure. Final source-frontend diagnostics show Vite connect/React DevTools informational entries only and no failed requests.

No real publication or connector delivery was attempted. Manual records intentionally set editorial state to published after the user confirmation; absence of connector receipts was verified. The final dataset contains four manual outcomes, one draft and one review piece. Learning was checked at the insufficient-sample state; the focused existing integration tests cover the comparable-sample adjustment and transactional rollback. Credentials and sessions are excluded from committed evidence. No global build, global suite, staging, or commit was performed by this reviewer; integrated production verification belongs to the coordinator.

## Coordinated production retest

Root restarted port5468 after the successful combined build. In the compiled Results form, root saved a synthetic publication URL and then cleared it using the visible update action. The same outcome ID and all four records remained; the URL was absent from both outcome and piece, and the old link disappeared. After full reload and reselection at390px, the URL stayed blank and exact metrics1300.75/80.25/4.5 persisted. Document width390px; no browser errors or failed requests. Evidence: [before/after/reload](evidence/results/compiled-clear-checks.json), [mobile screenshot](evidence/results/compiled-cleared-url-mobile.png).
