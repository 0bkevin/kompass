# Discovery source terms review

Reviewed: 2026-10-18 UTC. Scope: the discovery behavior in `server/intelligence.mjs`, `server/social-providers.mjs`, and source defaults/validation in `server/core.mjs`, before remediation in this review. No credentials, paid Actor runs, or actual scraping jobs were used. This report distinguishes contractual permission from statutory legality; it does not establish legality in every jurisdiction.

## Findings and required disposition

| Source / feature      | Observed implementation before remediation                                                                   | Contractual disposition for this project                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram via Apify   | `apify/instagram-scraper`, Reels from profile, Reel URL or hashtag; token plus enabled flag allows execution | Block network collection. No express Meta permission has been established. Owning the account does not supply that permission.                 |
| TikTok via Apify      | `clockworks/tiktok-scraper`, profile/hashtag/video/search; media download options disabled                   | Block network collection. No TikTok-approved access arrangement has been established.                                                          |
| Apify service itself  | Official API, bearer token, bounded Actor input and budget reservation                                       | Buying access to Apify does not authorize collection from its target sites. Review both service/Actor terms and target permissions.            |
| LinkedIn references   | No dedicated discovery connector found in these modules                                                      | Keep URLs as links; do not make generic page/RSS paths into an alternative scraper.                                                            |
| Reddit                | Public `.rss`, not authenticated API or JSON                                                                 | Block collection pending the required source agreement/permission; availability of RSS does not establish a commercial reuse license.          |
| Google Trends         | Official `/trending/rss?geo=…`; default enabled                                                              | Keep documented RSS with Google attribution, bounded polling and applicable machine-readable instructions. Do not fetch Explore pages.         |
| Hacker News / Algolia | Official documented search API, two requests per discovery run                                               | Keep bounded official API access; respect its IP quota. Drop individual author identifiers to meet the challenge's stricter data rule.         |
| GDELT                 | Official DOC API, titles/URLs/domain/language/country/first-seen metadata, no article body                   | Keep dataset access with a visible GDELT citation and link, including exports. This does not license publisher article bodies.                 |
| Other RSS / Atom      | Arbitrary user-supplied public feed URL                                                                      | Require a source-specific approved basis. RSS availability alone is not a blanket license for retention, commercial analysis or republication. |

## Instagram / Meta

