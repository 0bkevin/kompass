# Independent adversarial policy review

Review date: 2026-10-18 UTC. Reviewer: discovery-terms child agent, independently of the agent implementing the source access policy. This review addresses the behavior of the new policy controls, not a legal certification. Source-contract evidence is recorded in [DISCOVERY-TERMS.md](DISCOVERY-TERMS.md).

## Scope and method

Inspected `server/access-policy.mjs`, `server/robots-policy.mjs`, outbound `safeFetch`, discovery fetchers, metadata enrichment, company-context inspection, source validation/readback and cached-reference reuse. Created `tests/compliance-policy-adversarial.test.mjs`. All tests use isolated temporary SQLite storage, local HTTP requests to the app, and synthetic DNS/HTTPS responses. They do not contact social networks, run Actors, use provider keys, or buy services.

The reviewer did not edit the policy implementation or create commits. Reproductions were sent to the implementing agent as they were found. That agent fixed issues in the shared checkout, after which the reviewer reran the same tests.

## Actionable findings

### P2 — Cosmetic edits could erase restricted ingestion identity

A legacy YouTube reference with an ordinary renamed source label and no `metricsOrigin` was initially denied. An authenticated PATCH changing its title and source label cleared `platform` and allowed the cached body to be analyzed. The original source ID survived, but the permission checker did not resolve it. This bypass required no external request.

**Fix verified:** the source ID is resolved to its source record, and a restricted ingestion flag is retained across content/source/URL edits. The HTTP regression now receives 403 after cosmetic edits.

### P2 — Cached automatic metadata survived permission revocation

A manually created link could be automatically enriched under a valid operator metadata grant. Once the remote body exceeded 250 characters, the enrichment function's early return reused that body after the grant was removed. A second `/analyze` returned 200 instead of denying reuse. No new network request occurred, but the cached import's permission basis was lost.

**Fix verified:** automatic metadata now records ingestion access provenance, and reuse checks the current grant. Removing the grant causes the same HTTP analysis request to return 403 without fallback network activity.

### P2 — Standalone source responses exposed stale effective enablement

Workspace state projected denied sources as disabled, while the standalone sources GET returned raw `enabled: true` records without an access policy. This did not bypass the discovery network gate, but clients could display denied legacy sources as active.

**Fix verified:** the standalone GET now returns effective `enabled: false` and `accessPolicy.allowed: false`. The implementing agent also applied the shared projection to POST/PATCH responses; this review's regression directly exercises GET.

### P2 — Restricted cached data remained visible through reference readback

Known blocked legacy API records could still return cached bodies, personal author identifiers and derived metrics through the references endpoint. Preventing new analysis did not prevent this redisplay. The regression requires the original public link to remain available while body/author/metrics are suppressed.

**Fix verified:** permission-aware reference projection now retains the public link while suppressing cached body, author and metrics. The HTTP regression passes.

### P3 — Dotted Google hostname passed permission checks but lost attribution

The policy normalized `trends.google.com.` to `trends.google.com`, while `parseFeed` required an exact hostname. Consequently, the permitted official RSS hostname variant lost mandatory Google attribution and Google-specific identity. The regression accepts either denying that alternative hostname or correctly retaining its provider attribution.

**Fix verified:** parser hostname normalization retains Google identity and required attribution. The regression passes.

### P2 — Some corpus filters initially omitted actual-source resolution

The editorial comparison corpus and topic observation reference filter initially called `referenceUsePolicy` without the original source record. A changed source label or a revoked custom-feed grant could therefore evade filtering in these indirect uses, even after direct analysis/draft checks resolved the source correctly.

**Implementation response:** the implementing agent added actual-source resolution in these paths. The direct HTTP provenance regressions pass. A full suite and the main feature review remain necessary to verify all indirect paths.

### P2 — Redirect destination permission was absent from cached provenance

An approved metadata URL A redirected to a separately approved destination B. Both were checked during collection, but only A was saved as the ingestion permission basis. Removing B's grant while retaining A allowed cached B text to be analyzed again. The offline HTTP regression reproduces a 200 response where a denied reuse should produce 403.

**Fix verified:** `safeFetch` now retains the complete approved redirect trail. RSS and metadata ingestion preserve that trail, and cached-reference permission checks revalidate all destinations. The fourteenth HTTP regression now returns 403 when destination B loses its grant while A remains approved.

### Mid-flight permission revocation check

An additional regression removes a reviewed feed's grant inside the synthetic retrieval callback, before the result is committed. The source refresh now discards the returned item and does not increase the reference count. This directly verifies the implementing agent's post-retrieval source-policy check.

## Passing adversarial checks

The tests directly exercise the following controls:

- Instagram/TikTok Apify, YouTube, Reddit and disguised restricted RSS hostnames fail before injected provider transports are called, even with a synthetic operator grant for a restricted host.
- Expired/revoked grants and path-prefix widening fail closed; changing the reviewed file takes effect without a permission cache.
- A robots denial causes only the synthetic robots request and prevents the target page request.
- A permitted page redirect cannot make an HTTPS request to Instagram.
- Unreviewed metadata links never reach their injected transport.
- Google RSS hostname lookalikes, alternate paths, extra query keys and duplicate geography keys are denied.
- Robots matching honors a product-specific group, the longest applicable rule and percent-encoded unreserved URL bytes.
- A conservative HN process-wide ceiling allows 1,000 synthetic requests, then rejects the next request with 429 before another provider socket is opened.

These checks are intentionally bounded. They do not prove that an operator's evidence is an authentic license, that every website routes encoded URLs identically, or that all historical content has been classified correctly.

## Verification state

Final independent adversarial verification: **15 cases passed, 0 failed, 0 skipped**. All directly reproduced policy bypasses in this report were fixed and independently rerun. The corpus-resolution finding was checked by code inspection and the direct provenance tests; the full application suite remains the implementing agent's integration responsibility.

The final combined command was `node --test tests/compliance-policy-adversarial.test.mjs tests/compliance-attribution.test.mjs tests/remediation-discovery-2.test.mjs`: **33 passed, 0 failed, 0 skipped**. This includes the earlier 18 attribution/data-minimization checks: canonical citations, merged evidence, draft snapshots, opportunity credits, HN title decoding and body/author omission. TypeScript and whitespace validation passed at the earlier attribution stage. These focused results do not replace the final application-wide integration run.

## Remaining review boundaries

- HN/Algolia throttling is shared across brands within a single Node process and independently tested. It uses an in-memory 1,000-request/hour ceiling. Multiple processes, application restarts and other clients sharing the outbound IP require a shared external quota budget; this implementation does not certify their aggregate request rate.
- Approved company-page inspection has its own URL, redirect and login-route checks. This review inspected those controls but did not exhaustively test every regional login path or every publisher's terms.
- Stored data is not automatically erased by blocking a source. Retention, historical-record classification, operator review authenticity and jurisdiction-specific duties remain explicit operating responsibilities.
- Contract compliance and statutory legality are different questions. These controls enforce the product's reviewed source policy; they do not establish legality in every country or grant permissions withheld by a platform.
