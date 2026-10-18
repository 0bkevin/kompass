| Before | After | Why |
| --- | --- | --- |
| The earlier fine-pointer `.lp-button:active` rule applied scale motion to keyboard presses. | **Resolved.** That rule is removed. `src/landing.css:1353` disables transitions for visible keyboard focus, and `:1356` gates scale feedback with `:active:not(:focus-visible)`. | Keyboard activation now receives immediate feedback without the duplicate selector overriding the guard. |
| Panel WAAPI motion cancelled and restarted from fixed opacity/translation values on every tab switch. | **Resolved.** `src/features/landing/LandingPage.tsx:195` now updates state immediately; the panel animation and its refs are removed. The pointer indicator retains CSS transitions at `src/landing.css:1348`. | Rapid changes no longer restart panel motion. The remaining indicator transition can retarget continuously. |
| CTA press and release both used 160ms. | **Resolved.** `src/landing.css:156` returns in 100ms; `:1358` uses 160ms for the pointer press. | Deliberate press and faster response now have asymmetric timing within the standards' 100–160ms button budget. |
| Reduced motion was sampled only at tab activation, leaving running WAAPI motion unaffected by live preference changes. | **Resolved.** Panel WAAPI is removed at `src/features/landing/LandingPage.tsx:195`. The live CSS media query at `src/landing.css:1368` disables movement/transitions and the spinner. | There is no running JavaScript animation left to cancel; the browser applies the reduced-motion branch when the preference changes. |

**Feel-breaking regressions:** the keyboard press regression is resolved.

**Interruptibility & timing:** immediate panel changes remove restart jumps, the CSS indicator remains interruptible, and CTA press/release durations are asymmetric.

**Accessibility:** removing WAAPI resolves live reduced-motion cancellation. CSS retains control of the remaining motion.

This follow-up rechecked only the four original findings. All four are resolved; none is partial or unresolved. The original passing assessment of the aperture entrance, compositor-friendly properties, hover gating, immediate focus feedback, and status text remains unchanged.

Verified directly from source: `src/features/landing/LandingPage.tsx` and `src/landing.css`. Supporting T3 checks reported by the implementer confirm immediate Arrow/Home/End updates, no panel animation, a 2px focus outline with 5px offset, and a 0s CTA transition under keyboard focus. Applying the reduced-motion CSSOM branch produced zero animations and static aperture; the global 0.01ms override makes indicator transitions effectively immediate. These are source/OS-branch checks, not a recording on a physical device; actual frame delivery remains unmeasured. No new audit, UI edits, or commits were performed.

**Approve** — all four findings are resolved, and the new landing motion meets the bounded review's code-level requirements.
