# Auditoría independiente: CRUD y configuración de fuentes

**Resultado: FAIL.** 21 casos: **18 PASS, 2 FAIL, 1 BLOCKED**. Dos hallazgos confirmados, ambos P2. Fecha: 18 de octubre de 2026 (UTC).

Build existente servido en `http://127.0.0.27:4117`, con `DATA_DIR=/tmp/30x-adversarial-sources`, `DISCOVERY_ENABLED=false` y las cuatro variables de proveedores retiradas. Cuenta ficticia `qa-sources@example.com`; empresa y fuentes sintéticas. Se usaron las herramientas nativas T3 preview con pestaña exclusiva, snapshots previos, acciones visibles y comprobación posterior por UI/API/SQLite. Sin build, format, cambios de producto ni acceso a datos de otros revisores.

## Hallazgos confirmados

### sources-1 · P2 · Cambiar HN a RSS conserva una consulta oculta y el resumen oculta el feed real

Reproducción:

1. En /settings añadir HN con query agent reliability.
2. Editar la fuente, elegir RSS / Atom e indicar https://www.nasa.gov/feed/.
3. Guardar y recargar /settings; volver a abrir el modal de RSS.

**Esperado:** La configuración y su resumen deben reflejar sólo campos aplicables al nuevo tipo; RSS debe mostrar el feed.

**Observado:** El registro RSS conserva query=agent reliability, que ya no se puede editar desde el modal RSS. La fila prioriza esa query sobre la URL y presenta una configuración incorrecta al usuario. El feed sí quedó guardado; no se afirma que el fetch de RSS use esa query.

**Evidencia:** [sources-hn-to-rss-stale-summary.png](../evidence/sources-hn-to-rss-stale-summary.png), [sources-state-after-ui.json](../evidence/sources-state-after-ui.json).

**Apoyo de código:** `src/features/Settings.tsx:1310`, `src/features/Settings.tsx:260`, `src/features/Settings.tsx:455`, `server/core.mjs:702`. La causa de código complementa el comportamiento observado; no sustituye la prueba por UI.

### sources-2 · P2 · YouTube→Apify muestra Instagram pero conserva plataforma incompatible y rechaza el guardado

Reproducción:

1. Añadir una fuente YouTube y guardarla pausada.
2. Editar y elegir Instagram / TikTok · Apify.
3. Vaciar la antigua URL, escribir una consulta válida y conservar la red Instagram mostrada por defecto.
4. Guardar; luego volver a seleccionar Instagram y guardar para comprobar recuperación.

**Esperado:** Seleccionar Apify debe inicializar su plataforma a Instagram/TikTok y mantener select, etiqueta URL y payload coherentes.

**Observado:** El select muestra Instagram, la etiqueta dice URL de TikTok y Guardar rechaza Apify admite fuentes de Instagram o TikTok. Reseleccionar Instagram permite guardar con platform=instagram. Causa inferida y respaldada por código: platform permanece youtube al cambiar el tipo.

**Evidencia:** [sources-youtube-to-apify-error.png](../evidence/sources-youtube-to-apify-error.png).

**Apoyo de código:** `src/features/Settings.tsx:1317`, `src/features/Settings.tsx:267`, `src/features/Settings.tsx:1376`, `server/core.mjs:738`. La causa de código complementa el comportamiento observado; no sustituye la prueba por UI.

## Casos

