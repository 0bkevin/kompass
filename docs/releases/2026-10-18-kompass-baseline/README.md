# kompass baseline release: preflight and deployment contract

Recorded on 18 October 2026 before opening the release PR. The operator explicitly authorized creating the PR, merging it into `main` with a merge commit and deploying production. This release contains the existing redesign, essential copy, media packaging and approved-file webhook changes; it adds no product features or work from the parallel feature branches.

## Source and history

- Repository: `0bkevin/kompass`; configured remote: `git@github.com:0bkevin/kompass.git`.
- Authorized product HEAD: `30c3868693141486e5427da45573f4626f184c89`.
- Remote `main` checked over authenticated HTTPS: `9fd8e9a92a389540d4e8fd04d00a03fab6790bd7`.
- All 47 product commits are retained. This documentation is one additional commit; the PR must use **merge**, with no squash or rebase.
- SSH host verification was retained. The scanned Ed25519 fingerprint matched `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, published in [GitHub's official documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints). SSH client authentication then failed with `Permission denied (publickey)`, so Git uses HTTPS with the existing GitHub CLI authentication. No SSH verification was disabled.

## Executed preflight

- Node `v24.20.0`; npm `11.19.0`.
- Clean isolated checkout; dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund`.
- `npm run build`: passed, including `tsc -b`.
- `node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.mjs`: **599 passed**, zero failed, cancelled or skipped.
- `node scripts/package-release.mjs /tmp/kompass-30c3868-package-20261018`: 173 explicitly selected runtime files, clean source HEAD. See [preflight-manifest.json](preflight-manifest.json).
- Packaged dependencies installed with `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`: passed. The package started with the deployed Node binary, a new temporary `DATA_DIR`, and discovery, social synchronization and media generation disabled.
- **52 HTTP checks passed** against the isolated package: landing and login HTML, health, session/providers, protected media access, one invalid synthetic login, favicon, Google sign-in artwork, local fonts and the actual JS/CSS assets referenced by both HTML documents. Status and MIME types were checked. See [package-http-checks.json](package-http-checks.json).
- `scripts/check-integrations.mjs --require-media` exited **1 as expected**, reporting images and video unavailable and `liveGenerationVerified=false`; no generation or webhook request was made. See [package-media-check.json](package-media-check.json).

Before promotion the public site returned the old `30X Radar — Ideas que conectan` title, `/api/health` returned `{"ok":true}`, and `/icon.svg` returned 404. This records the before state; isolated package success does not claim that production has already changed.

## Backup and protected production state

The existing `30x-radar-backup.service` completed successfully at `2026-10-18 15:27:55 UTC`. Its script uses SQLite's online backup API and includes uploads and `.encryption-key` in a root-only archive.

- Archive: `/var/backups/30x-radar/20261018T152755785841Z.tar.gz`.
- SHA-256: `bbd994deee08c98b924c0125b87c7a2a7d8cfb36ae184bd5f26fb98ce294fe8e`.
- Size: 171,666 bytes; extracted SQLite `PRAGMA integrity_check`: `ok`; encryption key matches production.
- Previous release: `/opt/30x-radar/releases/e26353601006`.
- Existing application: `30x-radar.service`, user `radar30x`, port `127.0.0.1:3036`.
- Preserve `/etc/30x-radar/environment`, `/var/lib/30x-radar`, its SQLite inode, uploads, encryption key and authentication data. A root-only preflight snapshot at `/var/backups/30x-radar/release-preflight-20261018.json` permits comparisons without publishing credentials or account records.
- Preserve `/etc/30x-radar/Caddyfile`, `30x-radar-web.service`, the canonical `https://kompass.kevinbravo.com` host and the other imported Caddy sites.

## Promotion and rollback

After the PR merges, package the clean merge HEAD into a fresh `/opt/30x-radar/releases/<merge-sha-prefix>` using `scripts/package-release.mjs`; install production dependencies with scripts disabled. The final package's `release-manifest.json` records the exact merge SHA and individual input hashes. Verify those hashes before switching and keep code owned by root and readable by the service user.

Before switching, run the media prerequisite check as `radar30x` with the existing environment file and the application unit's filesystem restrictions, overriding `DATA_DIR` to fresh private temporary storage. Do not start a candidate server against the production database.

Switch `current` by atomically renaming a new symlink on the same filesystem, then restart only `30x-radar.service`. Gate success on localhost and public health, landing/login HTML, asset MIME types, one deliberately invalid same-origin login, active service state, read-only SQLite integrity and protected-state comparisons. Inspect startup errors with redaction; do not print the environment or user data.

If startup or a required gate fails, atomically restore the previous symlink and restart the previous release. Retain the backup. Switching the code symlink does not undo database writes: stop the application before any separately necessary full-data restore and account for writes since the backup. The authorized branch does not change `server/db.mjs` or `server/auth.mjs` relative to `main`, but normal startup recovery and periodic retention can update records.

The deployed release directory will also retain `deployment-result.json` with the final merge SHA, release path, backup, verification results and limitations. No tokens, environment contents or original-checkout data belong in the package or this document.

## Explicit limits

- Media remains **disabled** in production. The existing service environment does not enable it, `radar30x` has no normal Codex ChatGPT login, and the available host Codex executable belongs to Ubuntu's home rather than the service runtime. Host Bubblewrap, FFmpeg and FFprobe do not establish service readiness. The Ubuntu login is neither copied nor reused. The public ChatGPT account is not authorized for this service.
- No live image/video generation, webhook delivery, paid request, social publication or new connector is part of deployment verification. Automated provider/webhook tests use simulated transports.
- A 401 for synthetic invalid credentials verifies the origin/proxy path; it does not prove a real account login or Google OAuth. Existing production authentication configuration is preserved.
- The absent old `radar` DNS record is unrelated to this deployment; no domain or DNS changes are required.
