# Official social discovery and automatic public counters

Reviewed on 2026-10-18. Implementation: `server/social-sync.mjs`; regression coverage: `tests/social-sync.test.mjs`.

## What is implemented

The platform has an official YouTube Data API connector for recent public videos and automatic refresh of raw public video counters. It uses either a platform-managed `YOUTUBE_DATA_API_KEY` or a separately consented read-only YouTube OAuth connection. Signing into kompass with Google does not connect a YouTube channel.

The catalogue displays public titles, publication dates, links and the counters returned by YouTube. It requests at most 25 recent videos, with 12 as the default. The search covers the last seven days and uses YouTube's publication-date ordering. An identical search uses a 15-minute cache; a different topic can be searched immediately within the deployment's daily budget.

An editor can select an approved, scheduled or published YouTube piece and paste a video URL. This records a user-provided association without entering manual views, interactions or leads. Linking does not change the piece's status, prove channel ownership, publish anything or claim the video exists. A subsequent refresh asks YouTube for the actual public counters. An unavailable/deleted/private video produces a visible error and removes its stale snapshot.

Snapshots contain only native `views`, `likes` and `comments`, their observation time and `YouTube Data API` attribution. Omitted counters are `null`, displayed as unavailable. Leads are unknown. Refresh replaces the cumulative snapshot; it never adds one cumulative total to another. Manual outcomes and piece metrics remain intact.

The scheduler refreshes configured queries and linked piece counters hourly while the application is running. It checks due work once per minute, processes up to 25 companies per pass and batches up to 50 video-linked pieces per company. When a company has more linked pieces, older observations are refreshed first. A stopped local application does not run background jobs.

## Source and purpose boundaries

This module deliberately uses a separate catalogue and metric store. It does not enable legacy YouTube scraping, download videos, feed API data to AI generation, create opportunity scores, calculate engagement rates, or claim growing trends from cumulative counters. The existing `YOUTUBE_API_KEY` path stays blocked under the legacy policy. Only the explicit `YOUTUBE_DATA_API_KEY` managed read-only connector is enabled by the new key.

YouTube's API exposes public search and video statistics through documented endpoints. Analytics reports concern authorized channels; they are a different product and are not claimed here. Sources: [Search: list](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [Videos: list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [Analytics reports](https://developers.google.com/youtube/analytics/reference/reports/query).

