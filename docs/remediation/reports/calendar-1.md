# calendar-1 — programación vigente y fechas residuales

Estado: **fixed**, pendiente de integración general. Responsable único: `fix_calendar_1`.

Un PATCH editorial autorizado de una pieza programada a borrador ya cancela la fecha aunque el cliente omita `scheduledFor:null`. El servidor conserva fecha únicamente para los estados `scheduled` y `published`. Volver a `approved` retira también la programación. Las validaciones de fecha futura, aprobación versionada, concurrencia, roles y aislamiento continúan vigentes.

El calendario ahora calcula todas sus vistas a partir de una elegibilidad común: estado programado/publicado y fecha válida. Por ello grilla, conteos de mes/semana/día, próximos y CSV excluyen filas históricas con fechas residuales en borrador, revisión o aprobación. Esas filas se conservan intactas en la base; una aprobada con fecha residual queda disponible para agendar de nuevo desde su bandeja. La historia publicada mantiene fecha, comentarios y recibo; se preserva el rótulo «Aceptado por webhook».

La regresión HTTP original falló antes del arreglo: el borrador conservaba `2026-10-20T05:34:28.202Z`. Después pasan **7/7 regresiones propias**, **17/17 pruebas cercanas** y TypeScript. La comprobación propia cubre también fechas explícitas, transiciones a revisión/aprobación, reprogramación válida, rechazo atómico de fechas inválidas, permiso de revisor, aislamiento y versión editorial vigente.

En T3 nativo, con cuenta y empresa ficticias propias, la misma fila legacy dejó de aparecer sin borrarse. Un fixture de siete piezas confirmó que sólo la programada válida y la publicada histórica se cuentan en octubre: **2 filas y 12 columnas exactas en el CSV**, con títulos, fechas, horas y estados correctos. La pieza de noviembre queda fuera de ese periodo. La semana del 19 al 25 contiene una sola programada válida.

La edición normal desde el estudio retiró fecha y aprobación; se conservó el comentario de revisión. A 390×844, una aprobada con fecha residual pudo agendarse mediante el diálogo, con el mismo id y sin duplicar registros. Aplicar después el PATCH original sin `scheduledFor` devolvió borrador sin fecha y desapareció del calendario tras recargar. El CSV final contiene sólo la publicación histórica. La semana de ambas correcciones queda en cero, con exportación deshabilitada. No hubo desbordamiento horizontal de página; el calendario mantiene su desplazamiento interno.

Evidencias: [rojo HTTP](../evidence/calendar-1/red-test.log), [verde HTTP](../evidence/calendar-1/30x-remediation-calendar-1-green.log), [pruebas cercanas](../evidence/calendar-1/30x-remediation-calendar-1-nearby.log), [comprobaciones interactivas](../evidence/calendar-1/browser-checks.json), [CSV exacto](../evidence/calendar-1/csv-check.json), [captura antes](../evidence/calendar-1/red-draft-counted.png), [mes corregido](../evidence/calendar-1/green-month.png), [semana corregida](../evidence/calendar-1/green-week.png), [móvil tras las correcciones](../evidence/calendar-1/mobile-after-invalidations.png).

Límites: navegador UTC; no se cambió zona ni se probó DST. La función de fechas sí se probó con offset UTC−06. Todos los datos, incluidos estado publicado y recibo, son fixtures locales sintéticos; no acreditan entrega por un proveedor. No se publicaron mensajes ni se llamaron servicios pagos. No se modificó la evidencia adversarial original. El coordinador ejecutará build y suite general después de integrar todos los puntos.

Limpieza: pestaña propia cerrada y puertos propios 4513/5513 verificados sin listeners; DATA_DIR preservado. Al terminar mediante SIGTERM, Node 24 en modo watch imprimió la aserción conocida de FSEventWrap/FSWatcher.close al cerrar watchers. No apareció durante el recorrido funcional.
