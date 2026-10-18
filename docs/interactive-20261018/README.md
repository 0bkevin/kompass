# Independent interactive workflow review

Completed: **10 independent workflow reviews, 9 confirmed defects fixed and retested, 452/452 automated tests passing, production build passing**. Each report below contains its own expected/actual matrix, evidence and practical limits. Desktop and mobile browser checks used synthetic company data.

Started 2026-10-18 at `383933d`, after the managed-service implementation. The existing automated baseline has 439 tests. Each reviewer uses an isolated SQLite data directory, a separate loopback hostname (cookies ignore port numbers), and a dedicated T3 browser tab. The example company is synthetic: 30X-style practical AI education for Latin American leaders, with EdTech sales and HealthTech operations audiences. No actual student or follower records are used.

The review checks a real user-visible outcome, persistence, recovery and isolation. A correct rejection of an unsupported operation is distinguished from a defect. Screenshots and expected/actual matrices are recorded in each individual report. Findings are not marked fixed until an executable regression and/or the original interactive scenario has been repeated successfully.

| Workflow | Independent reviewer | Port | Report |
| --- | --- | --- | --- |
| Account and company setup | interactive_company_entry | 5461 | [company-entry.md](company-entry.md) |
| Audiences, signals and voluntary community evidence | interactive_audience | 5462 | [audience.md](audience.md) |
| Discovery, references and source management | interactive_discovery | 5463 | [discovery.md](discovery.md) |
| Opportunity prioritization and AI reasoning | resume_opportunities | 5464 | [opportunities.md](opportunities.md) |
| Content drafting and editing, including AI | resume_studio | 5465 | [studio.md](studio.md) |
| Versioned review and approval | resume_approval | 5466 | [approval.md](approval.md) |
| Calendar, export and explicit delivery | interactive_calendar_delivery | 5467 | [calendar-publishing.md](calendar-publishing.md) |
| Recorded publication results and learning | interactive_results_learning | 5468 | [results.md](results.md) |
| Team invitations, roles and service settings | interactive_team_settings | 5469 | [team-settings.md](team-settings.md) |
| Assets and attachment workflow | interactive_assets | 5470 | [assets.md](assets.md) |

## Confirmed fixes

| Defect | Corrected behavior | Verification |
| --- | --- | --- |
| Company context replaced a declared audience with a generic topic group | Preserve the explicit EdTech CEO role and need; retain the hypothesis label | Three regressions; original onboarding and save/reload at desktop/mobile |
| Community evidence links disappeared | Exact generated public-question routes now remain clickable | Three regressions; four compiled links open the correct aggregate results |
| AI hook and adaptation were stored but hidden | Display complete generated fields with editorial limits | Exact persisted text, fresh Codex output, citations and mobile conversion |
| Assignment could change approved content while retaining approval | Compare the canonical content used by the approval version | Six HTTP regressions; approved/scheduled rejection, unchanged storage and fresh UI approval |
| Preview repeated a CTA already in the script | Suppress only an exact redundant separate CTA | Compiled exact-match and independently authored different-CTA cases |
| Calendar search had no input | Expose the existing filter and scoped export | Compiled month/week next/back/today, matching/unmatched query and actual CSV download |
| Clearing a publication URL retained the old link | Explicit blank clears both records; omission preserves | HTTP regression and compiled UI clear/reload with exact metrics and unchanged record count |
| Capture help promised disabled video processing | Show the actual audiovisual availability | Compiled mobile modal has the corrected wording and no old provider/time promise |
| Asset preview controls had no accessible filename | Name each preview action with its filename | Six named controls, native accessibility-tree assertion and correct document opening |

## Final validation and limits

- `TMPDIR=/tmp/radar-test-tmp-20261018 node --test --test-timeout=20000 tests/*.test.mjs`: **452 passed**, no failures, skipped or cancelled tests. Thirteen new regressions cover the confirmed data/state defects. [Output](evidence/validation/tests.log).
- `npm run build`: passed, including TypeScript. [Output](evidence/validation/build.log).
- Prettier checks passed for all changed application and test sources. Diff whitespace checks passed with `cr-at-eol` enabled to preserve the actual CSV downloads' CRLF bytes. [Formatting output](evidence/validation/format.log).
- Original affected scenarios were repeated in the compiled application; after screenshots and structured observations are linked from the individual reports. Report links and JSON artifacts were validated. Calendar exports were independently parsed and checked.
- Main previews were restarted with the final build on ports3026 and5450. Disposable test browsers and hosts were closed after the checks; fixture databases remain under `/tmp` for investigation.

The AI tests use real Codex generation over a synthetic provider transport. Webhook outcomes are controlled receipt tests, with **no real social post**. Production API credentials, quota and provider endpoint connectivity were not validated. Current social/video access restrictions remain enforced; this review does not claim live LinkedIn/Instagram/TikTok/YouTube trend coverage. Live HN and Trends discovery succeeded; GDELT's rate limit was shown and recovered through source management. Mobile checks use Chromium viewports, not physical devices or a full accessibility certification.

