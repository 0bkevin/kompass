# Studio interactive review — 2026-10-18

Status: completed, with one bounded preview fix. The reviewer used an isolated test host at port 5465, isolated SQLite data under `/tmp/radar-interactive-studio-20261018`, and one owned incognito browser tab. The QA account and workspace fixtures are synthetic. No production account or provider configuration was changed. The tab is closed; the isolated API host remains running for the coordinating reviewer's compiled retest.

## Evidence boundary

- Content generation successes invoke the authenticated Codex CLI using the application's actual structured-generation instructions and JSON schema.
- HTTPS/DNS for reserved `*.example.test` AI, owned-site and webhook destinations are simulated by `tests/helpers/interactive-host.mjs`. This proves application behavior with a real text model, not access to a live OpenAI HTTP provider or external source.
- Provider reject/invalid/empty scenarios are deliberately synthetic transport responses. Local mode uses the application's real local editorial engine.
- Screenshots and sanitized response/state captures belong in `docs/interactive-20261018/evidence/studio/`.

## Review scope

Creation in all five formats; audience, channel and exact CTA controls; original idea versus reference; save/reload and dirty-navigation protection; workspace isolation; bounded provider failures and recovery; explicit AI disable/local mode/reset; desktop 1440 and mobile 390; browser diagnostics.

## Initial persisted inspection

The restarted database contains three AI drafts: an EdTech commercial follow-up post, a four-panel HealthTech operations carousel based on the synthetic reference, and an EdTech review-process newsletter. I inspected the stored text directly. The carousel addresses its selected HealthTech audience, uses four numbered panels, preserves the requested CTA, and avoids invented performance statistics. The post has a manually edited CTA field while its script retains the previous CTA; this remains an observation until the editor/export contract is verified.

## Results

| Check | Expected | Actual |
| --- | --- | --- |
| Post | Original Spanish EdTech content, exact creation CTA, hypothetical example without invented metrics | Persisted Codex output independently inspected in SQLite and opened in the UI. Concrete four-step commercial follow-up process with an explicitly illustrative example; no performance statistics. Export preserves independently authored script and CTA sections. |
| Carousel | Selected HealthTech audience, Instagram, four panels, source provenance | Persisted Codex output independently inspected and opened in UI. Four coherent HealthTech operations panels and exact CTA; selected audience/channel and reference ID persist. It adapts the synthetic EdTech reference rather than copying its text. |
| Newsletter | Useful long-form EdTech draft with coherent sections and CTA | Persisted Codex draft independently inspected and opened in UI. The Registrar/Revisar sections distinguish evidence, review and authorization; no invented metrics. |
| Reel, local | Three scenes, selected audience/channel, explicit CTA overrides conflicting free-form note | Created interactively from an original idea. Three scenes, HealthTech need, Instagram and chosen exact CTA applied. No hypothetical example when Omitir was selected. Honest Estructura local label and separate manual-review brief. |
| Video, local/mobile | Four scenes, hypothetical example, reference, YouTube, exact CTA | Created interactively at 390px. Four scenes, example explicitly identified as hypothetical, HealthTech audience, reference provenance and chosen CTA persist. |
| Reel, real model recovery | Three concrete scenes for EdTech, TikTok, no unsupported statistics, exact CTA | One new real Codex CLI success after the failure tests. It produced three coherent visual/voice scenes and human-review guidance in about 16 seconds. The saved engine is ai and the UI shows Asistencia IA. |
| Editing | Editable title/hook/script/caption/CTA/channel/audience survive save and reload | All these fields changed on the local reel, saved successfully, and matched after full page reload. Clearing the audience persisted as General; channel persisted as YouTube. Dirty state cleared. |
| Unsaved navigation | Cancel preserves edits and workspace | Both Todas las piezas and brand switch opened the unsaved-change confirmation. Dismissing it retained the edited title, dirty state, route and original brand. |
| Workspace isolation | The other synthetic brand does not show Studio drafts/references/assets | Switching to Salud Operativa QA displayed its empty state; its state API returned zero pieces, references and assets. EdTech draft title absent. |
| Provider rejection | Explicit error, preserved input, no draft saved | Synthetic upstream HTTP 503 yielded API 502 and a visible alert. The same form remained filled and editable. |
| Invalid JSON / empty object | Explicit error, no garbage saved | Each yielded its own visible 502 alert, retained form input and released busy state. Piece count remained 5 across all three failures. Restoring success and retrying the same form created one valid piece, raising count to 6. |
| Disable AI / reset | Explicit local mode, then inherited platform service without entering a key | Used Usar motor local, verified local status and the local-generation modal notice, then Usar servicio de la plataforma restored platform readiness. Password/key field stayed empty. |
| Mobile 390 | Reachable form controls, readable type, no page overflow | Creation dialog width 370px with internal vertical scrolling; fields 330px and 16px type. All controls and submit worked. Editor document scroll width equals viewport width 390px. |
| Desktop 1440 | Editor and preview remain usable | Created, edited, saved, exported and reviewed at 1440px. Screenshots retained. |
| Browser diagnostics | No unexpected runtime failure | Three expected console resource errors correspond to deliberately injected 502 provider failures. No application exception was observed. The source retest console contained Vite connection messages and the React DevTools information notice only. |

