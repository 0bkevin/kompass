# navigation-2 · Descarte de fuente con cambios

Estado: **fixed**, pendiente del recorrido integrado del coordinador.

Settings descartaba el borrador con `setSource(null)` al cerrar el modal. No comparaba el formulario con un baseline ni registraba la guardia de cambios sin guardar. El modal compartido sí enviaba Escape, fondo y Cerrar a `onClose`; la decisión faltaba en Settings.

Ahora esos cierres y Cancelar usan una única confirmación. La misma guardia se registra con `registerUnsavedChangesGuard` para navegar, cambiar de empresa y recargar. El baseline se toma del borrador normalizado al abrir. Rechazar deja todos los campos intactos; aceptar o guardar limpia la guardia. Abrir sin editar o revertir todos los cambios no genera avisos.

El guardado adquiere un cerrojo síncrono antes de esperar la API. Mientras está ocupado, el formulario deshabilita sus campos y bloquea cierres, nuevas aperturas, navegación y envíos duplicados. Un error conserva la edición y permite reintentar. Se conservaron los payloads y handlers de tipo/plataforma de sources-1 y sources-2. No se modificaron credenciales, persistencia de conectores ni `sourceInput`.

## Reproducción y verificación

La reproducción se hizo **antes de editar** en una pestaña propia T3, incognito, `http://127.0.1.35:5525/settings`, API 4525, `DATA_DIR=/tmp/30x-remediation-navigation-2`, descubrimiento desactivado y claves de proveedor eliminadas del entorno. Datos ficticios: espacio de ejemplo y una segunda marca sintética. Resoluciones CSS: 1280 × 800 y 390 × 844.

Comprobación inicial: Añadir fuente → escribir **Fuente sintética sin guardar** → Escape → inspeccionar diálogo y modal. Resultado **FAIL**: `dialog:null`, modal cerrado y nombre inaccesible. Las dos capturas iniciales documentan el descarte.

| Recorrido comprobado después | Resultado |
| --- | --- |
| Escape | Confirmación nativa; rechazar conserva nombre y modal; aceptar descarta. |
| Clic fuera, Cancelar y Cerrar | Confirman; rechazar conserva nombre, tipo, URL y checkbox idénticos. |
| Navegación interna | Rechazar conserva /settings y formulario; aceptar abre /home y descarta. |
| Cambio de empresa | Rechazar conserva selector, marca y formulario; aceptar abre Sur y cierra edición. |
| Recargar | beforeunload nativo; rechazar conserva todos los campos; aceptar recarga y descarta. |
| Abrir/cerrar sin editar | Fuente nueva y fuente guardada cierran sin advertencias falsas. |
| Guardado demorado | Dos submits producen 1 POST; campos deshabilitados; cierres y navegación bloqueados. Al liberar se guarda 1 fuente. |
| Error 503 simulado y reintento | Error explícito con formulario intacto y editable; retry guarda correctamente. |
| Navegar/recargar después de guardar | Sin advertencias residuales; la fuente guardada permanece tras recarga. |
| Escritorio y móvil | Modal y acciones visibles, foco en diálogo. Documento 390 px y modal 370 px en móvil, sin overflow horizontal. |

Las acciones de navegación y selector se activaron desde DOM en la pestaña propia para alcanzar los handlers situados bajo el overlay. Se inspeccionaron y resolvieron sus confirmaciones nativas con `preview_status` y `preview_dialog`. La recarga fue real mediante `location.reload()`. Un `preview_press` de Escape tras el arreglo agotó su espera porque el confirm permanecía abierto; el estado nativo y su resolución se comprobaron inmediatamente.

Se simularon únicamente una demora del POST local y un 503 del PATCH local de fuente. El POST retenido se liberó hacia la API local y fetch se restauró tras el 503, antes del reintento. No hubo consultas ni gasto de proveedores externos.

```bash
node --test tests/remediation-navigation-2.test.mjs tests/remediation-sources-1.test.mjs tests/remediation-sources-2.test.mjs
```

**17/17 PASS**: 5 pruebas conductuales del controlador y 12 de normalización/persistencia de sources-1/sources-2. Las pruebas nuevas ejercitan decisiones, baseline, todos los campos, reversión, bloqueo síncrono y recuperación; no comparan JSX. El chequeo sintáctico dirigido con TypeScript `transpileModule` sobre Settings devolvió 0 diagnósticos.

## Archivos y evidencia

Código: `src/features/Settings.tsx`, `src/lib/source-draft-guard.mjs`, `src/lib/source-draft-guard.d.mts` y `tests/remediation-navigation-2.test.mjs`.

- Antes: [edición](../evidence/navigation-2-before-edit.png), [Escape descarta](../evidence/navigation-2-before-discard.png).
- Después: [rechazar Escape](../evidence/navigation-2-after-escape-rejected.png), [rechazar recarga](../evidence/navigation-2-after-reload-rejected.png), [busy](../evidence/navigation-2-busy.png), [guardado](../evidence/navigation-2-after-save.png).
- Inspección visual: [escritorio](../evidence/navigation-2-desktop.png), [móvil](../evidence/navigation-2-mobile.png).
- Registro estructurado: [comprobaciones de navegador](../evidence/navigation-2-browser.json), [informe JSON](navigation-2.json).

No se ejecutaron build ni format global ni se tocaron dependencias. El coordinador debe realizar la compilación y comprobación integrada. No se verificaron proveedores reales.

Pestaña propia cerrada y sesión 18588 detenida; puertos 4525/5525 libres. Al detener Node --watch apareció una aserción nativa en FSWatcher.close después de cambios externos del servidor; la sesión terminó. Ocurrió después de las comprobaciones funcionales y no se modificó el servidor para tratarla.
