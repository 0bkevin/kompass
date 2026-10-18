# kompass: full application redesign

The user extended the approved landing identity to every application page and component. This supersedes the previous landing-only boundary. The implementation stays in the independent `design/landing-dark-purple` worktree and uses web port 5188 / API port 3038. No credentials or private data were copied.

## What changed

- Shared charcoal surfaces, lavender actions and fine dividers throughout the app. Hedvig Letters Serif sets page titles; Geist carries forms, navigation, working text and data. The shared four-module kompass mark replaces the radio motif.
- A 240 px navigation rail, compact 64 px toolbar and accessible mobile drawer. The existing company switcher, roles, search and capture action remain functional.
- Redesigned signup/login and all three company setup steps, with company context and audience needs kept visible.
- Home, company, audience, opportunities, discovery and references now emphasize the next editorial decision, the audience need and the supporting evidence.
- Content library, script editor, comments, resources, media generation states, approval, scheduling, calendar, results, file library and settings share the same controls and surfaces while retaining their task-specific layouts.
- Public community questions and their response states use the same identity. New demo artwork uses the kompass mark and “Le damos dirección a tu contenido.” Existing stored files remain untouched.

The editorial direction remains “Le damos dirección a tu contenido.” Copy describes what the team can decide or do, preserves capability limits and adds no customer, savings or performance claims. The prior Resend/Exa research and customer-message work are in `docs/landing-dark-purple/`; the implementation uses its own mark, assets and copy.

## Skills and review

Impeccable guided the Operate brief, shared system, craft floor and bounded desktop/mobile inspection. The previously installed Emil Kowalski skills guided control feedback and motion review. `no-ai-slop` guided the established Spanish writing direction. Three agents implemented separate page groups; a fourth fresh agent reviewed the finished screens independently.

The motion review found inherited hover lifts, ungated hover states, keyboard-triggered chevron transitions, smooth operational scrolling and an inconsistent drawer transition. These were corrected in one batch. The reviewer scored all four grouped findings resolved and returned **Approve**. Working-page navigation stays immediate. The public landing keeps its previously approved native parallax.

One Impeccable detector run returned 511 findings: 499 advisories against the superseded design-system file, 11 warnings for the explicitly selected Geist font, and one Google Sans warning for the official Google sign-in button. No other defect families were reported. The design-system files are updated from the finished build; the scan was not rerun or suppressed.

The independent finish reviewer inspected all 34 supplied captures individually and returned **disposition: ship**, with no material fixes. The verdict covers the supplied route and component states. Its report is `.impeccable/review/app-redesign/finish-review.md`.

## Verification

`npm test`: **591 passed, 0 failed, 0 skipped**. `npm run build`: **passed**, including TypeScript. `git diff --check`: passed. No new runtime dependency was added.

The collaborative T3 browser checked `/home`, `/brand`, `/audience`, `/opportunities`, `/radar`, `/inbox`, `/studio`, `/calendar`, `/results`, `/assets` and `/settings` at 1440 × 900 and 390 × 844. Each route loaded its expected heading. The visible-text contrast check found no failures in those viewports, and none had page-level horizontal overflow. These checks cover visible text, not a full accessibility certification. Tablet checks at 768 and 1024 px confirmed the rail/drawer breakpoint and no page overflow.

Exercised with synthetic local data:

- Signup, manual three-step company setup, logout and login; the created company persisted in the session.
- Mobile drawer focus trapping, Shift+Tab wrap, inert background, Escape dismissal and focus return. Keyboard focus shows a 2 px lavender outline.
- Save a reference and create an audience profile.
- Create a public question, choose a group/topic and receive its thank-you state.
- Upload a local TXT file to the library.
- Create a draft, send it to review, approve the version, save a date and find it in the calendar; month/week controls remain usable.
- Media creation and official network connections show their configured/unavailable states accurately.

The browser does not expose native reduced-motion emulation. The check temporarily enabled the actual reduced-motion CSS branches through CSSOM, verified that spatial/animation properties were absent while 150 ms color feedback remained, then restored the original conditions. The code review also checked keyboard behavior, fine-pointer hover gating and compositor-safe properties. No new page entrance animation was added to frequent working screens.

Screenshots and the viewport audit are in `.impeccable/review/app-redesign/evidence.json`. The folder also contains the motion report, detector output, individual screens and contact sheets. T3 snapshots scale desktop captures uniformly to 1280 × 800; mobile captures use device pixel scaling.

## Limits

This isolated server has no external-provider credentials. Live YouTube API refresh, OAuth, paid AI generation, image/video output and connector delivery were not exercised. Their existing backend behavior and guards remain in place. The calendar still does not publish automatically. Historical uploaded content can retain its own colors and type.
