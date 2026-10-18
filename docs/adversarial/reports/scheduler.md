# Auditoría independiente: actualización automática, cadencia y backoff

Resultado: **PARTIAL — 15 PASS, 0 FAIL, 1 BLOCKED; ningún defecto confirmado.**

Se ejecutó el build existente en `http://127.0.0.31:4121`, con SQLite propia en `/tmp/30x-adversarial-scheduler`. La excepción autorizada permitió un runtime de `startDiscoveryScheduler` con `clock`, `discover` y `listBrands` inyectados. No se recompiló ni se modificó producción. No se leyeron informes ajenos ni credenciales reales.

## Comportamiento esperado y observado

| Caso | Esperado | Observado | Resultado |
|---|---|---|---|
| Cadencia mínima | Con intervalMs=1, ningún tick a 599999 ms; ejecutar a 600000 ms y respetar el límite siguiente | Conteos 0, 1, 1, 2 en las cuatro fronteras | PASS |
| No reentrada | Un descubrimiento pendiente bloquea ticks concurrentes | Tres llamadas a runOnce produjeron una entrada; repetición inmediata respetó cadencia | PASS |
| Elegibilidad | Omitir marcas sin fuentes activas y fuentes pausadas | Una sola marca/una fuente consultadas; marcas vacía y pausada sin metadata | PASS |
| Todos fallan | Duplicar espera y limitarla a 6 h; no ejecutar 1 ms antes | 20, 40, 80, 160, 320, 360, 360, 360, 360, 360 min; contador limitado a 8 | PASS |
| Éxito automático | Restablecer contador y cadencia | failures=0; siguiente intento en 10 min | PASS |
| Fallo parcial | Conservar el éxito y restablecer espera | Una referencia persistida, un error, failures=0 y 10 min | PASS |
| Excepción superior | Persistir pendiente y backoff | Actividad explica error; failures=1 y 20 min | PASS |
| stop | No ejecutar ticks posteriores | Cero llamadas y cero metadata | PASS |
| Disabled | DISCOVERY_ENABLED=false impide ejecutar | Cero llamadas y cero metadata | PASS |
| Reintento tras manual | Nuevo fallo preserva importación manual | Se ejecutó una vez y sobrevivieron 21 IDs públicos | PASS |
| UI después del éxito simulado | Mostrar y conservar procedencia/estado | Dos referencias SIMULADA, dos fuentes recientes y una pausada | PASS |
| UI después de fallo simulado | Mostrar error sin borrar referencias | Tras recarga, Requiere atención en ambas fuentes; detalle RSS SIMULADO en Configuración | PASS |
| UI después de recuperación parcial | Recuperar sólo la fuente exitosa y deduplicar | Dos referencias totales; 0 nuevas / 1 actualizada / 1 error; ui-primary recuperada | PASS |
| Manual público BBC | Importar mediante clic y persistir | 21 referencias, cero errores, fuente BBC; API y recarga concordaron | PASS |
| Manual y viejo deadline | Éxito posterior permite reintentar antes de 6 h | Control sintético ejecutó a manual + 10 min, antes del deadline antiguo | PASS |
| Manual público NASA | Obtener contenido real o recuperación verificable | Gate «No se permite acceder a direcciones privadas o reservadas»; sin contenido NASA | BLOCKED |

Las fechas y esperas del scheduler son **sintéticas**. Ninguna tabla implica que hayan transcurrido diez minutos, seis horas o semanas reales. Los descubrimientos automáticos pasan por `syncSources` real con RSS de prueba inyectado; sus títulos y fuentes llevan SIMULADA. El feed público BBC se consultó **sólo por la acción manual explícita en UI**, sin proveedor de pago.

## Observación de política, sin severidad

Un éxito manual posterior sí permite reintentar antes de la espera anterior, pero no borra la racha de fallos automáticos:

- La UI importó 21 referencias de BBC, con `lastSyncedAt=2026-10-18T02:28:20.537Z` y cero errores. Tras el siguiente fallo automático simulado, el contador pasó de 1 a 2 y la espera fue 40 min.
- Un control separado sembró historial sintético de 8 fallos / 6 h. Un éxito manual mediante `syncSources` con RSS simulado permitió el tick a manual + 10 min, antes del viejo deadline. El nuevo fallo conservó 8 fallos / 360 min.

