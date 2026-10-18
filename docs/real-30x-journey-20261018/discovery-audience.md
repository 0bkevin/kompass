# Real 30X audience, discovery and opportunities journey

Verified 2026-10-18 with the native collaborative browser, real public discovery services and the configured free Gemini text provider. This was an independent product test using actual public 30X business facts, not a study involving real audience participants. The isolated local test company was named **30X — Discovery QA**, with a disposable local login; the user's Google account and main localhost workspace were not modified.

## Inputs and boundaries

The website was [30x.com](https://30x.com/) and the Instagram link was [@crece30x](https://www.instagram.com/crece30x/), confirmed by the official website's visible footer. Source verification is recorded in [sources.json](sources.json). A short original factual summary described 30X's executive education, sales, growth and strategic AI offerings. No copied website body, private strategy, follower data or personal audience records were supplied to Gemini.

Both URLs remained **linked, unread** inside the app. The website lacked the required access/reuse review, while Instagram is link-only in this deployment. Saving the URLs did not import Instagram posts, metrics or consumers. The user could continue by supplying the original public-fact paraphrase. This is a material limitation of the URL-only workflow, even though its displayed status is accurate.

## Interactive checks

| Workflow                      | Observed result                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company entry                 | Entered the actual website and Instagram link, opened the optional input disclosure, and supplied the public-fact paraphrase. Context review showed two unread links and one team-supplied text with provenance warnings. The proposed company/topics were editable before saving.                                                                  |
| Audience definition           | Corrected the initial sales-oriented proposal to a declared hypothesis for directivos and team leaders applying IA. Added a second hypothesis for founders and commercial teams through the audience modal. Both persisted after reload without implying actual consumer identification.                                                            |
| Public observation            | Saved an observation that the public catalogue offers executive AI education, with the exact `https://30x.com/programas` citation and one reviewed page. The note explicitly distinguished an offer from demonstrated audience demand. The rendered evidence link retained the exact URL.                                                           |
| Editorial hypothesis          | Saved a sales/IA-follow-up proposal for the commercial group without a source URL or measured sample. Its card was visibly **Hipótesis del equipo**, separate from the public observation. No community responses were manufactured.                                                                                                                |
| Automatic discovery           | Home started one real provider batch after onboarding: GDELT returned 40 items, HN 40 and Trends 10. Deduplication left **81 distinct references**. All three sources succeeded in this run. No scraping provider, DNS mock or fake response was used.                                                                                              |
| Relevance filters             | Radar identified 41 lexical context matches. Searching **World Bank** showed two results; saving the selected result and choosing **Guardados** showed exactly one. Opportunities showed one audience-related IA group by default; explicitly including unrelated signals expanded the list to 40.                                                  |
| Growth interpretation         | The first batch produced zero emerging references. The emerging tab explained the need for separate observations with growing metrics. The opportunity said **Sin historial suficiente**, requiring comparable weekly windows before a growth claim.                                                                                                |
| Reference evidence            | The GDELT modal exposed the exact article link, GDELT credit, metadata-only limitation, missing verified publication date, provider detection time, absent engagement metrics and insufficient history. It did not present feed presence as popularity.                                                                                             |
| Semantic opportunity analysis | One real Gemini request returned a need, practical hypothetical pilot proposal, known directivos segment, one literal source-title citation and concrete evidence limits. The source was a public metadata record, not a read article body. No unsupported implementation or success claim appeared.                                                |
| Reference analysis            | A second real Gemini request completed and persisted. It returned a contextual IA/leadership adaptation, low-confidence hypothesis, relevance 55/100 and repetition bounded to the local 81-reference corpus. It did not claim global saturation or a measured consumer preference.                                                                 |
| Persistence and freshness     | Reload retained both profiles, two signals and the saved reference with its AI analysis. All three source timestamps stayed unchanged; reload did not issue another provider batch. Saving the reference changed its semantic fingerprint, so the earlier opportunity analysis became stale and was hidden while its stored record remained intact. |
| Responsive behavior           | Inspected desktop 1280×800 and emulated CSS viewport 390×844. Audience, reference detail, filters and opportunity layouts stayed within a 390-pixel document; reference modal width was 370. Native clicks and form controls worked. This was not a physical-device or synthesized-touch test.                                                      |
| Diagnostics                   | Final snapshot had no console entries or failed browser requests. One collaborative-browser wait disconnected after the model request had completed; status/evaluation recovery confirmed success without issuing a duplicate AI request. Locator timeouts during initial automation setup were corrected and excluded from product defects.        |

No confirmed functional defect in this scope required a source change. Two real AI requests were used. The isolated server's periodic scheduler was disabled; onboarding performed the only discovery batch. No public questions were distributed, no votes were submitted, and no messages or external publications were sent. The isolated server and its tab were stopped/closed after evidence collection.

## Quality limits

The context and opportunity filters are editorial aids. Broad lexical IA groups include geopolitical, research and business headlines, so a human still needs to assess topic and regional fit. The default Trends feed explicitly covers the United States; HN/GDELT metadata is not a representative sample of Latin American social audiences. The live AI result connected the declared leadership need to a small-AI headline and clearly framed its pilot as hypothetical, which is a useful proposed angle, not validated audience demand.

This test cannot establish ten growing LinkedIn topics, causal explanations of social performance, Instagram analytics, real consumer preferences or conversion lift. Those were not observed. GDELT's success is a finite live observation and does not erase earlier rate-limit incidents or guarantee future availability.

## Evidence

- [Machine-readable assertions and public AI output](discovery-audience.json).
- [Context provenance](evidence/discovery-audience/01-link-only-and-supplied-paraphrase.png).
- [Semantic analysis and limits](evidence/discovery-audience/02-semantic-analysis-and-limits.png).
- [Reference analysis on desktop](evidence/discovery-audience/03-reference-analysis-desktop.png).
- [Reference detail on mobile](evidence/discovery-audience/04-reference-detail-mobile.png).
- [Audience signals on mobile](evidence/discovery-audience/05-audience-signals-mobile.png).
- [Opportunity layout on mobile](evidence/discovery-audience/06-opportunity-mobile.png).
