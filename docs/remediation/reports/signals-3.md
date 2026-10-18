# signals-3 — límite del tema coherente

**Estado: corregido. Responsable: fix_signals_3.**

El formulario permitía161caracteres y los enviaba como una entrada válida, aunque el servidor admite160. El campo ahora impide superar160 y muestra «Máximo160caracteres» mediante ayuda asociada con `aria-describedby`. No cambia el servidor.

La comprobación móvil reveló además que guardar A×160 o B×160 hacía desbordar el listado. Con autorización del coordinador se añadió `overflow-wrap:anywhere` únicamente a títulos y observaciones de `.journey-signal`: se muestran completos, con enlaces y acciones en su región.

| Comprobación | Resultado observado |
| --- | --- |
| Rojo: UI con A×161 | HTML válido, maxLength200; servidor400 y0señales, conservando el formulario. |
| Verde: misma entrada nativa | Queda en160; pulsar otra tecla no excede el límite. Nota, cita y muestra se conservan. Guardar persiste A×160 exactas, una sola señal. |
| HTTP directo161/160 | 161→400 sin mutación (1→1);160→201 exacto (1→2). |
| Unicode y teclado | É×158+🚀+X queda en160 unidades UTF16, con emoji íntegro. Tab enfoca la nota con outline3px; Shift+Tab y Enter guardan una sola señal (2→3). |
| Móvil390 | Campo16px, ayuda visible; documento390/390, filas358/358 después de partir texto continuo. Cita y eliminar dentro del viewport. |
| Recarga y confirmación | Las3señales conservan IDs y campos. D×161 se limita a160 y guarda una nueva (3→4,4 IDs únicos); formulario vacío al éxito, documento390/390. |
| Tests cercanos | 35/35 PASS,0fallos/cancelaciones/omisiones. |
| TypeScript | `tsc --noEmit --incremental false`: salida0. |

La [evidencia estructurada](../evidence/signals-3/observed.json) conserva valores sintéticos antes/después, respuestas HTTP, conteos e IDs. [Captura antes](../evidence/signals-3/before-161-rejected-server.png), [límite corregido](../evidence/signals-3/after-160-limited-ui.png), [formulario móvil](../evidence/signals-3/mobile-390-unicode-form.png), [listado móvil completo](../evidence/signals-3/mobile-390-wrapped-persisted-signals.png), [tests](../evidence/signals-3/nearby-tests.log).

Se editan sólo el hunk AudienceSignalForm de Journey.tsx y los estilos de texto de SignalRow en journey.css. No se modifica privacidad, permisos, aislamiento, guardias de cambios, hook compartido, sensor ni resultados. No se añade un test que copie una constante de JSX: la verificación atraviesa la entrada nativa, envío, API y persistencia reales.

La cuenta y el corpus son ficticios; no hubo proveedores ni claves externas. Móvil significa Chromium con viewport emulado, sin dispositivo físico ni Safari. El límite sigue contando unidades UTF16 igual que HTML y servidor. El coordinador realizará el build integrado.

La pestaña propia y procesos se cerraron; puertos4522/5522 sin listener. Node24 --watch imprimió una aserción FSEventWrap durante SIGTERM, un fallo del cierre del watcher; se confirmó que no quedó proceso. Tras recargar, un selector con el nombre antiguo de la pestaña agotó su espera porque ahora incluía el contador; se corrigió con el aria-ref nuevo y se completó el guardado final.
