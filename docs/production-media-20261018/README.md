# Multimedia verification and existing-domain migration

Verified on 18 October 2026. The user subsequently limited the public operation to renaming the existing domain. The application release, service process, existing database, uploads and credentials were preserved. The worktree changes below have **not** been promoted to the public deployment.

## Existing public deployment

- Canonical host: `https://kompass.kevinbravo.com`.
- The user added the Cloudflare A record to `161.153.114.230`; public DNS resolution was checked.
- Caddy obtained HTTPS for the new host and forwards it to the existing `127.0.0.1:3036` service.
- The old host's server block returns **308**, with `Location: https://kompass.kevinbravo.com/studio?ref=example`, preserving path and query. This was initially verified by a public request. The final authoritative DNS check found the old `radar` A record absent, so the old URL no longer resolves; the prepared redirect requires retaining that DNS record. A request pinned to the server IP verifies the redirect independently of DNS. The new host resolves normally.
- `/home` returns 200, `/api/health` returns `{"ok":true}`, and a same-origin login request with deliberately invalid synthetic credentials returns the expected 401 instead of an origin error.
- The existing application process stayed at PID 1492132, and `/opt/30x-radar/current` remained linked to release `e26353601006`. No app restart or release replacement was performed. Other Caddy site blocks were retained.
- The existing backup service completed successfully before the proxy change. The previous proxy configuration is preserved at `/etc/30x-radar/Caddyfile.before-kompass-20261018`.

The public release predates the kompass redesign and media worker. Its screenshot is evidence of the domain change, not a claim that this branch's interface or generation is live. The service account's temporary login preparation was cancelled and removed; no ChatGPT credential was transferred or installed there. A host change does not transfer a browser's old host-only session cookie: users sign in at the new host.

## Real generation in the production host implementation

An isolated instance ran **`npm start`**, serving the built TanStack Start frontend and API together on port 5190, with a new temporary `DATA_DIR`. It used the VM's existing normal Codex ChatGPT sign-in, Bubblewrap and FFmpeg. It did not copy the original checkout's environment, API credentials, company data or browser tokens.

The QA company and piece contain only synthetic company context and original public test text. The browser created one image, attached and saved it, then created a portrait video which reused that image without another image request. Both files were attached and saved; the piece was sent for review and approved in the interface.

| Output                                   | Observed result                                                     | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [illustration.png](illustration.png)     | PNG, 1672 × 941; 1,942,944 bytes                                    | `482eb4d4bb6066e52c015030bf386b0e605eba8ae5e32df9ebe9e7caa018bbff` |
| [animated-video.mp4](animated-video.mp4) | H.264, 720 × 1280; 12.083333 seconds; 85,800 bytes; no audio stream | `08f4edab95dd875d2df9d76c1fb2e7ecaba6b7639dfad9af9c0c95735303b36d` |

The illustration and an extracted video frame were visually inspected. The whole horizontal illustration is retained in the portrait composition; Spanish subtitles use the saved script. The browser video reached ready state 4, with the same dimensions and duration as FFprobe. Authenticated file downloads returned 200, correct MIME types and attachment filenames, exact byte counts and the hashes above. The UI capture is [studio-media.png](studio-media.png).

The test does not establish a general generative-video capability: the MP4 is an illustration with camera movement and subtitles, without voice, music or generated motion footage. Image proportions are model requests; actual dimensions are retained rather than reported as exact requested exports.

## Corrected publication handoff

Previously the webhook payload sent a piece with asset IDs, leaving its receiver unable to read session-protected files. The worktree now adds an `assets` array to the existing `piece.publish` JSON event:

```json
{
  "event": "piece.publish",
  "idempotencyKey": "existing delivery key",
  "brand": { "id": "company-id", "name": "Company" },
  "piece": { "assetIds": ["asset-id"] },
  "assets": [
    {
      "id": "asset-id",
      "name": "Image.png",
      "type": "image",
      "mimeType": "image/png",
      "size": 123,
      "encoding": "base64",
      "data": "..."
    }
  ]
}
```

The receiver decodes `data` as base64. Only resources explicitly attached to the current approved piece and belonging to its company are included. Missing files, foreign-company IDs, traversal, symlinks, and more than 25 MiB of combined file bytes prevent transmission before a send journal is created. Optional dimensions and duration are included; filesystem paths and browser credentials are not. Changes to the piece or destination while files load require another confirmation. Existing duplicate protection and uncertain-delivery handling remain in place.

The destination needs to accept the expanded JSON body (base64 adds roughly one third to file size) and perform its own authorized social upload. Receiving HTTP 2xx is a handoff receipt, **not proof of a social publication**. The regression tests use an explicitly simulated receiver, verify exact received bytes, and exercise isolation, limits, idempotency and concurrent changes. No live webhook or social account received the QA piece.

## Deployment checks and packaging

`npm run integrations:check -- --require-media` now exits unsuccessfully when images or video prerequisites are unavailable. It checks the CLI sign-in, Bubblewrap, FFmpeg and FFprobe without generating media or claiming a successful provider request. The existing default report remains configuration-only; `liveGenerationVerified` stays false even when prerequisites are present.

`node scripts/package-release.mjs /absolute/new-directory-outside-checkout` packages the built application, server, **scripts including the media worker and sandbox**, and server-used library modules. It excludes runtime data and credentials and records source HEAD, dirty state and file hashes. Previously deployed packaging omitted the scripts directory. The resulting isolated package was installed with `npm ci --omit=dev --ignore-scripts` and started successfully: HTML and the health API both returned 200 on port 5191. This package was not promoted publicly.

To activate media in a future authorized release, the existing service account needs its own normal Codex sign-in, installed runtime binaries, writable persistent job storage, `MEDIA_GENERATION_ENABLED=true`, and a successful runtime check under the actual systemd restrictions. The current implementation is a single-process queue; multiple replicas require shared worker coordination. It does not connect each customer's ChatGPT subscription.

Build and TypeScript passed. The initial full regression run passed 597 tests. A later run with the 20-second global test deadline timed out during the four-ratio FFmpeg check under concurrent workload; final confirmation uses four test processes and a 120-second per-test ceiling. The final test result is recorded in the validation artifact alongside this report.