Instagram's terms prohibit automated access or collection without Meta's express permission, including while logged in. A separate ownership provision preserves users' content rights; it does not waive the automated access condition. The primary evidence available in this review is **Meta's own January 1, 2026 filing**, Appendix B, printed page 19 (PDF index 18), containing these provisions. This is a filed snapshot, not a guarantee that no later regional amendment exists. The live terms must be rechecked before a future approved integration. [Meta's filed terms](https://ag.ny.gov/sites/default/files/social-media-policy-report/2025-q3-meta-platforms-inc-policy.pdf#page=19), [live Instagram terms](https://help.instagram.com/581066165581870).

The Actor listing says it collects public Instagram data and acknowledges that public data may still be personal data. That is the scraper vendor's description, not evidence of Meta permission. The app's `addParentData: true` request and mapped author/media fields also exceed a simple aggregate-only sensor. [Instagram Actor description](https://apify.com/apify/instagram-scraper).

**Gate:** reject the Instagram Actor before budget reservation or network calls, regardless of stored/environment token or source enablement. Do not use account ownership, a user checkbox, public availability, or an Apify payment as a substitute for permission. A future official integration needs its own approved scopes and permitted data handling; it must not silently fall back to scraping.

## TikTok / Clockworks

The indexed official US terms, last updated November 2023, section 5, prohibit automated scripts for collecting information or otherwise interacting with the service and prohibit circumventing access restrictions. The live page could not be fully opened by the research tool; these findings rely on the official domain's indexed text, not an independently fetched current regional contract. The exact regional terms remain an uncertainty, not a permission grant. [TikTok US terms](https://www.tiktok.com/legal/page/us/terms-of-service/en?region=us).

Clockworks' listing says the scraper handles public data and warns that output may contain personal data. It does not present a TikTok permission grant for our use. Disabling video downloads does not resolve automated collection or reuse restrictions. [Clockworks Actor description](https://apify.com/clockworks/tiktok-scraper).

**Gate:** reject the TikTok Actor before any provider run. Linking to TikTok is separate from ingesting its page, video file or identifiers. Review the applicable official developer arrangement before implementing an alternative connector.

## Apify service and Actor terms

The July 9, 2026 general terms, sections 5.4, 5.8 and 6.2, leave third-party permissions and data authorization with the customer. Section 11.1 addresses claims arising from unauthorized source extraction. Consequently, neither an API token nor an Actor purchase proves that a target site permits our operation. [Apify general terms](https://docs.apify.com/legal/general-terms-and-conditions).

The Actor terms require legitimate use under the agreement and applicable Creator terms. Community Actors involve separate Creator access to inputs/outputs, are not vetted for legal compliance, and require customer due diligence. A Store badge is not a source permission grant. [Apify Actor terms](https://docs.apify.com/legal/actor-terms-and-conditions).

**Gate:** preserve credential storage/budget controls if useful for a future separately approved use, but mark the current Instagram/TikTok adapters unavailable rather than merely unconfigured. A generic “approved source” user attestation must not reopen a platform block. Do not contact Apify/Creators or send them company information during this review.

## LinkedIn

The current user agreement applies to both members and visitors. Section 8.2 prohibits software scraping/copying, bypassing controls, and unconsented use/distribution of content obtained directly or through intermediaries. Separate written permission can alter those conditions. A public post is not an exception to that automation rule. [LinkedIn user agreement](https://www.linkedin.com/legal/user-agreement).

**Gate:** keep the present link-based workflow. Restrict generic network inspection and feeds from fetching LinkedIn content, including redirects to it. Content supplied directly by the company from its original materials is a different input, subject to the company's rights and our privacy rules. Do not claim an official LinkedIn connection or permission for arbitrary competitor analysis.

## Reddit

The code's Reddit branch converts a supplied subreddit URL to `.rss` and defaults to `r/artificial/.rss`; it is not an authenticated Reddit API integration. The current user agreement prohibits scraping without prior written consent, with a distinct conditional allowance for crawling under `robots.txt`. That allowance cannot be treated as a commercial data license. [Reddit user agreement](https://redditinc.com/policies/user-agreement).

The Data API terms, revised July 20, 2026, expressly apply to materials accessed from the services whether through APIs or not. Section 3.1 requires a separate agreement for commercial use; restrictions also apply to earning revenue from API access/use without express written approval. [Reddit Data API terms](https://redditinc.com/policies/data-api-terms).

**Gate:** reject the Reddit connector and `reddit.com`/subdomain feeds in generic RSS/network paths until an appropriate documented arrangement is implemented. Do not substitute public RSS, JSON endpoints, proxies or a third-party scraper. Keep existing links without fetching them. Previously retained content needs provenance review; blocking future calls does not retroactively license it.

## Google Trends

Google explicitly documents RSS as a Trending Now export format. Its reuse documentation permits using Trends information subject to Google terms and requires a Google citation. Trends measures aggregated search interest, not Instagram/LinkedIn engagement or identifiable consumer preference. [RSS export documentation](https://support.google.com/trends/answer/3076011?hl=en), [reuse and citation](https://support.google.com/trends/answer/4365538?hl=en).

Google's terms prohibit automated access that violates machine-readable instructions and bypassing protective measures. [Google terms](https://policies.google.com/terms). A direct GET of [Trends robots.txt](https://trends.google.com/robots.txt) returned HTTP 200 during this review: `User-agent: *` disallows `/explore?` and `/trends/explore?`; `/trending/rss` was not disallowed. This is an observation on the review date, not an indefinite permission guarantee.

**Gate:** allow the documented RSS path only for the Google Trends connector, retain “Data source: Google Trends” with a link in displayed/exported evidence, bound polling, and stop on blocks/denials. The app may link to Explore without fetching it. A current robots/terms change requires re-review; do not fall back to scraping hidden endpoints.

## Hacker News / Algolia

Algolia's HN documentation expressly exposes a REST API for programmatic HN data access and specifies 10,000 requests per IP per hour. The implementation makes two search requests per run, but a per-run bound alone does not enforce a deployment-wide hourly limit. [Official HN Search API documentation](https://hn.algolia.com/api).

The inspected documentation is not a comprehensive copyright license for republishing HN story/comment text or linked publisher articles. Use factual metadata and source links conservatively; do not infer that the API grants all downstream rights. The current parser maps `author` usernames, which conflicts with this challenge's stricter no-personal-data objective even when publicly visible.

**Gate:** use this documented endpoint with deployment-level throttling/backoff and clear HN/Algolia provenance; drop personal author identifiers, avoid full story-text retention unless rights have been established, and do not automatically fetch linked sites under the HN permission basis.

## GDELT

GDELT explicitly allows free academic, commercial and governmental use of its released datasets, including redistribution. Any use or redistribution must cite GDELT and link to its website. [GDELT terms of use](https://gdeltproject.org/about.html#termsofuse).

The implementation's DOC API metadata query is consistent with dataset access, but the data must remain attributed to GDELT as well as the original article publisher. A license to GDELT's dataset does not establish permission to download or redistribute each publisher's full article or images.

**Gate:** retain explicit provider name and canonical provider URL in evidence, with UI/export citation; keep article URLs link-only unless independently approved. Preserve error/backoff behavior instead of retrying around a 429 denial.

## Cross-source enforcement recommendations

1. Enforce source policy on the server before network calls, not only in disabled UI controls. Check initial and redirect destinations so feeds/onboarding/video inspection cannot reopen blocked platforms.
2. Keep access authorization separate from content reuse rights, privacy permissions and AI-processing permission. Each may differ for the same publicly accessible item.
3. For configurable publisher feeds or company sites, store the actual reviewed license/permission basis, reviewed hostname/path and allowed operations. A checkbox is a representation by the user; it does not prove platform approval.
4. Record provider attribution independently from content/publisher links. Carry it through trend explanations, drafts, exports and any third-party processing.
5. Keep identifiers and media URLs out of aggregate audience evidence unless the approved operation truly needs them. Private data, credentials/cookies, login bypass and individual audience profiling remain outside the challenge scope.
6. Report blocked/unreviewed sources clearly. Never present a successful mocked Actor response as proof of source permission, live coverage or contractual compliance.

These recommendations concern the inspected implementation and primary sources reviewed on the stated date. Product gates reduce known contractual risk; they cannot certify every user-supplied text, future source policy, country-specific legal requirement or past imported record.

## Attribution and data-minimization remediation

Following the review, provider attribution metadata was added independently of user-editable source names. Known providers resolve to canonical citation URLs. Credits follow duplicate evidence, opportunity evidence and draft snapshots; reference, radar, opportunity and Studio views display citation links. Markdown and calendar CSV exports retain provider credits, including when a source reference later becomes unavailable. The calendar CSV now includes a thirteenth column, `Fuente de los datos`.

HN collection now retains titles, factual counts and links rather than story bodies or author usernames. Feed author fields are omitted. An exact match to the previous HN body normalizer is cleared on refresh; manually changed editorial notes are preserved. Remote social thumbnail images are no longer loaded in reference cards/details; company-uploaded attachment images remain available.

`tests/compliance-attribution.test.mjs` covers official source provenance, arbitrary attribution URL rejection, merged/legacy evidence, draft snapshots and opportunity citation propagation. Updated discovery-2 tests still verify title entity decoding while checking that body and author identifiers are omitted. These are simulated transport and local integration checks; they do not establish platform authorization or universal personal-data removal. Other source policy gates are implemented and verified separately by the main review.