YouTube restricts derived data/metrics and requires retention controls and revocation handling. The current policy includes a separate exception path for audited developers; this deployment has not obtained that permission. The connector therefore keeps raw counters outside editorial learning. Cached API data expires at 30 days; owner-requested disconnection purges it immediately, attempts Google token revocation and pauses further queries. Failed revocation is disclosed with a Google permissions link. Source: [Developer Policies, III.E.4 and III.L](https://developers.google.com/youtube/terms/developer-policies).

No follower lists, comments, demographic reports, student records, audience identities or contact details are requested. Public video metadata is not treated as an observation of who consumes 30X's content. A public URL or the user's own Google account does not establish ownership of 30X's social accounts.

## Connection requirements

Public discovery/counters require an actual Google Cloud API key with YouTube Data API enabled. Configure it privately as `YOUTUBE_DATA_API_KEY`; keep provider credentials out of browser requests and frontend bundles. Apply an API restriction for YouTube Data API in Google Cloud. This connector uses the standard Google API-key header, not a customer-entered credential field.

Connecting a channel additionally requires the app's Google OAuth client and an explicitly registered `GOOGLE_YOUTUBE_REDIRECT_URI`, for example `http://localhost:3026/api/social/youtube/callback`. The connector requests only `https://www.googleapis.com/auth/youtube.readonly`, with PKCE, random state and a separate short-lived browser transaction cookie. Transactions are bound to the initiating user, session and company owner role. Codes are single-use. Token and verifier values are encrypted using the existing server credential store. Source: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

If Google authorizes the account but returns no channel, the callback reports `no_channel`. Missing read permission reports `missing_scope`. Malformed responses and other failures remain generic; provider diagnostics, codes and tokens never enter the redirect. An account without a channel does not disable the separately configured public catalogue/counters.

An expired connection refreshes its token and revalidates the connected channel metadata. Revoked refresh authorization removes its credentials and cached API data. Disconnection and changes of connection state invalidate in-flight work; a late response cannot resurrect deleted data. A changed piece version invalidates its explicit video association. Unlinking stops that piece's automatic counters, including fallback from an older manual publication URL.

The implementation enforces conservative deployment-wide budgets of 70 searches and 1,000 other Data API calls per UTC day. These are application ceilings, not a promise about the project's actual Google quota. Provider errors never produce fabricated successful results. The operator must inspect the project's actual quota before increasing the ceilings.

## Other networks

| Network   | State in this delivery                | Actual prerequisite                                                                                                               |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Instagram | Unavailable, with a clear explanation | An approved Meta application and authorization of an eligible professional account; a profile URL does not grant insights access. |
| LinkedIn  | Unavailable, with a clear explanation | Community Management API access and authorization for the company page.                                                           |
| TikTok    | Unavailable, with a clear explanation | An approved application and the creator's consent for Display API. No commercial access is inferred from Research API.            |

Meta's official collection demonstrates the Facebook Login path through pages the user manages and their linked Instagram business account. Its existence does not establish that this deployment has an approved Meta application or access to 30X's account. Sources: [Meta's official API workspace](https://www.postman.com/meta/), [Managed-page access tokens](https://www.postman.com/meta/instagram/request/0vuw3vk/get-access-tokens-of-pages-you-manage). The direct Meta Insights documentation returned an internal error during this review, so no claim about a currently granted insights scope was inferred from it.

LinkedIn describes company-page management/analytics and requires product access and applicable authorizations. Source: [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview), [Access and migration](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide?view=li-lms-2026-09).

TikTok's Display API supports a consenting creator's public videos. Its `video.list` permission is not a general search authorization; Research API is a separate access program. Sources: [Display API overview](https://developers.tiktok.com/docs/en/display-api-overview), [Video object and counters](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object), [Research query requirements](https://developers.tiktok.com/docs/en/research-api-specs-query-videos).

## Routes and validation

All company routes require authenticated membership. Discovery, refresh and video association require an owner or editor. Connection, disconnection and reactivation require the owner.

| Route under `/api`                                        | Behavior                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /brands/:brandId/social/connections`                 | Honest provider readiness, optional connected channel, automatic refresh cadence. Never returns tokens.           |
| `GET /brands/:brandId/social/discover`                    | Returns the most recent non-expired catalogue; does not make an external request.                                 |
| `POST /brands/:brandId/social/discover`                   | Accepts `{query?, limit?}`; fetches official recent public videos and counters.                                   |
| `GET /brands/:brandId/social/metrics`                     | Returns raw snapshots and explicit user-provided publication links.                                               |
| `POST /brands/:brandId/social/publications`               | Accepts `{pieceId, publishedUrl}`; validates the current approved YouTube piece and records only its association. |
| `DELETE /brands/:brandId/social/publications/:pieceId`    | Removes the association and snapshot; prevents automatic fallback resynchronization.                              |
| `POST /brands/:brandId/social/sync`                       | Refreshes linked public video counters for the company.                                                           |
| `POST /brands/:brandId/pieces/:pieceId/metrics/sync`      | Refreshes a single eligible piece; never accepts a foreign-company piece.                                         |
| `GET /brands/:brandId/social/youtube/authorize`           | Starts separate read-only channel consent.                                                                        |
| `GET /social/youtube/callback`                            | Consumes a valid owner/session/browser-bound transaction and verifies the channel.                                |
| `DELETE /brands/:brandId/social/connections/youtube`      | Pauses access, deletes local data and attempts revocation.                                                        |
| `POST /brands/:brandId/social/connections/youtube/public` | Owner explicitly resumes the configured public connector after a pause.                                           |

The connector accepts only canonical HTTPS YouTube video links, rejects other domains/ports and never fetches a user-provided URL. Outbound calls use fixed Google endpoints, reject redirects, have timeouts and limit response size. Credentials never enter API-key query strings, public responses or provider error messages.

## Verification in this delegated implementation

Twenty-one new tests exercise real Express routes and SQLite storage with explicitly synthetic external transports. Together with the existing compliance and social-provider suites, 53 tests pass. Coverage includes permissions and company isolation; raw/unknown counter semantics; cumulative overwrite; preservation of manual outcomes; missing/deleted videos; approval/link changes; disconnect races; OAuth least scope, PKCE, session binding and replay rejection; token refresh/revocation; expiry; scheduler behavior; and unchanged legacy restrictions. A pending counter request cannot attach its result to content that changed and was reapproved during the request. Channel diagnostics distinguish actual empty results from malformed provider responses without falsely reporting a connected account.

Command: `node --test --test-timeout=20000 tests/social-sync.test.mjs tests/compliance-policy-adversarial.test.mjs tests/social.test.mjs tests/social-core.test.mjs`.

These fixture tests do not establish that a live Google project/key, 30X channel authorization, Meta application or other network approval exists. Live setup and browser evidence belong in the parent delivery's integration report after those steps are performed.