The review produced separate local commits for onboarding, audience evidence, the Codex QA host, discovery, opportunities, approval, Studio, calendar, results, team/settings and assets. The final evidence commit records the combined production checks. Inspect the complete sequence with `git log --reverse --oneline 383933d..HEAD`.

## Recovery checkpoint

The T3 restart cancelled the initial servers, tabs and unfinished reviewers. Completed reports and isolated databases survived. Unfinished reviews were assigned again with their original inputs and unresolved findings. An initial automated rerun hit `ENOSPC` in the environment's temporary directory; after confirming disk space and selecting a fresh disposable `/tmp/radar-test-tmp-20261018`, all **445 tests passed** and the production build passed. This checkpoint includes the three new company-context and three new evidence-link regressions; final validation will be recorded after the remaining reviews.

The community provenance fix was independently retested in the updated compiled browser: four generated signal links were present on desktop and at 390 px, the clicked link opened the correct paused question, and the original aggregate counts persisted. The remaining reviews use separate databases and reserved test destinations rather than real student data or social publication.

After the approval fix, the full suite passed **451/451**, with no skipped or cancelled tests. This is an intermediate checkpoint, not the final validation for the remaining workflows.

## Transcript and challenge premises

| User premise | Concrete behavior under review | Evidence / practical boundary |
| --- | --- | --- |
| Begin with each company's existing content | Account, company context inspection, editable suggested brand and audiences, persistence and company switching | Company-entry review. A declared EdTech CEO audience now survives topic extraction. Supplied context produces a hypothesis; it does not establish who consumes the content. |
| Understand audience needs instead of the founder's preferences | Separate EdTech sales and HealthTech operations groups; evidence and assumptions labelled separately; audience-specific opportunity filters and drafts | Audience and opportunities reviews. A commercial reference does not automatically qualify for HealthTech. |
| Infer interests without treating students as all followers | Role/needs definitions and aggregate voluntary questions; no student or follower imports | Audience review verifies group-specific minimum samples and anonymous aggregate storage. No claim that enrollment proves following or represents every consumer. |
| Minimize intrusive research and manual browsing | Public-source discovery, saved references, repeat observations, partial failures and recovery | Discovery review. HN and Trends were read live; GDELT rate limiting was visible. Social/video collection remains unavailable under the current access policy. |
| Identify emerging trends reliably | Comparable observation history required before a growth claim | Discovery and opportunity reviews verify “Sin historial suficiente” for the synthetic case. A single popular item is not demonstrated growth. |
| Explain the hook, format and relevance | Stored AI reasoning with exact source quotations, hypothesis label, limitations and contextual adaptation | Opportunity review checks complete rendered fields and literal citation matches. It tests editorial explanations, not proof that a hook caused performance. |
| Adapt to both brand and audience | Selected audience, channel, format and CTA flow into an editable draft | Opportunity and studio reviews use actual Codex-generated structured output, inspect its meaning and persist/reload it. |
| Complete the team's working flow | Discover → prioritize → draft → review → plan/deliver → record results | Separate workflow reviews, rather than one shared happy-path conclusion. Approval tests cover version conflicts and reject unreviewed assignment changes. |
| Serve multiple companies with a simple interface | Distinct workspaces, role enforcement, empty states, retained forms after errors, desktop/mobile checks | Each report records its own scope and expected versus actual outcomes. |
| Public content and no personal data | Explicit collection restrictions, exact provenance, aggregate community counts and synthetic fixture inputs | Reviews distinguish policy rejections from defects. This audit does not grant access to restricted providers or validate external platform terms as a legal opinion. |
| Remove Telegram | No Telegram workflow or connection is part of the user journey | Team/settings review verifies removal and restricted legacy paths. |

## Codex test provider

`tests/helpers/interactive-host.mjs` is an explicit standalone QA host. It is not imported by `npm start` and requires `RADAR_INTERACTIVE_TEST_HOST=1` plus a disposable `radar-interactive-*` data directory under a temporary root. Its reserved example-namespace HTTPS/DNS transport is intercepted inside that process: AI and webhook hosts under `example.test`, and the owned-site fixture `qa-owned.example.com`. The latter passes the real website validator, which correctly rejects `.test` websites. Production SSRF and source-permission behavior is unchanged.

AI output is genuinely generated by the locally authenticated Codex CLI using a schema-bound ephemeral read-only invocation; it is not a canned response. Only synthetic/owned company data is supplied. HTTP/DNS toward the reserved test destination is simulated, and this does not validate production OpenAI API credentials, quota or endpoint connectivity. Optional webhook delivery is also a synthetic receipt test; no social account is posted to.

The initial smoke request exercised the app's draft endpoint, produced a persisted `generationEngine=ai` draft, and completed Codex generation in 11.1 seconds. Sanitized provider journal and output are under `evidence/ai-provider/`. Later independent browser tests will cover the same path from UI and test failure recovery.

Official reference: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) describes `codex exec`, structured output and ephemeral execution.

The reviewed social/video collection restrictions remain in effect. The UI should show those operations as unavailable, never successful. Public-source discovery checks may contact the documented HN, Trends and GDELT endpoints; those live results and transient failures are reported separately from controlled test cases.
