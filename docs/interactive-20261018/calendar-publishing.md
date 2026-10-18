# Calendar, export and explicit delivery — interactive review

Completed 2026-10-18 by independent reviewer `interactive_calendar_delivery`. One confirmed bug was fixed: calendar search was implemented by the screen but unreachable because the app toolbar omitted this route. All bounded calendar/export/delivery scenarios below passed after that fix.

## Environment and evidence boundary

- Production test host: port 5467, origin `http://127.0.2.67:5467`, isolated `/tmp/radar-interactive-calendar-20261018`. Native collaborative browser, owned incognito tab, no external browser automation.
- Initial scheduling/export checks used the existing compiled production build. The one-line search fix and following checks used temporary Vite port 5476 proxying the same isolated API. A final compiled-production search retest belongs to the root review; this report does not claim that build was rerun here.
- Desktop 1440×900 and emulated mobile viewport 390×844. Mobile CSS layout and clicks were exercised, not physical-device gestures.
- Fixture setup used normal authenticated local APIs to create a synthetic 30X practical-AI company, one EdTech sales segment, five owned pieces, and review/approve four of them. The draft was intentionally unapproved. One planned piece was placed in November to test month scope. Setup is not claimed as UI evidence or AI-generated content.
- Webhook URL was `https://qa-webhook.example.test/publish`. The standalone host intercepted its HTTPS/DNS transport and produced controlled 403, 202, and connection-loss outcomes. No actual social account, post, email, or message was used. Production permission/SSRF policy was unchanged. This workflow required no AI calls.

## Expected / actual matrix

| Check | Expected outcome | Actual |
| --- | --- | --- |
| Month / week / date selection | Correct period and selected date; upcoming adjacent-month content does not inflate month count | Pass. October showed 42 grid dates, count 1 despite visible adjacent November event. Week of 19–25 Oct had 7 dates and count 1. Selecting 20 Oct showed its piece. |
| Period navigation / today | Month and week advance in proper increments; today restores current period | Month/week switching and date selection passed. Next/back/today sequence is left to the root compiled-build retest; it was not repeated in this bounded pass. |
| Approved tray / disclosure | Draft absent; approved unplanned pieces available; disclosure works | Pass. Three approved pieces initially; unapproved TikTok draft absent. Collapse removed the content with `aria-expanded=false`. |
| Schedule / past date | Past date rejected without mutation; future approved plan saved | Pass. 17 Oct was rejected with “Elige una fecha futura para programar la pieza.” Modal stayed open. 20 Oct 14:30 UTC saved. |
| Reschedule / persistence | Changed date and time persist across navigation | Pass. Reprogramar changed the plan to 21 Oct 16:45 UTC; API and reloaded UI retained it. |
| No automatic publication | Scheduling and opening/cancelling confirmation never send | Pass. Provider journal did not exist until explicit final confirmation, after all calendar, export, and cancel checks. |
| Calendar search | Search field available, results and export follow query | Failed before fix: zero toolbar inputs. Pass after fix: one input, “IA práctica” left one matching event. Unmatched query removed events and disabled CSV. |
| CSV download | Visible period and query scope; preserved quotes/newlines/date/time/audience; spreadsheet safety | Pass. Native download yielded one row, UTF-8 BOM, UTC, 21 Oct 16:45, EdTech segment, multiline script/caption, doubled CSV quotes, and apostrophe protection for title beginning `=`. November row excluded. |
| Markdown download | Current piece title, channel/format, hook, script, caption, CTA and source | Pass. Native download preserved all tested fields and newline content; source was honestly “Idea propia”. |
| Dirty / edited planned piece | Unsaved edits block send; saved edit cancels approval and plan | Pass. Send disabled while dirty. Saving a script edit returned to draft and removed `scheduledFor`; calendar/API no longer treated it as a current plan. |
| Approval / destination version | No unapproved schedule/send; stale confirmation rejected before transport | Pass. Draft schedule and send each 409. Stale approval and stale destination each 409; journal unchanged. |
| Explicit confirmation | Show title, destination and immediate-send effect; cancellation harmless | Pass. Modal named the piece and test webhook, explained acceptance versus final channel publication, and said date only organizes the calendar. Cancel then reopen caused zero sends. |
| Known rejection / retry | Keep approved piece; show rejection; require explicit retry confirmation | Pass. Synthetic 403 produced `failed`, retained approval and offered “Confirmar reintento”. Switching transport to success did not send until that control was clicked. |
| Success / receipt / reload | Persist accepted receipt; no false claim of final social publication | Pass. HTTP 202 saved receipt with destination, request ID and timestamp. Reload retained “Webhook aceptó la pieza” and instruction to verify final publication. Send control disappeared. |
| Repeat accepted request | Return receipt without another provider request | Pass. Direct repeat POST returned 200 and same receipt. Journal stayed at two calls: rejected request and explicit successful retry, both with the same idempotency key. |
| Uncertain request / reload / status query | Block resend because destination may already have received it | Pass. Connection loss yielded `uncertain`; modal explained duplicate risk and offered only status query. Query, reload and repeat POST caused no new send; repeat returned 409. Total journal calls remained exactly 3. |
| Workspace isolation | Unrelated account cannot inspect/send another workspace piece | Pass. Independently registered account received 404 on GET and POST publish before invitation acceptance. |
| Reviewer | May read plan/receipt, cannot schedule/send | Pass. After accepting a normal reviewer invitation: publish GET 200, schedule PATCH 403, publish POST 403. UI showed read-only explanation and zero schedule buttons. |
| Mobile | Task controls readable, reachable, contained in viewport | Pass at 390 px. Document width 390, search width 318. Calendar scroll stayed within its 356 px region (525 px content). Confirmation, rejection, uncertain-state controls and receipt wrapped within the screen. |

