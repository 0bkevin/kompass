# Feature-level source terms review

Reviewed 2026-10-18 UTC. This supersedes earlier descriptions of the optional social connectors as activatable by supplying credentials. The implementation contains Apify adapters, but **this deployment does not run them**. No target-platform permission was established for the current Instagram/TikTok collection and reuse. Paying Apify does not provide that permission.

This is a review of the implemented access paths and known contractual requirements, not a legal opinion for every country or a certification of every uploaded file. The original challenge is stricter than mere public accessibility: no private audience data, third-party login bypass, or dependence on violating source terms.

## Feature disposition

| Feature                                                 | Enforced behavior after review                                                                          | Evidence / remaining condition                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account, company sessions and team roles                | Local authentication and tenant isolation; no external audience account access                          | User-account privacy, hosting and regional obligations still need deployment-specific review.                                                                                        |
| Company website inspection                              | Reads only an operator-reviewed HTTPS origin, path and purpose, subject to robots restrictions          | Public accessibility and ownership assertions alone do not establish the required source/reuse permissions.                                                                          |
| Instagram/TikTok company links                          | Saves public citation links without reading profiles or followers                                       | No implied audience knowledge or official account connection.                                                                                                                        |
| Instagram discovery via Apify                           | Blocked before credential evaluation, Actor execution or budget reservation                             | No established Meta permission for this collection/reuse.                                                                                                                            |
| TikTok discovery via Apify                              | Blocked before Actor execution                                                                          | No established applicable TikTok-approved access arrangement.                                                                                                                        |
| LinkedIn / Facebook / X / other restricted social pages | Link-only; generic web/RSS and redirects cannot fetch them                                              | Future official integrations require separate review; no scraper fallback.                                                                                                           |
| Reddit discovery, including RSS                         | Blocked                                                                                                 | No commercial source agreement established.                                                                                                                                          |
| YouTube discovery and derived editorial metrics         | Blocked even with an API key                                                                            | API purpose, single-project use, privacy/branding, retention and any audited analytics amendment must be established first.                                                          |
| GDELT discovery                                         | Official metadata API; titles, links and source metadata                                                | GDELT attribution and link retained through display, opportunities, drafts and exports. Publisher article bodies are separately controlled.                                          |
| HN / Algolia discovery                                  | Documented API; titles, counts and links; no collected usernames/story bodies                           | Conservative 1,000 requests/hour/process cap versus documented 10,000/IP/hour. Shared IPs/multiple processes require a shared operational quota.                                     |
| Google Trends                                           | Documented `/trending/rss?geo=CC` only; Google attribution                                              | Robots checks on actual reads; Explore is a link, not a scraped endpoint. Search interest is not social engagement.                                                                  |
| Additional RSS / Atom                                   | Paused unless a current operator review covers exact origin/path and RSS use                            | An RSS endpoint is not a general license to analyze or republish its content.                                                                                                        |
| Reference URL enrichment                                | Reviewed metadata access only, including redirects and robots                                           | Entire redirect permission trail is recorded and rechecked for cached reuse.                                                                                                         |
| Supplied text, uploads and assets                       | Local imports remain available; no automatic third-party page retrieval                                 | The supplier must have rights to share/process the material. Public availability does not prove those rights; automated checks cannot certify copyright or remove all personal data. |
| Reference analysis and adaptation                       | Local processing of eligible material; blocked API-origin material cannot be relabeled into eligibility | Immutable restriction/provenance survives edits; old source IDs resolve against actual source policy.                                                                                |
| Audience segments and aggregate signals                 | Declared needs and bounded aggregate observations; no follower/profile scraping                         | Enrolment does not prove creator-following or population representativeness. Aggregate submissions are not unique or representative people.                                          |
| Community questions                                     | Voluntary aggregate counts, not message scraping or participant profiles                                | Keep no individual answers/identifiers; deployment privacy and disclosure obligations remain context-specific.                                                                       |
| Opportunity prioritization and AI reasoning             | Excludes restricted evidence and revoked inputs                                                         | Editorial hypotheses remain hypotheses; success/causality and actual audience fit require evidence.                                                                                  |
| Text AI / custom AI endpoint                            | A key alone cannot transmit content; a reviewed provider origin/path and AI purpose are required        | Review input rights, provider terms, retention, region, processing agreements and subprocessors. `store:false` is not a universal privacy promise.                                   |
| Video/audio analysis with Gemini                        | All current remote/upload video analysis is blocked before file/provider processing                     | Source/media rights and provider processing terms have not been established. Official API support for a URL is not a copyright grant.                                                |
| Draft editing, approval and calendar                    | Local, versioned review; scheduling does not send content automatically                                 | Original content and review remain the company's responsibility; an editorial approval is not legal clearance.                                                                       |
| Markdown/CSV export                                     | Local export with canonical dataset credits                                                             | Export does not grant rights to redistribute source bodies or assets. CSV now has a thirteenth attribution column.                                                                   |
| Publishing webhook                                      | Reviewed HTTPS destination/path required before publication state changes or transmission               | The downstream distributor needs its own authorized platform access and content rights.                                                                                              |
| Interface fonts                                         | Self-hosted original DM Sans / Manrope fonts; no Google Fonts CDN requests                              | OFL 1.1 licenses and notices preserved; see [font licenses](FONT-LICENSES.md).                                                                                                       |
| Manual results / feedback                               | Local aggregate performance input; no hidden social analytics collection                                | Do not upload identifiable audience records. Manually supplied measurements are not independently verified.                                                                          |

