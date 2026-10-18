# audience-1 — corregido; pendiente integración

El formulario aceptaba tres espacios como `required` y el servidor los recortaba sin exigir contenido en rol/necesidades. La reproducción propia por UI cerró el modal y persistió ambos campos vacíos con PATCH 200. El test de regresión se ejecutó antes del cambio: 1 PASS, 6 FAIL; el caso original falló con `200 !== 400`.

Ahora nombre, rol y necesidades deben contener texto tras `trim()`, con límites de 150/300/3000. El servidor aplica el contrato en altas POST/PATCH y filas modificadas. Compara id y campos del perfil contra su versión persistida: una fila legacy intacta no bloquea un cambio de empresa ni la edición de otra fila; al modificarla exige completar rol y necesidades. `audience: []` sigue permitido.

El formulario mantiene `required`, valida antes de enviar, conserva los valores para corregirlos y enfoca el campo marcado con `aria-invalid` y un error asociado. Conserva también la descripción original al editar. Se mantienen los estados de guardado y recuperación por error.

Verificación:

- `node --test tests/remediation-audience-1.test.mjs`: **7 PASS**. Incluye ASCII/Unicode, campos ausentes/nulos, rechazo atómico, límites exactos, POST/PATCH, corrección posterior y compatibilidad legacy.
- `node --test tests/remediation-audience-1.test.mjs tests/core.test.mjs tests/audience-insights.test.mjs`: **34 PASS**.
- `npx tsc --noEmit`: **exit 0**.
- HTTP propio: mismos tres espacios → **400**, audiencia idéntica antes/después.
- UI propia: blancos → modal abierto, textos intactos, foco en rol y **0 PATCH**. Corregir rol señala necesidades; nombre con espacios Unicode y necesidad de 3001 caracteres también se rechazan conservando el texto. Corregir permite un único guardado recortado, comprobado por GET state y recarga.
- Edición con descripción existente: rechazo local y **503 simulado explícitamente** conservan entradas; reintento real persiste la necesidad corregida y la descripción. PATCH retenido y liberado verifica `aria-busy`, controles deshabilitados y una sola petición.
- Escritorio 1280×800 y viewport móvil 390×844: error/foco legibles, modal dentro del viewport y sin desbordamiento horizontal.

Evidencias: [antes](../evidence/audience-1-before.png), [rechazo escritorio](../evidence/audience-1-after-desktop.png), [rechazo móvil](../evidence/audience-1-after-mobile.png), [estado sanitizado](../evidence/audience-1-state.json), [detalle JSON](audience-1.json).

Datos sintéticos; sin proveedores externos, build global ni detector de diseño. La fila vacía creada antes del arreglo se conserva deliberadamente en la base aislada como caso legacy; no se migran registros existentes. Se probó viewport móvil, sin dispositivo físico ni lector de pantalla.

Recursos propios cerrados: pestaña `tab_4b_07e54779-9ab2-4979-8a15-674c4eff160a`, sesión dev 4410 y puertos 4503/5503. El watcher nativo de Node mostró una aserción al cerrarse; el proceso terminó y `ss` confirmó ambos puertos sin listeners. Base exclusiva conservada en `/tmp/30x-remediation-audience-1`.
