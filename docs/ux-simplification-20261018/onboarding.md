# Company onboarding UX verification

Date: 2026-10-18. Scope: `CompanySetup.tsx` and `company-setup.css`.

The initial native-browser inspection reproduced two points of friction: typing a website collapsed the description field, and an unread website advanced to a mostly empty review form while the access explanation remained hidden. The description is now visible throughout entry. Optional social links stay in a disclosure, and unread URL-only attempts recover on the first step with a clear description prompt. An identical unsuccessful input cannot be submitted again until it changes. Company review keeps the four core fields visible; existing market and voice defaults remain editable in an optional disclosure.

The production integration build was verified in one final desktop/mobile pass using a credential-free isolated host at `127.0.0.91:5511`. The QA account and audience are test actors. The company context is an original paraphrase of previously verified public 30X facts, supplied manually after the blocked URL attempt. No AI credential or provider request was used by this onboarding test.

| User action                                                                 | Expected and observed result                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type `https://30x.com/` at 1280 × 800                                       | Description stays visible; social links remain optional.                                                                                                                                       |
| Prepare with URL only                                                       | One inspection request, HTTP 200; recovery stays on step 1 and focuses description. The URL is accurately treated as unread.                                                                   |
| Leave failed input unchanged                                                | Submit is disabled; no automatic or identical retry occurs.                                                                                                                                    |
| Switch to 390 × 844                                                         | Recovery and description remain available; document width equals viewport width.                                                                                                               |
| Supply public company description and `https://www.instagram.com/crece30x/` | Second inspection succeeds; company name, education sector, description and three relevant content topics are populated for review.                                                            |
| Review the company                                                          | Four core fields are visible. Market and voice defaults stay behind the optional disclosure.                                                                                                   |
| Confirm a declared audience and open the workspace                          | Brand creation and context commit each return HTTP 201; the workspace opens with a clear discovery action.                                                                                     |
| Read saved company context                                                  | Website and Instagram remain `linked`, the supplied description is `provided`, and audience claims remain editorial hypotheses. No social posts, followers or consumption data are fabricated. |

`npx tsc -b --pretty false` passed. The Impeccable detector ran once; its findings were advisory palette/type entries already used by this incumbent surface, with no blocking finding. The parent integration build and full suite passed before the browser confirmation.

Harness notes: a diagnostic `GET /api/brands` used an unavailable read route and returned 404; it was replaced with `/api/session` plus the company state route. This was not an application interaction or product failure. The browser tool initially appended into prefilled audience fields; the QA profile was corrected through its normal edit form using explicit replacement. The saved evidence records the corrected profile. No recruited human usability study, completion-rate measurement, live audience data or production conversion result is claimed.

Machine-readable observations: [onboarding.json](onboarding.json).
