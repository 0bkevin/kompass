# sources-2 · YouTube→Apify conserva plataforma incompatible

Estado: **fixed**, pendiente de integración del coordinador. Responsable: `fix_sources_2`. Datos sintéticos, runtime aislado `127.0.1.28`, API4518/web5518 y `DATA_DIR=/tmp/30x-remediation-sources-2`.

## Causa y corrección

El cambio de tipo conservaba `platform=youtube`. El select nativo de Apify aparentaba Instagram, la etiqueta condicional decía TikTok y el payload enviaba YouTube; el servidor lo rechazaba correctamente. El borrador ahora inicializa una plataforma compatible tanto al abrir el editor como al cambiar el tipo. Instagram↔TikTok limpia la URL de la red anterior sin interpretar equivalencias de handles y conserva la consulta aplicable.

En `sourceInput`, un cambio de tipo de fuente existente con `platform` omitida inicializa una plataforma compatible. Los PATCH del mismo tipo conservan configuración y los valores explícitos incompatibles siguen rechazados. Se conservó íntegra la normalización de query/URL de sources-1. No se cambiaron los guards del modal asignados a navigation-2.

## Reproducción original: rojo→verde

Se creó por UI una fuente YouTube pausada con consulta y **canal persistido `https://www.youtube.com/@publicqa`**. Al editar→Apify se escribió una consulta y se guardó **sin tocar Red social**.

- Antes: Instagram visible, etiqueta URL de TikTok, PATCH400 con `platform=youtube`; GET mantuvo el YouTube original y su URL. [Datos](../evidence/sources-2-before.json), [captura](../evidence/sources-2-before-desktop.png).
- Después, partiendo de ese mismo YouTube guardado: URL anterior vacía automáticamente, Instagram visible, etiqueta URL de Instagram, PATCH200 `platform=instagram`; GET confirmó mismo ID/nombre, consulta guardada y pausa. Se registró sólo el evento de selector **Tipo de fuente**, sin evento de **Red social**. [Datos y payload](../evidence/sources-2-after-desktop.json), [formulario](../evidence/sources-2-after-desktop-form.png), [fila](../evidence/sources-2-after-desktop-row.png).

También se comprobó el alta aún no guardada YouTube→Apify: POST201 con Instagram y URL vacía. Los recorridos Instagram→TikTok con URL Instagram previa→Instagram→YouTube guardaron con PATCH200 y GET coherentes; las URLs incompatibles se limpiaron y las consultas se conservaron. [Transiciones, POST y móvil](../evidence/sources-2-transitions.json).

En viewport iPhone12Pro390×844 se repitió el cambio de un YouTube persistido a Apify y el guardado sin re-seleccionar plataforma. Label, payload y GET coincidieron; tras recargar y reabrir siguieron correctos, sin overflow horizontal ni errores de consola. [Formulario móvil](../evidence/sources-2-after-mobile-form.png), [fila móvil](../evidence/sources-2-after-mobile-row.png), [persistencia](../evidence/sources-2-reload.json).

Los proveedores siguieron `configured=false`. Guardar fuente pausada funcionó, mientras checkbox y botón Activar permanecieron deshabilitados con explicación Apify/YouTube según el tipo. No se ejecutaron consultas de descubrimiento.

## Verificación

| Comprobación | Antes | Después |
| --- | --- | --- |
| `node --test tests/remediation-sources-2.test.mjs` | 2 fallos/3 pases | 5/5 PASS |
| `node --test tests/remediation-sources-1.test.mjs tests/social.test.mjs tests/core.test.mjs` | Tests existentes preservados | 29/29 PASS |
| `./node_modules/.bin/tsc --noEmit --incremental false` | — | Exit0 |
| UI desktop/móvil por T3 preview | PATCH400 original | PATCH200 y POST201; GET y reload correctos |

La prueba HTTP parte de URLs YouTube/TikTok guardadas y cambia el tipo omitiendo tanto plataforma como URL: la URL heredada desaparece y la plataforma se inicializa correctamente. También comprueba metadatos/historial, mismo ID, límite, query, pausa, PATCH parcial, rechazo atómico de plataformas/URLs explícitas incompatibles y permisos de revisor. El transporte externo está prohibido en el fixture. [Rojo](../evidence/sources-2-red.tap), [verde](../evidence/sources-2-green.tap), [cercanos](../evidence/sources-2-nearby.tap).

Archivos de producto: `src/features/Settings.tsx` y `server/core.mjs`; pruebas propias: `tests/remediation-sources-2.test.mjs`. Se aplicaron Impeccable craft-floor/harden en modo Operate y Diagnosing Bugs. No hubo launcher, detectores, build global, dependencias, commits ni subagentes.

## Límites y cierre

No se acredita extracción, entrega ni cobertura de un proveedor real. Móvil usa Chromium con viewport emulado, no dispositivo físico. La integración/build final corresponde al coordinador.

Se cerraron sólo la pestaña y procesos propios. Los puertos4518/5518 quedaron sin listeners y no quedaron procesos con el DATA_DIR asignado. Durante SIGTERM, Node24 --watch imprimió una aserción interna FSEventWrap; se comprobó igualmente el cierre completo. [Runtime](../evidence/sources-2-runtime.json), [cleanup](../evidence/sources-2-cleanup.json).
