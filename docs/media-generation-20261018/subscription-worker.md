# Subscription-backed image generation and composed video

Verified on 2026-10-18 in this VM with Codex CLI 0.162.1 and its existing ChatGPT sign-in. No API key, purchase, plan upgrade, browser cookie extraction or authentication-token transfer was used.

## Supported integration

The installed Codex CLI provides built-in image generation and supports non-interactive `codex exec` tasks. OpenAI documents that built-in image generation consumes Codex usage and credits; ChatGPT Work and Codex share usage. This implementation runs that supported CLI with the server account's normal ChatGPT authentication. It does not convert ChatGPT credits into an API key. [Image generation](https://learn.chatgpt.com/docs/image-generation), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [usage and speed](https://learn.chatgpt.com/docs/agent-configuration/speed).

OpenAI also documents an independent Sign in with ChatGPT integration for eligible applications. That requires registration and explicit inference permissions; it is not implemented by borrowing the CLI's tokens. This local worker does not implement customers connecting their own ChatGPT subscription. A new server needs its own supported installation, account sign-in and operator enablement. [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart).

The Videos API and Sora 2 were shut down on 2026-09-24. No retired Sora endpoint is called. Video output here is a locally composed MP4 with an illustration, gentle camera movement and captions taken from the piece's script. It has no generated motion footage, voice or music. The product labels it as an animated video with an AI illustration, without audio. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations#2026-03-24-sora-2-video-generation-models-and-videos-api).

## Observed live output

One bounded public test asked Codex to create an original abstract editorial image about an AI pilot with human review. It returned a real PNG, not a prompt or placeholder. The image was viewed to check the intended composition and absence of branding or identifiable people. A second check composed that same illustration into a real portrait MP4 with three Spanish caption segments; a frame was viewed to check caption readability. The video check consumed no further image-generation credits.

| Artifact                | Observed result                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| Generated PNG           | 1254 × 1254 pixels; 1,775,186 bytes                                    |
| PNG SHA-256             | `6b9512591eb1984d7bc13b7033a3b4d014d984f02f1bd3a02d0226a310856553`     |
| Composed MP4            | H.264, 720 × 1280 pixels; 12.5 seconds; 168,105 bytes; no audio        |
| MP4 SHA-256             | `a5287eb5354ea4aca93e63d1228edd8bef16f108aecf9f2f2dc29066520003c1`     |
| Supported video exports | 1:1 → 720 × 720; 4:5 → 720 × 900; 9:16 → 720 × 1280; 16:9 → 1280 × 720 |

This is a public QA exercise, not a publication by 30X or a measured business result. Requested image proportions are communicated to the image model; actual PNG dimensions are retained in the asset metadata rather than pretending they are exact export dimensions. Video export dimensions are validated with FFprobe.

## Application behavior

`MEDIA_GENERATION_ENABLED=true` enables the server feature. Readiness checks the installed CLI's ChatGPT login, and video readiness additionally checks FFmpeg and FFprobe. Image and video jobs are persisted under the current company. A generation produces library assets; attaching them to a piece and saving remains an explicit user action, preserving the established approval checks.

Repeated submissions with the same idempotency key and content return the same job. Reusing a key for different instructions returns 409. The queue runs one job at a time per application process, allows three pending jobs per company, ten jobs per company per UTC day, and twenty jobs overall per UTC day. These are job limits, not a measured currency or image-credit budget. The prompt requests one image, but the CLI does not expose an enforceable image-call counter in its JSON stream. The runtime bounds are the queue limits and an eight-minute image timeout.

A video reuses a valid image already attached to the piece when available, avoiding another image request. Otherwise it generates an illustration first. Video composition accepts scripts up to 3200 characters and produces a clip up to sixty seconds. Created images remain in the library if later video rendering fails. No stock content is downloaded and no external publishing endpoint is called.

Running jobs interrupted by restart become visible failures and are not automatically retried. Queued jobs can resume. Shutdown aborts and kills the worker process group. FFmpeg composition has a ninety-second timeout, a bounded allocation size and file/pipe protocols only. This implementation targets a single application process on this VM; a multi-process deployment needs a shared worker lease before running several replicas against one database.

## Isolation and verification

The worker receives a small environment allowlist, excluding application API keys, T3 tooling and browser state. It ignores user configuration, hooks and project rules, uses an isolated working directory, and disables shell, browser, apps, plugins, skill search and multi-agent tools. The creative brief travels through stdin, never shell interpolation. Only a PNG under the newly created Codex thread's generated-image directory is accepted; foreign paths, traversal and symlinks are rejected. Client responses exclude raw worker logs, private file paths, user identifiers and internal snapshots.

The worker additionally requires a Bubblewrap filesystem/process namespace, with only a job-specific generated-image directory and one read-only bind of the normal CLI authentication file. [Filesystem boundary and credential-refresh limits](filesystem-sandbox.md) records the actual no-credit login probe and host-file/process isolation tests.

`node --test --test-timeout=120000 tests/media-generation.test.mjs`: **16 passed, 0 failed, 0 skipped**. Checks cover environment isolation, source-path validation, company isolation, request validation, duplicate submission, queue serialization, caps, approval preservation, image reuse, readable failures, recovery, cancellation, disabled-server gating and work-volume failure. Actual FFmpeg output in all four aspect ratios is checked for H.264 codec, dimensions and duration.
