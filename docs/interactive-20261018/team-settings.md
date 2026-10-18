# Team and managed settings interactive review — 2026-10-18

Completed bounded interactive review. No product defect required a source fix. Two test-host fixture mismatches were corrected so the positive website-read case could execute without weakening production URL or permission checks.

## Environment and scope

- Isolated instance: port 5469, `/tmp/radar-interactive-team-20261018`; final live process session 37710.
- Independent incognito accounts used distinct loopback cookie hosts, owner `127.0.2.69` and collaborator `127.0.3.69`. Both review tabs were closed at completion.
- Generic company behavior was exercised with `30X — equipo sintético`, `Acme Taller — compañía independiente`, and a third company created from the permitted synthetic website. Initial accounts and two companies were API fixtures; invitations, role changes, removal, AI toggles/reset/model editing, webhook saving, and the positive company-import review were driven through the actual interface.
- No real messages, email, provider keys, AI calls, or publication sends were used. All credentials entered were visibly synthetic placeholders. The test host alone intercepted the reserved example destinations; its generated grant does not assert authorization for a live source. Production policy remained enabled.

## Verified outcomes

| Check | Observed result |
| --- | --- |
| Editor invitation creation and copying | Owner created an editor invite in Settings. The generated URL had the correct current origin and a single-use token; Copy showed `Enlace copiado.`. UI explicitly stated no message was sent. |
| Independent acceptance | A separately authenticated account followed the link on its isolated cookie host. It joined only 30X as editor; the invite query was removed from the URL and the real workspace became available. |
| Role change | Owner changed the collaborator from editor to reviewer through the member role select. Reloaded collaborator UI and API both reported reviewer. |
| Reviewer invitation | After removal, a newly created reviewer invitation joined the account again with reviewer role. |
| Restricted member actions | Editor attempts to create invites, read/write connector administration, and change membership returned 403. Reviewer reference creation returned 403. Owner-only invitation/role/save actions were absent from the collaborator UI; connector inputs were disabled and empty. |
| Last owner protection | Owner self-demotion and deletion probes both returned 409 with `La marca necesita al menos un propietario.`. State retained one owner and two members. Self-edit/removal controls were also absent in the UI. |
| Single use | Pasting the already accepted invitation into the actual acceptance form showed `La invitación venció, ya fue utilizada o no existe.`. The existing reviewer role and company count were unchanged. |
| Expiry | A fresh UI-created invitation was deterministically expired in the isolated database. Accepting it in the form showed the same clear expiry/use error and preserved membership. |
| Access revocation | Owner clicked `Retirar a QA Collaborator`. Subsequent collaborator state and settings write requests returned 404; its session had zero companies. A new valid reviewer invite was required to restore access. |
| Company boundary | Collaborator access to the independent Acme company returned 404, and its company selector/session never exposed that company. |
| Inherited AI | 30X and Acme initially reported ready platform AI, managed by platform, without any company credential. Public state contained no managed credential. |
| Local engine and reset | Owner used `Usar motor local`; 30X became local/not ready with an override, while Acme stayed ready on platform AI. `Usar servicio de la plataforma` restored ready platform AI and removed the override without asking for a key. |
| Optional company override | An optional synthetic company override for the test AI endpoint was seeded through the API, then its model was changed and saved through the UI. State reported workspace management and the edited model; password input cleared after success and no credential appeared in public output. Reset restored the platform service. No generation call was made. |
| Save rejection | An optional AI override targeting the unreviewed default destination returned a policy error. The synthetic password and model remained in the form; the previously ready platform configuration remained saved. |
| Social provider status | Three synthetic legacy provider credentials were seeded. YouTube, Apify, and Gemini reported configured but policy `allowed:false`; UI continued to display `Requiere autorización`, restriction explanations, and only credential-removal actions. A YouTube configuration attempt returned 403. A credential did not enable the provider. |
| Video operation | With the synthetic Gemini credential present, a real reference analyze-video request returned 403 with the rights/treatment restriction. No video result was persisted. |
| Removed Telegram capability | Telegram was absent from visible settings. Removed settings and sync API probes returned 404 `La ruta de API no existe.`. |
| Mobile webhook save | At 390 CSS px, the owner selected Publicación, entered the permitted synthetic webhook URL, and saved it. UI showed `Webhook configurado`; API reported configured and permitted. Saving configuration did not send a publication. |
| Reload/company switching | Switching back from the imported third company showed the original 30X membership and platform service. Reload retained saved configuration. |

## Positive permitted website import

The owner used `Crear otra marca`, entered `https://qa-owned.example.com/30x`, and clicked `Preparar mi empresa`. This exercised actual application URL validation, current operator permission, public DNS validation, robots handling, HTML extraction, and the review interface against an in-process synthetic transport.

The result had `method: heuristic` and evidence `status: read`, `platform: website`, the exact source URL, a real excerpt from the supplied synthetic HTML, and `permissionUrls` containing that same URL. The name and description were populated from the page. Expanding `Ver qué pudimos leer (1)` showed `Página leída` and the warning that company/audience suggestions are hypotheses requiring confirmation. The owner continued through audience review and clicked `Abrir mi espacio`. The third company's persisted `contextImports` record retained the same read evidence and provenance.

[Redacted inspection result](evidence/team-settings/owned-website-result.json) · [Company context review screenshot](evidence/team-settings/owned-website-review.png)

The original test hostname ended in `.test`, which company setup intentionally rejects before DNS. The helper's owned hostname was changed to the IANA reserved `qa-owned.example.com`, still intercepted in-process. The helper's robots response also needed `text/plain` rather than HTML. Only `tests/helpers/interactive-host.mjs` changed: reserved namespace comment, owned fixture hostname, and robots content type. `node --check tests/helpers/interactive-host.mjs` passed. No production validation, provider policy, or global build was changed.

## Responsive and diagnostic evidence

- Desktop 1440×900 and mobile 390×844 CSS viewports: document scroll width equaled viewport width; no horizontal document overflow. Screenshots are DPR-scaled browser captures. Service/team forms stacked on mobile, and the webhook save control was exercised there.
- Primary service/invitation controls measured 44 CSS px high; native role selects measured 43 px. The member removal icon remains 32×32 px, an optional touch-target improvement rather than a blocked operation. Physical-device gestures and a full WCAG/contrast/performance audit were outside this bounded workflow review.
- Expected diagnostics came from deliberate 403/404/409 access probes, the expired/used invite, rejected optional override, and the initial `.test` fixture rejection. An invalid initial API audience fixture also correctly returned 400 until its required responsibility field was supplied. No unexpected application JavaScript exception was observed.
- Automatic initial discovery showed an empty/unrecognized GDELT-response diagnostic on the synthetic company. It was presented explicitly and did not masquerade as successful evidence; this review did not assess discovery coverage.
- The interface provides member access revocation. It does not provide a pending-invitation list or individual pending-link revoke control; this report does not claim that separate capability was exercised. Expiry and single-use rejection were verified instead.

[Desktop settings](evidence/team-settings/settings-desktop.png) · [Mobile settings](evidence/team-settings/settings-mobile.png) · [Mobile webhook](evidence/team-settings/webhook-mobile.png) · [Rejected AI save with preserved form](evidence/team-settings/ai-save-failure-retains-fields.png)

No new regression test was warranted because no product defect was found. The parent run owns the complete automated-suite result; this agent performed no global build or commit.