La hipótesis experimental de «reinicio completo → primer fallo / 20 min» resultó falsa. No se encontró esa promesa explícita en PRODUCT, README o UI. [README.md:62](../../../README.md) garantiza espera progresiva; el comentario de `server/intelligence.mjs:1477` se refiere a superseder el intento/espera, y `:1497` conserva el contador anterior. Por ello la observación se registra **sin hallazgo P2 ni FAIL de producto**; requiere definición de política si se desea cambiarla. No se afirma que el éxito manual impida reintentar.

## Persistencia e interfaz

La interfaz nativa T3 se operó en la pestaña propia `tab_46_07e54779-9ab2-4979-8a15-674c4eff160a`. Después del tick simulado, la vista abierta seguía mostrando el estado anterior; al navegar/recargar `/radar` aparecieron las fuentes con atención y se conservaron las referencias. `/settings` mostró los mensajes completos. No se exigía una vista en vivo, por lo que esta necesidad de recarga no se clasifica como defecto.

Las referencias, estado de fuente y eventos de actividad se comprobaron también en la SQLite propia y en `/api/brands/scheduler-ui/state`, usando la sesión ficticia del navegador. La API reflejó sucesivamente 2 nuevas / 0 errores, 0 nuevas / 2 errores y 0 nuevas / 1 actualizada / 1 error. **La actividad quedó persistida y expuesta por API; no se observó un feed visual de actividad.** Tras el éxito manual público y el siguiente fallo simulado, los mismos 21 IDs continuaron presentes y la fuente pasó a atención.

## Evidencia y reproducción

- [Harness aislado](../evidence/scheduler-harness.mjs) y [traza de runtime](../evidence/scheduler-runtime.json).
- [Observaciones de UI/API](../evidence/scheduler-ui-observations.json).
- [Control sintético de deadline y racha](../evidence/scheduler-manual-reset-control.mjs), [salida](../evidence/scheduler-manual-reset-control.json).
- [Éxito automático simulado](../evidence/scheduler-ui-success.png), [fallo en radar](../evidence/scheduler-ui-failure-radar.png), [detalle de errores](../evidence/scheduler-ui-failure-settings.png), [recuperación parcial](../evidence/scheduler-ui-partial.png).
- [Éxito manual BBC público](../evidence/scheduler-manual-bbc-success.png), [persistencia después del fallo siguiente](../evidence/scheduler-manual-after-failure.png).

Para reproducir: en la raíz del repo, iniciar el harness con `DATA_DIR=/tmp/30x-adversarial-scheduler DISCOVERY_ENABLED=true` y una contraseña ficticia nueva en `QA_SCHEDULER_PASSWORD`; eliminar del entorno las cuatro claves de proveedor indicadas en BRIEF. El harness requiere el build existente, crea fixtures propias y aparca el timer; `/__scheduler` sólo existe en ese runtime de prueba. POST de acciones JSON, en orden: `suite`, `ui-success`, `ui-failure`, `ui-partial`, `manual-prepare`. Iniciar sesión ficticia por UI, recargar después de los ticks y editar NASA→BBC en Configuración; pulsar Buscar tendencias. Después, `manual-after` produce el fallo simulado posterior. El control adicional se ejecuta como script aparte con el mismo DATA_DIR. No desplegar este harness ni tratar su endpoint de control como una API del producto.

## Límites y limpieza

No se probó ejecución desatendida real, callbacks de timer durante diez minutos, reinicios ni múltiples workers. Todos los ticks automáticos se activaron con `runOnce` y no hicieron tráfico externo. NASA quedó sin importar; BBC sí se leyó en una acción manual pública real. No se usaron IA, Apify, cuotas pagas ni claves reales. El reloj inyectado gobierna la decisión del scheduler; las fechas persistidas por `syncSources` siguieron el reloj de pared.

Los PIDs propios 3923850, 3925681 y 3926878 terminaron; la comprobación final de `ps` no los encontró. Se cerró únicamente la pestaña propia con `t3_preview_close`. La base temporal y la evidencia se conservaron. El informe JSON incluye los valores detallados y las limitaciones.
