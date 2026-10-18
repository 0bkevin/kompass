# navigation-1 · Audiencia conserva la edición al rechazar la salida

Estado: **fixed**, pendiente de comprobación integrada del coordinador. Datos ficticios y SQLite temporal propios; sin proveedores externos.

## Causa y corrección

`AudiencePage` sólo consultaba un booleano local en `closeEditing`. No registraba la guardia que `App` usa para navegación y `beforeunload`. Además, revertir un campo no limpiaba ese booleano.

Se registra una guardia con el cleanup de `registerUnsavedChangesGuard`, sin crear listeners ni otro sistema de navegación. Se compara el `FormData` actual con un baseline capturado del formulario montado. Escape, fondo, cerrar, Cancelar, navegación y cambio de empresa usan una misma decisión; rechazar no toca el formulario ni los errores. La ref de guardado se bloquea síncronamente para evitar descartes y peticiones duplicadas antes del siguiente render. Guardar o descartar confirmado limpia el estado. Se mantienen la validación de audience-1 y los cambios de company-1; no se toca `BrandFields`.

## Rojo y verde del síntoma original

En `http://127.0.1.30:5520/audience`, abrir Nueva audiencia, escribir **Audiencia PERDER AL RECARGAR** y llamar `preview_navigate` con la misma URL:

- Antes: recarga sin diálogo; `modal=false`, `input=null`, `lost=true`.
- Después: `preview_status` muestra el diálogo nativo `type=beforeunload`. Rechazar mediante `preview_dialog(accept:false)` conserva el modal y el valor. El recorrido mínimo con sólo nombre se repitió sobre el código final.

[Antes de recargar](../evidence/navigation-1-before-form.png) · [Pérdida antes del arreglo](../evidence/navigation-1-before-reloaded.png) · [Después de rechazar recarga](../evidence/navigation-1-after-reload-cancelled.png) · [Error e inputs conservados](../evidence/navigation-1-after-error-preserved.png).

Los diálogos nativos hacen que `preview_navigate` o `preview_press` puedan devolver timeout. Se comprobó el diálogo en `preview_status`, se resolvió con `preview_dialog` y se verificó el DOM posterior; el timeout no se contó como resultado de producto.

## Recorridos adicionales comprobados

| Recorrido | Resultado |
|---|---|
| Rol con tres espacios, necesidades y nombre; rechazar recarga, Escape, fondo, cerrar, Cancelar, Inicio o cambio Norte→Sur | Conserva todos los valores, error obligatorio y aria-invalid; conserva ruta y empresa. |
| Corregir rol y guardar | Un perfil persistido en Norte; Sur conserva el propio. Modal cerrado y recarga sin advertencia. |
| Nuevo sin editar, nuevo editado/revertido, existente sin editar y existente editado/revertido | Sin advertencia falsa al cerrar o recargar. |
| PATCH retenido explícitamente en el navegador y dos submits en el mismo turno JS | Una petición. Modal y campos bloqueados; intentos de salida interna y cambio de marca no descartan. Recarga sí avisa; al rechazar y liberar, guarda una vez. |
| 503 sintético de PATCH | Conserva necesidades y error al rechazar salida; permite reintento real. Sur se actualiza y Norte permanece intacta. |
| Descarte confirmado en Cancelar, cambio de empresa y navegación a Inicio | No escribe la edición descartada; cierra el modal y no deja advertencias tras navegar/desmontar/recargar. |

`node --test tests/remediation-audience-1.test.mjs tests/audience-insights.test.mjs`: **20 PASS, 0 FAIL**. Diagnóstico TSX de `Brand.tsx` con `typescript.transpileModule`: PASS. No se ejecutó build ni format global.

No se añadió un test Node que repita JSX/constantes: el fallo depende del formulario montado y del mecanismo de `beforeunload` de App/TanStack. La comprobación de regresión se realiza en esa seam real mediante T3, con evidencia roja y verde. No se introdujo un helper de guardia nuevo.

## Entorno y límites

Runtime exclusivo API 4520 / web 5520, host 127.0.1.30, `DATA_DIR=/tmp/30x-remediation-navigation-1`, `DISCOVERY_ENABLED=false`, sin claves de proveedores. Cuenta `qa-navigation-remediation@example.com`; marcas Norte `ca3e120a-5cb8-4a9c-9d61-5ce1507492ff` y Sur `ac640987-b921-4e26-84ea-9091550bfc86`. Datos ficticios. La retención PATCH y el 503 se simularon sólo en la pestaña propia; se restauró `fetch` antes de terminar. Las escrituras finales/lecturas de aislamiento usaron el API y la base temporal reales.

Navegador T3/Chromium a 1280×800. No se probó cierre físico de pestaña ni otros motores. Un usuario puede confirmar el `beforeunload` nativo durante guardado; se bloquean los descartes internos y se advierte de la recarga. Typecheck completo y build integrado quedan al coordinador.

Runtime propio terminado y pestaña propia cerrada. Puertos 4520 y 5520 sin listeners al terminar.