| Caso | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| Defaults de una marca nueva | Sólo fuentes abiertas activas por defecto y ningún proveedor pago configurado. | GDELT, HN y Trends activos; TechCrunch pausado. YouTube/Apify/Gemini configured=false. | PASS |
| Alta por UI de seis tipos | RSS, HN, GDELT, Reddit, YouTube y Apify guardan sus parámetros específicos. | RSS hnrss.org/frontpage; HN query=agent reliability; GDELT conserva comillas y sourcelang:spanish; Reddit artificial; YouTube canal canónico; Apify Instagram hashtag y limit=7. Los seis fueron añadidos usando el modal. | PASS |
| Campos requeridos | No crear una fuente vacía; YouTube sin URL ni consulta debe explicar cómo corregir. | Nombre y RSS URL son required. YouTube vacío mostró Indica una consulta o una URL para esta fuente. Formulario y nombre conservados. | PASS |
| Esquema y credenciales de URL | Rechazar ftp y credenciales embebidas sin perder lo escrito. | ftp://example.com/feed y https://qa:fake@example.com/feed fueron rechazados con URL fuente debe usar http o https sin credenciales. Nombre y URL permanecieron editables; posterior corrección funcionó. | PASS |
| URL privada: bloqueo de consulta | No solicitar recursos privados aunque se guarde una configuración inválida. | La UI permitió guardar http://127.0.0.1/private-feed. Al descubrir, safeFetch rechazó la dirección privada o reservada. No se demostró SSRF. La validación de red es diferida. | PASS |
| Selector de YouTube | Aceptar canal o consulta; rechazar URL de video en el campo de canal. | youtube.com/@GoogleDevelopers?feature=shared se guardó como https://www.youtube.com/@GoogleDevelopers. /watch?v=… mostró que requiere /@usuario o /channel/ID. Después se guardó consulta sola responsible artificial intelligence. | PASS |
| URL y plataforma Apify | Validar dominio/perfil/video según Instagram o TikTok y eliminar tracking. | TikTok en campo Instagram fue rechazado. Instagram /publicqa/?igsh=abc se canonizó a https://instagram.com/publicqa. Editar a TikTok /@publicqa/video/123456789?is_from_webapp=1 guardó URL canónica de TikTok. | PASS |
| Límite Apify | Aceptar enteros de 1 a 50; rechazar 0, 1.5 y 51 conservando datos. | 0, 1.5 y 51 mantuvieron el modal abierto con validación nativa. Se guardaron 7 y 50. Los clones de eliminación incluyeron límite 1. | PASS |
| Editar, cancelar y eliminar seis tipos | Los seis tipos permiten editar y eliminar; cancelar una segunda edición conserva la versión guardada. | Clones sintéticos de los seis tipos fueron renombrados por UI a … editada; luego nombre NO GUARDAR cancelado; nombres guardados y parámetros confirmados por API; eliminación por UI. Tras recarga no quedaron clones. | PASS |
| Activar y pausar fuentes abiertas | Los toggles modifican enabled y el estado visible de RSS/HN/GDELT/Reddit. | Cada uno de los cuatro clones abiertos pasó Pausada→Activa→Pausada por UI y terminó enabled=false en API. RSS principal también fue pausado y reactivado. | PASS |
| Gates de proveedores sociales | Sin credenciales, YouTube/Apify se guardan pausados y no permiten activación. | Checkbox de activación deshabilitado en modal; botones Activar QA YouTube/QA Apify deshabilitados; advertencia y Configurar proveedor visibles; enabled=false persistido. No se hicieron llamadas pagas. | PASS |
| Cancelar un alta | Cancelar el modal no crea un registro. | Nombre QA no crear y URL pública fueron escritos y cancelados. Tras recargar no existía esa fuente. | PASS |
| Persistencia tras recarga | Configuración guardada y eliminación sobreviven a recargar /settings. | Los seis registros originales conservaron datos/tipo/estado. NO GUARDAR, QA CANCELLED y los seis clones eliminados no aparecieron. La query vieja HN→RSS también persistió (fallo descrito aparte). | PASS |
| Cambio HN→RSS | Al cambiar a RSS, eliminar/ignorar query incompatible y resumir el feed configurado. | La fuente convertida guardó type=rss, url=https://www.nasa.gov/feed/ y query=agent reliability oculta. La fila RSS mostró agent reliability y ocultó el feed, incluso al recargar. | FAIL |
| Cambio YouTube→Apify | La red mostrada en el select coincide con el valor que se guarda y permite enviar datos válidos. | Tras convertir, el select mostró Instagram y el campo URL decía TikTok; con query válida y URL vacía, Guardar falló Apify admite fuentes de Instagram o TikTok. Reseleccionar Instagram permitió guardar y conservó la query. Causa localizada: platform mantiene youtube hasta onChange de Red social. | FAIL |
| Sincronización de fuente abierta | Una fuente activa abierta se consulta y persiste resumen/fecha sin proveedor pago. | No hay sincronización individual en la UI. Se pausaron las demás como fixture y Buscar tendencias consultó únicamente QA RSS; lastResultCount=20, lastSyncedAt=2026-10-18T02:19:41.865Z y 20 referencias. La exactitud del corpus corresponde a otra auditoría. | PASS |
| Estado de fallo y conservación | Una falla explica su motivo por fuente y no descarta referencias anteriores. | Después de reemplazar RSS por loopback, radar mostró cobertura parcial y motivo de dirección privada. /settings conservó lastError/lastAttemptAt y lastSyncedAt previo; permanecieron las 20 referencias. | PASS |
| Permisos revisor | Sólo lectura y rechazo en servidor de operaciones editoriales. | Con fixture de membership reviewer no se mostraron añadir/editar/eliminar/toggles. POST sources, PATCH source, DELETE source y POST discover devolvieron 403 Necesitas permisos de edición. | PASS |
| Permisos editor | CRUD y toggles disponibles; conexiones reservadas a propietario. | Con fixture editor se creó QA Editor HN por UI, se editaron/cancelaron/eliminaron los seis clones y se togglearon abiertos. Configuración de proveedor no editable; PUT social/settings devolvió 403 Sólo el propietario puede realizar esta acción. | PASS |
| Permisos propietario | Control de fuentes y conexiones disponible sin activar proveedores por defecto. | El owner inicial añadió las seis fuentes, editó y togglé RSS; las conexiones presentaban sus controles. Al terminar se restauró owner; proveedores permanecieron sin configurar. | PASS |
| Cooldown automático | Comprobar dinámicamente la espera progresiva tras falla de descubrimiento automático. | DISCOVERY_ENABLED=false es obligatorio en esta auditoría. No hay estado de próxima ejecución ni control de cooldown en /settings. Sólo se revisó como apoyo la implementación del scheduler; no demuestra su comportamiento. | BLOCKED |

