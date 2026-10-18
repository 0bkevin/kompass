# Public discovery integration revalidation — 2026-10-18

Real Hacker News and Google Trends reads passed through the application. GDELT returned HTTP 429, retained no false results, and appeared as a partial failure with a visible retry action. No external account is needed for these three services.

## Method and observed outcomes

- Separate production host on port 5492, temporary data, no `.env` loading, no provider or Google credentials, periodic scheduler disabled. Native T3 incognito tab on a unique loopback hostname. Main ports 3026/5450 were untouched.
- Created a synthetic local account and completed all onboarding steps through the UI with original 30X-like company text and a declared EdTech audience. Home automatically started discovery without configuration.
- First batch: Hacker News fetched 40, Google Trends fetched 10, producing 47 distinct stored references and 3 updates within the batch. GDELT returned 429 once. Home displayed the partial outcome; sources named the failing provider and HTTP status.
- Navigating away/back, reloading Home and requesting the cached preparation retained all source timestamps and exactly one radar-refresh activity. No automatic repeated batch was triggered by re-entry.
- Paused GDELT through its UI control and selected Home’s retry once. The two remaining sources succeeded; preparation became `ready`, the partial notice cleared, 50 updates were recorded, and no duplicate URL rows appeared. GDELT’s original error and attempt timestamp remained on the paused source.
- Every stored HN/Trends record retained canonical provider attribution. These public metadata records had empty bodies and no author/username identifier fields. This is a bounded schema check, not a universal personal-data certification.
- Final browser snapshot reported zero console entries and zero failed browser network requests. The provider-side GDELT failure was correctly returned as an application-level partial response.

## Backoff and limits

The deterministic scheduler regression `node --test --test-name-pattern='continuous discovery obeys cadence' tests/intelligence.test.mjs` passed 1/1. It covers cadence, persisted exponential backoff and overlapping-run prevention without a network request. This is separate from the live UI reads; the live server’s scheduler was disabled.

Two bounded live batches were run. No AI, paid/social/video services, publication or real account data were used. No source implementation changes were necessary. The temporary server was stopped and this agent’s tab closed.

Sanitized counts, timestamps and assertions are in [discovery.json](discovery.json).
