# Google sign-in: configured and verified locally

Google sign-in is enabled at **http://localhost:3026**. The requested account completed a real Google authorization, reached the existing company setup screen, signed out, and signed in again as the same application user. No sample company was created in that account.

## Cloud configuration

- Project: [`radar-auth-20261018-kevin`](https://console.cloud.google.com/auth/clients?project=radar-auth-20261018-kevin), named **30X Radar Google Sign-In**.
- OAuth consent brand: **30X Radar**; audience **External**, publishing status **Testing**, with the requested account added as a test user. This remains a localhost setup, as requested.
- OAuth client: **30X Radar Web**, application type **Web application**. The AI-agent client option was left off because this client authenticates people entering the platform.
- Only `openid`, `email` and `profile` are requested and recorded as non-sensitive scopes. Gmail, Drive and Calendar access are not requested.
- Authorized callbacks: `http://localhost:3026/api/auth/google/callback`, `http://127.0.0.1:3026/api/auth/google/callback`, and the equivalent two addresses on port5450.

The generated credentials were downloaded from the Console and installed in the ignored local `.env` with file mode0600. No secret, token, authorization code or private account identifier is included in this report or Git. `PORT=3026` and the main localhost callback are configured there; the secondary preview overrides its callback to localhost5450 when started.

The main sign-in button is operational without entering credentials into the product. Additional Google accounts used during testing must first be added to the project's test-user list. A public deployment and OAuth production release were not requested or performed.

## Authentication behavior

The server implements authorization code flow with PKCE S256, random state and nonce, a short-lived HttpOnly browser-bound transaction and single-use consumption before token exchange. Signed Google ID tokens are checked for issuer, audience, expiry, nonce and verified email. Google subjects identify returning accounts; matching email alone never silently links a local account. Existing local users confirm their password before explicitly connecting Google. Successful authentication rotates the application session.

The callback origin is explicit configuration. Starting from the alternate loopback hostname redirects to the configured localhost origin before any OAuth cookie is issued. Password-confirmed linking rejects a mismatched origin instead of creating an unusable transaction. Production HTTPS configurations issue Secure cookies, including behind a proxy.

The interface preserves email/password and demo access if Google is unconfigured or its availability endpoint fails. It shows actionable cancellation/failure/linking messages, preserves invitations, prevents duplicate submissions and rejects inherited object keys such as `authError=__proto__`. The button uses Google's official mark and locally hosted Google Sans with its included OFL license.

## Verification

| Check                                   | Result                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| First real Google sign-in               | Requested account authenticated; no callback error; company setup opened; zero companies fabricated                                               |
| Sign-out and repeat real Google sign-in | Authenticated as the same user; no duplicate account; company setup retained                                                                      |
| Canonical localhost redirect            | Alternate loopback start returned303 to the configured origin without issuing a cookie                                                            |
| Desktop and mobile                      | Operational Google button; mobile342×44px at390px; no horizontal document overflow                                                                |
| Independent security review             | Signed token checks, state/browser binding, duplicate parameters, replay prevention, session rotation and exact-session password linking reviewed |
| Full automated suite                    | **478 passed**, zero failed/skipped/cancelled; includes26 new OAuth tests using real locally signed RS256 tokens and simulated token transport    |
| Build and formatting                    | Production build/TypeScript and changed-source Prettier checks passed                                                                             |

The account owner approved Google's phone verification. That human check was required by Google and was not bypassed. The two real sign-ins used Google's actual authorization and token endpoints; the automated tests use isolated fixtures and do not substitute for that live verification. During the explicit sign-out/reload, the browser recorded one aborted response body after the logout endpoint had returned200; sign-out and the following unauthenticated screen were verified.

Evidence: [live results](evidence/live-login.json), [11 isolated UI checks](evidence/ui-behavior.json), [desktop](evidence/login-desktop.png), [mobile](evidence/login-mobile.png), [full test output](evidence/tests.txt), [build](evidence/build.txt), [formatting](evidence/format.txt).

Official references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [branding guidance](https://developers.google.com/identity/branding-guidelines), [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
