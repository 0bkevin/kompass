# Auditoría independiente: programación, calendario y exportación

Resultado: **FAIL**. 12 casos: **10 PASS, 1 FAIL y 1 BLOCKED**. Un hallazgo confirmado P2, sin hallazgos P1.

Revisión interactiva del build existente en http://127.0.0.24:4114 el 18/10/2026. Cuenta y marca ficticias, siete piezas sintéticas, dos audiencias y canales diferenciados. DATA_DIR propio: `/tmp/30x-adversarial-calendar`. Se leyeron PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md; no se modificó producto ni se ejecutó build.

## Hallazgo calendar-1 · P2

**Una fecha residual mantiene un borrador sin aprobación en la grilla y el CSV.**

Esperado: invalidar la aprobación y volver a borrador debe retirarlo del plan vigente, próximos y exportación, o limpiar la fecha.

Reproducción: partir de una pieza programada para 22/10/2026 16:20 UTC. Un PATCH autorizado con `{status:"draft",title:"QA Instagram corregido sin aprobación",script:"Revisión sintética pendiente; no debe contarse como programada."}`, sin `scheduledFor:null`, recibe 200 y conserva la fecha. Recargar Calendario, seleccionar el día y cambiar a semana. La UI cuenta 2 piezas en octubre/semana aunque sólo 1 tiene status scheduled; muestra el borrador en “Próximas en salir”. La exportación contiene también esa fila con Estado=Borrador.

El estado se preparó por API en la base propia y el fallo se observó en UI y archivo descargado. La edición normal desde el estudio **sí** limpia la fecha. No se reprodujo el origen de este estado mediante el editor UI ni hubo publicación externa.

Evidencia: [captura](../evidence/calendar-draft-still-counted.png), [CSV con borrador](../evidence/calendar-export-draft-dated.csv), [observaciones y fixture](../evidence/calendar-observations.json). Apoyo de causa: server/core.mjs:663, server/core.mjs:672, src/features/Calendar.tsx:98, :129 y :145.

## Casos

