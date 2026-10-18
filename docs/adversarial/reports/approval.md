# Revisión independiente: aprobación versionada

**Resultado: PARTIAL. 16 PASS, 0 FAIL, 1 BLOCKED. Hallazgos confirmados: 0.**

Se probaron interactivamente comentarios, solicitud de cambios, corrección, reenvío, aprobación por revisor y propietario, permisos y protección frente a versiones obsoletas. La entrega externa quedó bloqueada por falta de conector; no se presenta como prueba aprobada.

## Entorno y método

- Build existente, commit `549e0bbf5b5858eb79bf069d847daee269ad344e`; sin cambios de implementación ni build.
- URL `http://127.0.0.23:4113`; datos propios `/tmp/30x-adversarial-approval`.
- Tres cuentas sintéticas con roles owner/editor/reviewer. Login/logout UI secuenciales sobre el mismo host y pestaña propia.
- Pieza sintética `6e62e922-1e78-40e7-a369-b694eea0365d`, marca `08454cb1-593b-45e5-bff7-afa58f58684f`.
- Fixtures y ediciones externas preparadas por API autenticada en la base propia; acciones del flujo y gates de versión obsoleta mediante UI nativa T3.
- Contraste de texto exacto, saltos de línea, estado, comentarios y hash SHA-256 calculado independientemente sobre los campos canónicos. Las respuestas de pieza con contenido guardan `computedHash` y `apiHashMatches`, sin cookies ni claves.
- Runtime PID 3882617, sesión 31042 y pestaña propios cerrados. Base temporal conservada.

## Casos

| Caso | Esperado | Observado | Resultado |
|---|---|---|---|
| Enviar borrador y repetir clic | Editor puede enviar a revisión; el texto y su hash permanecen iguales y no se duplican acciones. | UI Enviar a revisión con doble clic dejó status=review; v1 PS7Vfai7JdqYPrOwxpfcpUQT4dpqtanin_bxtbvOkTI y comentario del editor únicos. | PASS |
| Comentarios por los tres roles y vacío | Owner, editor y reviewer pueden comentar; comentario vacío queda bloqueado; comentar no cambia la versión editorial. | UI Agregar comentario deshabilitado vacío. Tres autores persistieron sus textos exactos. El comentario del owner mantuvo approved y hash fdRur1lXK391LFZEMdLBjIotkadkyVPg28EvNQ9dgE0. | PASS |
| Editor no aprueba | UI impide aprobar/solicitar cambios al editor y servidor rechaza el intento. | Aprobar pieza y Solicitar cambios disabled=true; POST review como editor devolvió 403, sin transición. | PASS |
| Reviewer no edita | Campos editoriales y guardar están deshabilitados; PATCH editorial devuelve 403. | Todos los campos del fieldset coincidieron con :disabled y Guardar cambios estaba deshabilitado. PATCH script del reviewer devolvió 403. | PASS |
| Solicitar cambios con comentario y repetición | Solicitud del reviewer devuelve a borrador y conserva un solo comentario de decisión. | Doble clic UI Solicitar cambios dejó draft y una entrada Cambios solicitados: Sustituir 12345 por 54321 antes de aprobar. v1 no cambió; recarga conservó draft. | PASS |
| Corregir y reenviar cambios sin guardar previamente | Enviar guarda la corrección local y coloca esa versión exacta en review. | Editor corrigió script en UI a v2 y pulsó Enviar a revisión. API guardó texto con salto de línea y 54321, status=review, hash z40DrIX4pB8thYH8FX8F7Va-ckLFpu8mayU40UAb6SM. | PASS |
| Aprobación API de hash obsoleto | La versión v1 no puede aprobar el contenido v2. | POST review con expectedApprovalVersion v1 devolvió 409 y mensaje de actualización. | PASS |
| Revisión abierta mientras otro editor modifica texto | Aprobar desde UI obsoleta falla, mantiene review y carga el texto vigente para revisarlo de nuevo. | Reviewer tenía v2 abierta; PATCH externo editor guardó v3 con 98765. Clic UI Aprobar devolvió 409. UI mostró v3 y aviso de volver a revisar; API seguía review sin comentario de aprobación añadido. | PASS |
| Aprobar versión vigente y doble acción | Reviewer puede aprobar sólo el texto vigente; doble clic no duplica decisión. | Tras revisar v3, doble clic UI Aprobar produjo un POST 200, una entrada Aprobada y status=approved. Hash fdRur1lXK391LFZEMdLBjIotkadkyVPg28EvNQ9dgE0 coincide con SHA-256 independiente de campos y texto. Repetir vía API dio 409. | PASS |
| Protección de edición de contenido aprobado | Servidor rechaza script nuevo manteniendo approved; una edición explícita a draft retira aprobación. | PATCH script sin cambio de estado devolvió 409. PATCH externo editor con script v4 y status=draft devolvió draft y hash JmNTLJu1P5P-qF-iP4Sf6xtGWREDtVTBySfGeVeLtTg. | PASS |
| Programar y publicar sin aprobación | Un draft no puede programarse ni publicarse. | PATCH draft→scheduled devolvió 409; POST publish devolvió 409 Aprueba la pieza antes de publicarla. No cambió el estado. | PASS |
| Programación abierta tras invalidación externa | El formulario abierto cuando estaba approved no puede programar un draft creado por edición posterior. | Con modal UI abierto en v3 approved, edición externa dejó v4 draft; Guardar en la grilla devolvió 409, modal mostró error y API siguió draft. POST publish también devolvió 409. | PASS |
| Editar contenido programado desde UI | Guardar cambios editoriales retira aprobación y fecha de programación. | Owner cambió caption a v5 en UI desde scheduled. Guardar dejó draft, quitó scheduledFor y cambió hash a OroStFhvVR7ZN6TRDYfBryLd0t3Py7MKN4v3aAfv6Kg. | PASS |
| Aprobación owner y programación de versión vigente | Owner puede enviar/aprobar; programación conserva exactamente el contenido aprobado. | Owner envió y aprobó v5 por UI, luego Planificar publicación→Guardar en la grilla. approved y scheduled conservaron hash OroStFhvVR7ZN6TRDYfBryLd0t3Py7MKN4v3aAfv6Kg y todos los campos canónicos. | PASS |
| Persistencia tras recarga y SQLite | Recarga mantiene estado, textos, fecha, comentarios y versión aprobada/programada. | Navegación completa a la misma pieza conservó scheduled, hash OroStFhvVR7ZN6TRDYfBryLd0t3Py7MKN4v3aAfv6Kg y 7 comentarios. Lectura de SQLite confirmó textos y fecha. No se usó sólo toast. | PASS |
| Ausencia de conector y recuperación | Una pieza aprobada/programada sin proveedor no se marca publicada y muestra vía de recuperación. | POST publish de pieza scheduled devolvió 409 Conecta Telegram para ese canal o un webhook de publicación. Puedes exportar la pieza mientras tanto. API siguió scheduled. | PASS |
| Entrega real a un canal externo | Una publicación real requeriría proveedor configurado y recibo verificable. | No probado: entorno sin claves ni destinos autorizados; no se configuraron conectores ni se enviaron publicaciones a terceros. | BLOCKED |

