# Actual 30X source verification

Checked on 2026-10-18. This records public source identification and observed access boundaries, not a legal opinion or a permission grant. No account, student, follower, comment, contact or customer records were collected.

## Company identity and public facts

The current public business site is [30x.com](https://30x.com/). It presents executive education in Latin America, aimed at founders and executive leaders, with sales, growth and applied AI among its subjects. Its [program catalogue](https://30x.com/programas) lists **Sales Machine** and **AI for Executives**. These are statements about the company's positioning and offerings; they do not establish who actually consumes its social content.

The visible homepage footer links to [Instagram @crece30x](https://www.instagram.com/crece30x/). The company's own [LinkedIn profile](https://www.linkedin.com/company/crece30x) independently links the same brand to 30x.com, and an [official 30X post](https://es.linkedin.com/posts/crece30x_conectar-30x-es-rodearte-de-fundadores-l%C3%ADderes-activity-7389428639492251648-XXmf) points readers to @crece30x. The test should retain that Instagram address as a source link.

The homepage has inconsistent machine metadata: its JSON-LD `sameAs` uses `https://www.instagram.com/30x.com_/`, while the actual visible footer uses @crece30x. Its HTML canonical tag also points at `https://framer.30x.com/`. The observed public URL and visible business crosslinks are the selected test inputs; the metadata does not justify silently replacing them. [30x.org](https://www.30x.org/) also responds, but is a separate executive-immersion site rather than the selected current catalogue.

## Website reading and reuse

[robots.txt](https://30x.com/robots.txt) returned HTTP 200. Its general rule allows crawling, with excluded checkout, onboarding, internal control, proposals and access paths. It separately allowlists several search and AI agents. That answers the crawling question for the public homepage; it does not grant copyright or commercial reuse rights.

[30X terms, version 1.9 dated 2026-08-01](https://30x.com/legal/terminos-y-condiciones) §7.1 reserves ownership and restricts reproduction, distribution, modification and commercial use of site materials. §6.2 makes information shared during programmes confidential. The [privacy policy](https://30x.com/legal/politica-de-privacidad), version 1.5 of the same date, describes personal/professional information and social connections as personal-data processing; it does not authorize this application to acquire those records.

**Result for this deployment:** no new website/metadata access grant was created. The existing `server/access-policy.mjs` continues to deny automated 30x.com company-content ingestion without an operator-reviewed grant. No copied course materials, website body, images, testimonials or videos should be sent to Gemini. The companion JSON contains independently phrased, short public facts and provenance for transparent public test input, rather than a downloaded source corpus. This is not a claim that the terms permit arbitrary commercial AI reuse.

## Instagram access result

Opening the official account in the native collaborative browser's incognito profile immediately redirected to Instagram's `/accounts/login/` route. The session stopped there. No login, bypass, scraper, API actor, post content or metrics were used. Browser evidence: [login gate](evidence/sources/instagram-login-gate.png).

Current official Instagram terms could not be retrieved in this environment: the [Help Center terms URL](https://help.instagram.com/581066165581870) returned HTTP 429, and the [Meta automated collection terms](https://www.facebook.com/legal/automated_data_collection_terms) redirected to a temporarily blocked login screen. Those responses are not represented as a verified current terms text. Meta's primary [scraping explanation](https://about.fb.com/news/2021/04/how-we-combat-scraping/) and [Instagram/Facebook enforcement account](https://about.fb.com/news/2022/07/actions-against-scraping-for-hire/) describe its permission requirement and action against unauthorized collection; both are dated background, not a replacement for reviewing current contractual terms.

**Expected platform behavior:** preserve the verified Instagram source address, clearly report that automatic reading is unavailable, and continue using independently entered factual company context plus permitted discovery sources. A passing journey cannot be described as live Instagram ingestion, audience measurement, or Instagram trend validation.

## Safe factual test input

Use `sources.json` for the original Spanish summary and fact-level URLs. Audiences derived from those facts remain hypotheses for user confirmation. Sector subdivisions such as EdTech or HealthTech, actual interests, purchase intent, follower overlap and student representativeness have no evidence in this source check.