Las fuentes originales se añadieron mediante el modal. Los seis clones destinados a edición, cancelación, toggles y eliminación se prepararon como fixtures por API; todas esas acciones se ejecutaron mediante UI. La eliminación persistió al recargar. Los roles se prepararon sólo en la SQLite de esta auditoría y se restauró propietario al terminar.

## Límites de la prueba

- No credenciales reales, llamadas pagadas ni publicaciones. YouTube/Apify no se probaron como integración real.
- DISCOVERY_ENABLED=false; cooldown automático sin validación dinámica.
- La UI no permite sincronización individual: se aisló una sola fuente activa mediante fixture propia antes de pulsar Buscar tendencias.
- Roles preparados en SQLite propia cambiando membership de la cuenta sintética; no prueban invitaciones ni aislamiento multicuenta.
- RSS abierto real verificado sólo para configuración/estado; exactitud y deduplicación del descubrimiento fuera del encargo.
- Datos sintéticos conservados en /tmp/30x-adversarial-sources; no se modificó producción ni se ejecutaron build/format.

La aceptación de una URL privada al guardar no se clasifica como SSRF: la consulta fue bloqueada antes de acceder a ella. Queda documentado que la validación de red ocurre al consultar y que el usuario puede guardar una fuente que fallará. Tampoco se afirma integración real de YouTube/Apify por el hecho de guardar sus configuraciones.

## Evidencias y reproducción

- [sources-state-after-ui.json](../evidence/sources-state-after-ui.json)
- [sources-ui-crud-six-types.json](../evidence/sources-ui-crud-six-types.json)
- [sources-permissions.json](../evidence/sources-permissions.json)
- [sources-youtube-to-apify-error.png](../evidence/sources-youtube-to-apify-error.png)
- [sources-hn-to-rss-stale-summary.png](../evidence/sources-hn-to-rss-stale-summary.png)
- [sources-private-url-blocked.png](../evidence/sources-private-url-blocked.png)
- [sources-reviewer-readonly.png](../evidence/sources-reviewer-readonly.png)
- [sources-final-state.json](../evidence/sources-final-state.json)

Sesión de proceso `18865`, PID propio `3897172`. Pestaña propia `tab_43_07e54779-9ab2-4979-8a15-674c4eff160a` cerrada. Runtime terminado con SIGTERM tras validar puerto y DATA_DIR del proceso; salida 0. La base temporal permanece para reproducción. No se cerraron pestañas ni procesos ajenos.

El JSON equivalente contiene los resultados esperados y observados, evidencias por caso, límites y fuentes de cada hallazgo.