## Confirmed fix and diagnosis

**P2 — Calendar search was inaccessible.** `Calendar.tsx` already applied workspace search to its entries, approved tray, and CSV period rows; `App.tsx` rendered that input only for radar, inbox, studio and assets. The red-capable browser assertion on `/calendar` was:

```js
document.querySelectorAll('input[aria-label="Buscar en esta sección"]').length === 1
```

Before: `false` (0 inputs). Ranked hypotheses were toolbar route omission, hidden CSS input, and stale feature build. No input existed in the DOM, falsifying CSS hiding; the compiled Calendar already exposed its period/export behavior. Adding `calendar` to the toolbar route list restored the intended input. After: `true` (1 input), actual typed query filtered events and the native CSV download. No duplicate implementation test was added for this one-line display change; the exercised browser behavior and artifact assertions are the relevant seam.

Changed source: `src/App.tsx`, toolbar search route list only. The manual Impeccable detector returned `[]` for that file. No unrelated UI redesign or backend change was made by this reviewer.

## Evidence

- [Desktop before missing search](evidence/calendar-publishing/calendar-desktop-before-search.png)
- [Desktop with search restored](evidence/calendar-publishing/calendar-desktop-after-search.png)
- [Calendar at 390 px](evidence/calendar-publishing/calendar-mobile-390.png)
- [Explicit confirmation at 390 px](evidence/calendar-publishing/confirm-delivery-mobile.png)
- [Rejected request at 390 px](evidence/calendar-publishing/rejected-mobile.png)
- [Accepted receipt after reload](evidence/calendar-publishing/receipt-mobile.png)
- [Uncertain request blocked](evidence/calendar-publishing/uncertain-mobile.png)
- [Reviewer calendar](evidence/calendar-publishing/reviewer-calendar-mobile.png)
- [Actual CSV download](evidence/calendar-publishing/calendar-filtered.csv), [actual Markdown download](evidence/calendar-publishing/piece-export.md)
- [Sanitized observed checks](evidence/calendar-publishing/observed-checks.json), [provider journal](evidence/calendar-publishing/provider-journal.jsonl)

## Exact validation commands

```sh
RADAR_INTERACTIVE_TEST_HOST=1 PORT=5467 DATA_DIR=/tmp/radar-interactive-calendar-20261018 node tests/helpers/interactive-host.mjs
WEB_PORT=5476 RADAR_API_PORT=5467 npx vite --host 0.0.0.0
python3 docs/interactive-20261018/evidence/calendar-publishing/verify-evidence.py
/home/ubuntu/.agents/skills/impeccable/scripts/impeccable detect --json src/App.tsx
```

Artifact verifier output: `PASS: CSV scope/date/quoting/multiline/formula safety; Markdown content; exactly three explicit transport attempts and stable retry key`. Detector: `[]`.

Browser checks used native `preview_open`, `preview_snapshot`, `preview_click`, `preview_type`, `preview_resize`, and `preview_evaluate`, always with this reviewer's explicit tab ID. API guard requests were authenticated same-origin fetches through the actual local routes, and statuses are recorded above. No credentials, cookies, or invitation tokens are stored in the report/evidence. Private fixture pointers remain only in the temporary data directory for the root production retest.

The owned tab was closed and temporary Vite server stopped at completion. The isolated host remains available for the root's final production build validation. Live provider delivery, final social publication, physical touch and AI generation are outside the claims of this bounded review.
