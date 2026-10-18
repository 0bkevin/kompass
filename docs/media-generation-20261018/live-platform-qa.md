# Live platform checks — 18 October 2026

These checks used the running application at `http://localhost:3026`, its existing Google sign-in, public educational content, and an internal 30X evaluation workspace. No content was published to an external social account. No plan was purchased or billing enabled.

## Actual subscription-backed creation

The Studio interface created a new public-content draft, “Piloto de IA con supervisión humana”, for YouTube. From **Crear imagen o video**, the image request produced a real PNG using the server's existing ChatGPT-authenticated Codex CLI. The browser loaded the image, **Añadir a esta pieza** selected it, and **Guardar cambios** persisted its association. Creating a video then reused that image without another image-generation request.

| Observation          | Result                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Draft                | `6534349a-0a62-4667-bb7e-94c67cae3d9a`                                                                |
| Image job            | `fd9d4b52-1cc7-4431-87d3-66c83475732c`                                                                |
| Image asset          | `7b1221a0-14e7-4146-a399-06bbb282787e`                                                                |
| PNG                  | 1672 × 941 pixels; 1,430,724 bytes; image visually inspected                                          |
| Initial video job    | `84ce67c8-286b-473d-ae3d-2bd6aa0c936c`                                                                |
| Initial MP4          | H.264; 720 × 1280; 12.916667 seconds; 145,844 bytes; no audio                                         |
| Browser verification | Video metadata loaded, ready state 4; PNG and MP4 downloads completed with matching byte lengths      |
| Editorial workflow   | Both assets explicitly attached and saved; draft submitted for review and approved in the application |

The initial cross-ratio render exposed a real defect: a horizontal illustration was cropped in portrait video. The independent review also found stale scene text overriding a saved script and insufficient validation of truncated PNG output. Commit `d29404b` fixes all three, with regressions that fail against the previous behavior. The initial clip is test evidence, not the corrected final export.

After approval, the QA draft was renamed with an explicit `[QA multimedia]` prefix and its script edited in Studio. Saving correctly returned the piece to **Borrador** and invalidated its earlier approval. The unrelated scheduled Instagram piece remained untouched.

The final generation was repeated through the interface after the required Bubblewrap boundary was installed. Job `02e349fa-40d6-46b8-a110-3e3f0a8e247c` completed using the existing normal ChatGPT sign-in mounted read-only inside its private filesystem. Asset `dc3f83a5-1e6e-4d89-ba2c-871487d440f2` is a valid 1672 × 941 PNG, 2,440,425 bytes, SHA-256 `cfe3d5b61007f4d75cba66449472465856bf33995d78c751d15830c2cf665083`. It was visually inspected and contains an original editorial illustration, without invented figures or branding.

Job `b797267f-cc83-4386-aa70-6f45d772ae5d` then reused the previously attached horizontal image for a deliberately selected 9:16 export. Corrected asset `a060f37d-f651-420f-bda9-dec1d56c9768` is H.264, 720 × 1280, 12.916667 seconds, 89,203 bytes, without audio; SHA-256 `b491e49174de2325624f600356d09e8bf9781d75cfd67eed6a156664583bafc2`. The browser loaded it with ready state 4 and its download completed. A frame confirms the entire horizontal illustration is preserved with a matte background and the first subtitle is the newly saved text, “Primero, elige una tarea pequeña que tu equipo pueda revisar.” The earlier cropped clip was deselected and the corrected clip explicitly attached and saved. No additional image request was made for that video.

## Actual public discovery and counters

YouTube Data API v3 was enabled in the existing authorized Google Cloud project. A new server credential was restricted to that API, saved privately with file mode 0600, and verified against the official `videos` endpoint. It is neither included in this document nor committed to Git. The separate read-only OAuth callback was registered alongside the existing Google sign-in callback.

The native browser search **Andrés Bilbao 30X** returned seven recent public videos. The separate search **30X AI for Executives** returned zero; the interface preserved that honest empty result. Search covers the last seven days and does not claim these results establish growth, audience fit, or a global trend.

The two-field **Vincular video** form temporarily linked the approved internal QA draft to an existing public reference video, `https://www.youtube.com/watch?v=vfoEzKfxK1I`. The Results page displayed the actual official counters observed at `2026-10-18T12:57:53.349Z`: 5,368 views, 80 likes and 10 comments. Leads remained unavailable. The API response identified cumulative public counters and explicitly did not establish channel ownership.

This was a connector test, not a publication of the generated draft and not a measured result for that draft. **Quitar vínculo** removed the temporary association and its cached snapshot; a subsequent read returned zero links and zero snapshots. Manual business outcomes remained empty throughout.

## UX and independent review

The frontend agent interacted independently with Studio, Settings, Discovery and Results at desktop and mobile widths. Checks included image/video loading, generation disabled for unsaved edits, focus movement to Resources and the publication form, the two-field URL workflow, and truthful availability for each provider. Backend agents covered authentication, company isolation, role permissions, durable jobs, duplicate requests, interruption handling, counters, OAuth state, quotas and retention.

The public YouTube catalog and counters are operational without a channel OAuth connection. Instagram, LinkedIn and TikTok still require their respective approved developer integrations and account authorization; they are visibly unavailable rather than represented as connected. Videos are local animated compositions with an AI illustration and script captions, without audio or generative motion footage.

The separate Google consent flow was also exercised with the authorized operator account, after registering its callback and admitting that account as a Google test user. It completed at `/settings?socialConnected=youtube`; the interface displayed the operator's actual channel and read-only access. This is an operator test channel, not a claim to own 30X's channel. No new YouTube channel was created and no video was published. The encrypted connection survived the final server restart.

After that restart, the native Radar form searched **Andrés Bilbao 30X** again. The actual response contained seven public videos, observed at `2026-10-18T13:06:54.360Z`. The first reference's counters were now 5,377 views, 80 likes and 10 comments. These are separate timestamped public observations; their difference was not presented as a calculated growth rate or a result of the QA draft. Connection health reported read-only YouTube available and automatic sync enabled at a sixty-minute interval.

## Final integrated validation

`node --test --test-timeout=20000 tests/*.test.mjs`: **585 passed, 0 failed, 0 skipped**, including actual local FFmpeg and Bubblewrap checks. `npm run build` passed with TypeScript. The final services were restarted on ports 3026 and 5450 only after all four application media jobs completed; no running or queued generation was interrupted.

Independent review fixes also cover reconnecting an account while an old request is pending, visibility of automatic public-counter failures, and clearing a recovered catalog warning without hiding an unrelated metrics failure. [Frontend checks and viewport evidence](ui-validation.md) distinguish live observations from a simulated browser-only failure response. No provider credential was invalidated to simulate that state.

A fresh, read-only finish reviewer independently checked Studio, connections, discovery and Results at 1280 and 390 pixels and returned **ship**, with no material clarity, layout or correctness findings. It checked the approved-piece linking branch against source and prior evidence because the live QA draft was correctly back in draft. Simulated error captures were identified as such; the reviewer did not generate, approve, save or publish anything.