## Confirmed defect and bounded fix

The preview appended the CTA unconditionally even when the generated script already contained the exact same CTA. Repro: open the saved AI reel `499ac172-eda1-4c0c-b8a7-a1d6e00cffe7`. Before the change, its saved script contained `Comenta REVISIÓN para conversar con tu equipo.` once, while `.post-copy` displayed it twice.

`src/features/Studio.tsx` now derives a trimmed CTA and omits the separate preview paragraph only when that nonempty exact text already occurs in the script. The script, separate CTA field, save API and Markdown export are unchanged. This does not synchronize independent authored fields or rewrite old CTAs.

The coordinating reviewer authorized this change after receiving the exact repro/component. A temporary Vite frontend at port 5467 proxied to the isolated host verified the actual updated source without a global build:

- Exact-match AI reel: script occurrence count 1; preview occurrence count changed from 2 to 1.
- Independently edited post: the script contains the older CTA and the separate field contains a different CTA. The updated preview retains that separate CTA once, as authored.
- Four local logic cases passed: exact match, different CTA, whitespace-only CTA and a trimmed exact match.
- Prettier check passed. Impeccable detector returned `[]`.

The temporary Vite process is stopped and port 5467 is free. A final production build/retest is intentionally left to the coordinating reviewer; this reviewer did not run a global build or commit.

## Evidence

- `evidence/studio/interaction-results.json`: persisted UI values, successful save/reload, workspace isolation, exact/different CTA checks and browser diagnostics.
- `evidence/studio/provider-failures.json`: all three failure responses and retained form state.
- `evidence/studio/synthetic-persisted-state.json`: synthetic pieces and reference records, without users, sessions or secrets.
- `evidence/studio/codex-provider-journal.jsonl` and `codex-reel-output.json`: real model provenance/output. Three successful generations predate the restart; this resumed pass added one successful Codex generation and two local drafts.
- `evidence/studio/post-export-independent-fields.md`: actual browser download, proving the script and CTA remain separate export sections.
- Screenshots: `local-reel-desktop.png`, `create-mobile-390.png`, `local-video-mobile-390.png`, `ai-reel-desktop.png`, `cta-preview-before.png`, `cta-preview-after.png`.

## Bounded limitations

This review verifies application interaction with synthetic company/audience/reference fixtures and real Codex text generation over a simulated provider transport. It does not establish production HTTP provider availability, external-source permissions, model quality for real company data, or actual social publication. Existing post/carousel/newsletter successes were reopened and independently inspected rather than regenerated after the restart. Structured scene metadata is not exposed as a separate timing/storyboard editor; this review assessed the editable script and export behavior and did not invent a scene-synchronization requirement. The mobile check uses a 390px emulated CSS viewport, not physical mobile hardware or a screen reader. It is a workflow check, not a full WCAG certification.

## Coordinated production retest

After the successful combined production build, root restarted port5465 and reopened both saved examples in the compiled UI. The exact CTA occurs once in the script and once in the preview (one preview paragraph). The independently authored different CTA occurs zero times in its script and once in the preview (two paragraphs). Neither case changes saved text. Browser diagnostics contained no errors or failed requests. Evidence: [counts](evidence/studio/compiled-preview-checks.json), [compiled screenshot](evidence/studio/compiled-cta-preview-after.png).