## Versiones contrastadas

| Momento | Hash | Estado observado |
|---|---|---|
| Borrador v1; comentario y envío | `PS7Vfai7JdqYPrOwxpfcpUQT4dpqtanin_bxtbvOkTI` | review; mismos textos |
| Corrección v2 a 54321 | `z40DrIX4pB8thYH8FX8F7Va-ckLFpu8mayU40UAb6SM` | review |
| Edición externa v3 a 98765 | `fdRur1lXK391LFZEMdLBjIotkadkyVPg28EvNQ9dgE0` | review tras aprobación obsoleta 409; approved sólo después de revisar UI actualizada |
| Edición v4 posterior | `JmNTLJu1P5P-qF-iP4Sf6xtGWREDtVTBySfGeVeLtTg` | draft; calendario abierto antes de editar rechazado 409 |
| Caption v5 editado por UI | `OroStFhvVR7ZN6TRDYfBryLd0t3Py7MKN4v3aAfv6Kg` | draft sin fecha; luego approved → scheduled mediante nueva revisión; mismo hash tras recarga |

La aprobación obsoleta por UI se documenta en [captura](../evidence/approval-stale-version-blocked.png), [estado posterior](../evidence/approval-10-after-stale-ui.txt) y [aprobación posterior exacta](../evidence/approval-11-approved-v3.txt). El calendario obsoleto se documenta en [captura](../evidence/approval-stale-calendar-blocked.png) y [estado](../evidence/approval-16-stale-calendar-state.txt). La versión vigente programada está en [captura](../evidence/approval-current-version-scheduled.png), [estado final](../evidence/approval-25-final-reloaded-state.txt) y [SQLite](../evidence/approval-sqlite-summary.json).

## Observación técnica sin hallazgo

PATCH externo autorizado de assignee, manteniendo textos/canal/formato/audiencia/archivos iguales, cambió approvalVersion JmNTLJu1P5P-qF-iP4Sf6xtGWREDtVTBySfGeVeLtTg → Mjf_CHg0wQtDmuW8tJvUmoIKeZz3p4yVLciQYH-CNlY y retuvo approved; luego UI permitió programar. El responsable está incluido en el hash pero no en editorialKeys.

Observación técnica sin severidad: los requisitos no fijan que reasignar responsable invalide aprobación editorial. No demuestra aprobación de texto distinto ni se registra como fallo funcional.

Código de apoyo: `server/core.mjs:43`, `server/core.mjs:644`, `server/core.mjs:1211`. Evidencias [aprobación v4](../evidence/approval-18-approved-v4.txt), [reasignación externa](../evidence/approval-19-assignee-hash-drift.txt) y [programación posterior](../evidence/approval-20-new-hash-scheduled.txt). Esta observación no cuenta como FAIL ni bypass de contenido.

## Límites

- Entrega externa real BLOCKED: sin credenciales/destinos de publicación; sólo gates locales y recuperación verificados.
- Fixtures exclusivamente sintéticas; no se valida exactitud de fuentes o publicaciones reales.
- Rechazo se cubrió mediante Solicitar cambios, que devuelve a borrador; no hay acción terminal separada Rechazar en la UI observada.
- Persistencia comprobada con recarga y lectura SQLite; no se reinició el runtime durante el ciclo.
- Dobles acciones se probaron mediante doble clic UI y repetición posterior API; no es una prueba de estrés de múltiples procesos.
- La política de reasignación del responsable no está explicitada; observación de hash registrada sin inferir fallo editorial.
- Se auditaron revisión/comentarios/aprobación y sus gates. Otros módulos y reportes ajenos no se revisaron.

Inventario completo de casos y evidencias: [approval.json](approval.json).