| Caso | Esperado y observado | Resultado |
| --- | --- | --- |
| Estado inicial y conteos exactos | Con 7 piezas sintéticas, sólo las 3 programadas con fecha aparecen; octubre 2, noviembre 1, bandeja aprobadas 2; borrador y revisión sin fecha quedan fuera. **Observado:** Los valores iniciales coincidieron con la API. El mes incluye visualmente días contiguos; el resumen/exportación excluye noviembre cuando octubre es el periodo activo. | PASS |
| Programar aprobada y recargar | Agendar por UI el 21/10/2026 14:35 UTC, conservar canal LinkedIn y audiencia cal-lideres y persistir tras recarga. **Observado:** UI guardó scheduledFor=2026-10-21T14:35:00.000Z y status=scheduled, sin alterar canal/audiencia/guion. Octubre pasó a 3 y el día 21 a 2; la recarga conservó los datos. | PASS |
| Validar vacío y pasado | No guardar fechas vacías o pasadas; conservar el diálogo para corregirlas. **Observado:** Vacío activó required nativo (valid=false). 17/10/2026 14:35 devolvió HTTP 400 y «Elige una fecha futura para programar la pieza». Se corrigió y guardó después. | PASS |
| Reprogramación | Mover la misma pieza del 21/10 14:35 al 23/10 17:45 sin duplicarla. **Observado:** Reprogramar en el panel del día guardó 2026-10-23T17:45:00.000Z. Salió del día 21, apareció en el 23, mismo id, total octubre=3. | PASS |
| Aprobación invalidada con diálogo abierto | Si una aprobada vuelve a borrador por corrección concurrente, el diálogo antiguo no debe programarla. **Observado:** Con diálogo abierto, fixture API cambió status a draft y el contenido. Guardar desde UI devolvió 409: draft→scheduled inválido; no programó. | PASS |
| Editar programada desde UI | Guardar un guion corregido invalida la aprobación y retira la programación. **Observado:** La UI guardó el guion, volvió la pieza a draft, eliminó scheduledFor y pidió Enviar a revisión. La grilla dejó de incluirla. | PASS |
| Mes, semana, anterior, siguiente, hoy y abrir pieza | Navegación consistente, 42 celdas mes y 7 semana; semana 19–25 octubre=3, 12–18=0, noviembre=1. Abrir evento debe conservar id/datos. **Observado:** Mes y semana, ambos sentidos y Hoy funcionaron con esos conteos. El evento abrió el estudio de su id con canal y audiencia correctos. La lista Próximas estaba ordenada por fecha. | PASS |
| CSV: contenido, periodo, fechas y escape | CSV de octubre con exactamente 3 filas/12 columnas; fechas y audiencias exactas; comas/comillas/saltos válidos y fórmulas neutralizadas; sin la pieza de noviembre. **Observado:** Descarga UI parseada con csv.DictReader: 3 filas, 12 columnas, horarios 21/10 09:10 y 14:35, 22/10 16:20 UTC, audiencias correctas. Título/guion multilínea y comillas escapadas; =SUM y @ prefijados con apóstrofo. Noviembre excluido. | PASS |
| Exportación de pieza Markdown | Exportar desde el estudio abierto por calendario preserva título, gancho, guion, caption, CTA y fuente sintética. **Observado:** Se leyó el archivo descargado: los campos y saltos coinciden, fuente Idea propia. Este formato no incluye metadatos de fecha/audiencia; la fecha se verificó en el CSV. | PASS |
| Revisor sólo consulta | Ocultar controles de agendar/reprogramar; impedir cambios en servidor y edición en estudio. **Observado:** Cuenta ficticia con membresía reviewer sintética: sin controles de escritura en calendario, nota de sólo consulta; PATCH devuelve 403 Necesitas permisos de edición. Estudio usa fieldset disabled, todos los campos efectivamente deshabilitados. | PASS |
| Borrador con fecha residual | Una pieza que volvió a borrador y requiere revisión no debe seguir contándose como plan vigente ni exportarse en él. **Observado:** PATCH válido scheduled→draft con cambio editorial conserva scheduledFor si se omite null. Tras recarga la UI mostró borrador en grilla, Próximas y CSV; resumen de octubre y semana=2 frente a 1 pieza status scheduled en API. | FAIL |
| Cambio de zona horaria | Verificar conversión al cambiar de zona y límites de día/DST. **Observado:** Sólo se probó navegador y servidor UTC. No se cambió zona horaria ni se cubrió DST. | BLOCKED |

## Alcance y límites

- Base propia con datos exclusivamente sintéticos; no mide exactitud de datos reales ni proveedores.
- Zona probada: UTC. Sin cambios de zona ni límites DST.
- No se ofrecen vista Lista completa ni filtros de canal/estado/audiencia en Calendario en este build; sí existe Próximas en salir. No se afirma probar filtros inexistentes.
- No se encontró control explícito de cancelar programación; se verificó retirada al editar la pieza por UI.
- Programar organiza el plan. No se configuraron proveedores ni se enviaron publicaciones o mensajes a terceros; no se probó publicación real.
- La membresía reviewer se creó como fixture SQLite propia después de registrar la cuenta ficticia por API; el flujo de invitación no se evaluó.
- Sin build, format ni cambios de código de producto. Se revisó el build existente; las referencias de código sólo apoyan fallos observados en navegador.

El CSV normal se leyó y parseó: 3 filas y 12 columnas, fechas/horas/audiencias exactas, comillas y saltos preservados, fórmulas neutralizadas. El Markdown descargado también se leyó; contiene la pieza y su fuente, sin metadatos de programación.

Evidencias y detalles completos en [calendar.json](calendar.json) y [calendar-observations.json](../evidence/calendar-observations.json). Capturas adicionales: [semana normal](../evidence/calendar-week-normal.png), [pasado inválido](../evidence/calendar-past-validation.png), [aprobación invalidada](../evidence/calendar-stale-approval.png), [edición UI](../evidence/calendar-ui-edit-invalidates.png), [revisor calendario](../evidence/calendar-reviewer-calendar.png), [revisor estudio](../evidence/calendar-reviewer-studio.png).

Runtime propio: sesión 36823, PID 3883332. Proceso propio terminado y pestaña propia cerrada; DATA_DIR conservado para reproducción.

