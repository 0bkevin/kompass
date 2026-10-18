# Filesystem boundary for subscription-backed image creation

The image worker now runs Codex inside a required Linux Bubblewrap namespace. A missing or unusable sandbox disables image creation; there is no fallback to running an untrusted creative brief against the host filesystem. Video readiness also requires this boundary because a missing illustration may need image generation.

The child sees read-only system binaries/libraries, public CA certificates, the few hostname-resolution files needed for the normal Codex connection, the actual Codex binary and its optional code-mode host. Its writable filesystem consists of its current job directory and private temporary storage. It receives a new empty home directory and a job-specific `CODEX_HOME`, including a fresh generated-image directory. Previous account images, browser files, project data, application credentials and the rest of the host home/workspace are absent.

The normal CLI's existing `auth.json` is bound as one read-only file inside that private `CODEX_HOME`. JavaScript checks its existence and file metadata without reading, copying or proxying its token values. The host destination is an empty mount placeholder and remains empty after the sandbox exits. This keeps the supported normal ChatGPT sign-in while avoiding a copy of the account credential in job storage.

The sandbox also isolates user, PID, IPC and UTS namespaces, mounts a new `/proc`, drops capabilities, starts a new session and dies with its parent. A host PID's `/proc/.../root` cannot expose the unmounted host filesystem. Networking remains available for Codex's normal authenticated provider connection; this is a filesystem/process boundary, not a network allowlist. The CLI still disables shell, file-view, browser, apps, plugins, hooks and multi-agent features for creative requests.

Generated output is accepted only under the newly created thread inside that job's private generated-image directory. It then passes PNG structural/decompression validation before being copied into the company's asset library. Job cleanup removes the private runtime directory. This does not mutate an approved piece: attaching the file and saving remain explicit editorial actions.

## Authentication refresh

The worker cannot update its read-only credential mount. If the account session needs a refresh or reauthorization that requires rewriting `auth.json`, image creation can fail. The visible error tells the administrator to sign in to Codex with ChatGPT again on the server and submit a new request. There is no automatic image retry, token extraction, credential-copy fallback or API billing substitution. An interrupted/failed request remains recorded so a refresh cannot silently charge for the same image again.

## Verification

The actual installed Codex CLI completed `login status` inside the restricted filesystem with exit code zero and recognized the existing ChatGPT sign-in. This was a local authentication-status check, not another image generation request.

Five new tests exercise the real Bubblewrap process on this VM, with no skips:

- A synthetic host image, the host account's unrelated configuration and the parent process's `/proc` root/environment are invisible.
- The child can write its own output but cannot overwrite its read-only authentication fixture.
- Application API keys are absent from the child environment.
- Relative, missing, symlinked, broad or malformed job directories fail closed.
- Repeated setup does not import previous host image history or copy credential contents.

The write-denial test uses only a synthetic authentication fixture; it never attempts to modify the user's real credential. The real authentication check only reads it through the supported CLI. A live image request under the new boundary is validated separately in the parent delivery's browser report.

Implementation: [sandbox helper](../../scripts/media-sandbox.mjs), [worker](../../scripts/media-worker.mjs), [tests](../../tests/media-sandbox.test.mjs). Bubblewrap flags were checked against the installed `/usr/bin/bwrap --help` and the actual process probes.