Telegram was removed from the product on 2026-10-18: no configuration, channel selection, inbox route or Bot API publishing remains. Startup discards its saved connector credentials and intake cursors; existing pieces and delivery history are preserved. Older review documents describe the implementation at their recorded revision.

Primary-source research, with access/date limits, is in [discovery](DISCOVERY-TERMS.md), [media and AI](MEDIA-AI-TERMS.md), and [imports and publishing](IMPORT-PUBLISH-TERMS.md). The independent [adversarial review](ADVERSARIAL-POLICY-REVIEW.md) records reproduced bypasses and their regression checks.

## Operator permission records

No broad permissive switch exists. `SOURCE_ACCESS_POLICY_FILE` points to an operator-controlled JSON file outside uploaded content. Browser/API clients cannot write its grants. Missing, malformed, expired, future-dated or overlong records deny access. Reviews expire within at most 90 days and match HTTPS origin, path boundary and purpose. Encoded path widening is rejected.

An example file with **no permissions** is committed as [source-access-policy.example.json](source-access-policy.example.json). A real review entry has this structure:

```json
{
  "origin": "https://your-company.example",
  "pathPrefix": "/public-resources",
  "purposes": ["website", "metadata", "rss"],
  "evidenceUrl": "https://your-company.example/permission-or-license",
  "reviewedBy": "Operator responsible for the review",
  "note": "Document the actual permission, permitted collection/reuse and AI-processing conditions.",
  "reviewedAt": "2026-10-18T00:00:00Z",
  "expiresAt": "2026-11-18T00:00:00Z"
}
```

An entry records a review; it cannot manufacture permission. The underlying evidence must cover the actual operation. `ai` and `webhook` are separate purposes for separately reviewed service endpoints. The current restricted social/video providers cannot be reopened by this file, an environment key, a user checkbox or a forged grant. They need a separately reviewed implementation.

Allowed page reads also check `robots.txt`; 404/410 means no robots rules, while denials, inaccessible rules or disallow directives stop the content request. An Allow rule never overrides missing permission. Every redirect has its own public-address and policy checks; cached web/feed content retains the complete permission trail, and revocation prevents subsequent analysis/adaptation.

## Historical data and limits

Known restricted records are excluded from analysis, trends, opportunity evidence, drafting and publication. Public reference readback exposes a citation and restriction notice rather than cached provider bodies/metrics/identifiers. Source readback shows effective permission consistently across state and CRUD endpoints.

Historical storage is preserved, not silently deleted. Disabling collection is **not** a substitute for contractual retention/deletion obligations, particularly YouTube's default API-data rules. Run `node scripts/audit-source-access.mjs DATA_DIRECTORY` for an aggregate read-only inventory. No credentials are decrypted and no content is sent externally. Any real historical restricted data needs a separate provenance/retention review and an authorized cleanup decision; a zero count is not a universal legal certification.

Terms may change or vary by region. Arbitrary supplier rights, all personal data, lawful bases and destination behavior cannot be proven from source code or checkboxes. Re-review before enabling a new provider/purpose and when terms, licenses or permissions change. The gates intentionally preserve uncertainty instead of presenting an unverified connection as approved.
