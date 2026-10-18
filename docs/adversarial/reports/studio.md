# Generación y edición de borradores · Studio

**Resultado: FAIL.** 14 casos: 9 PASS, 3 FAIL, 2 BLOCKED. Un hallazgo confirmado P2; ninguno P1. La generación se completa y los metadatos son correctos, pero el texto de la estructura local no cumple el formato ni la dirección editorial. La edición, persistencia, exportación y protección ante conflicto funcionaron en las pruebas realizadas.

Revisión independiente del 18 de octubre de 2026 sobre la build existente, en `http://127.0.0.22:4112`, sin ejecutar build, modificar implementación ni usar claves. Se leyeron PRODUCT.md, docs/TRANSCRIPT-TO-PRODUCT.md, README.md y docs/IMPLEMENTATION.md. No se consultaron informes ajenos.

La cuenta ficticia fue `qa-studio@example.com`. Los datos propios son sintéticos: marca “Laboratorio Faro · fixture sintética”, dos segmentos con necesidades diferentes (operaciones de librerías y docentes rurales), una referencia con una frase canario y un recurso de texto. No son datos reales ni evidencia de precisión de IA. La marca y la referencia se prepararon por API; todas las acciones auditadas de crear, editar, guardar, exportar y resolver conflictos se ejecutaron mediante T3 preview en la pestaña propia.

## Hallazgo confirmado

### studio-1 · P2 · La estructura local pega instrucciones editoriales y no aplica el formato ni el CTA pedidos

**Esperado:** incluso una estructura preliminar debe reflejar el formato elegido y usar la dirección editorial sin presentarla como texto para publicar. Si no puede aplicarla, debe exponer esa limitación de manera concreta.

**Reproducción:**

1. Sin claves de IA, entrar en Contenido → Crear contenido.
2. Elegir Carrusel, Instagram y “Jefas de operaciones de librerías”.
3. Pedir cuatro láminas con títulos concretos, un ejemplo hipotético y CTA final exacto “Descarga la plantilla de inventario.”.
4. Preparar el guion y leer el cuerpo y Llamado a la acción.

**Observado:** la pieza queda guardada como `carousel/instagram/qa-ops`, pero devuelve cinco bloques genéricos. El guion contiene literalmente “Dirección editorial: … Haz un carrusel de 4 láminas … CTA final exacto: …”. No desarrolla cuatro láminas ni el ejemplo; el CTA real es “Comparte qué caso quieres poner a prueba.”.

Se reprodujo también desde una referencia con Reel/TikTok para docentes: cambian el nombre de audiencia y la necesidad, pero siguen cinco escenas genéricas, instrucciones pegadas y CTA fijo. Desde Oportunidades, al elegir Newsletter/LinkedIn, el texto conserva además “Crear un post original…” junto a las instrucciones de newsletter, sin asunto, saludo ni las secciones solicitadas.

La UI identifica honestamente el motor como **Estructura local**. Ese aviso pasa; no convierte en correcta la salida. La edición manual permite recuperar el flujo, por lo que se clasifica P2.

Evidencia principal: [captura de instrucciones y CTA](../evidence/studio-directions-and-cta.png), [generaciones originales](../evidence/studio-generated.json), [reel desde referencia](../evidence/studio-local-reference.png), [newsletter desde oportunidad](../evidence/studio-opportunity-newsletter.png), [respuestas de acciones UI](../evidence/studio-ui-responses.json).

Apoyo para localizar la causa, después de reproducirla: `server/intelligence.mjs:1861` usa los mismos cinco pasos; `:1865` concatena las instrucciones; `:1873` fija el CTA; `:1874` convierte cada paso en una escena sin ramificar por formato. `src/features/Journey.tsx:830` antepone la adaptación original de la oportunidad aunque se cambie el formato. No se corrigió código.

## Casos probados

| Caso | Resultado | Comparación entre esperado y observado |
| --- | --- | --- |
| Aviso sin proveedor | PASS | Antes de crear anuncia estructura local; el editor muestra esa etiqueta y `generationEngine=heuristic`. No se presenta como IA real. |
| Idea propia: Carrusel/Instagram | FAIL | Esperadas cuatro láminas y CTA solicitado; observados plantilla genérica, instrucciones pegadas y CTA fijo. |
| Referencia: Reel/TikTok/docentes | FAIL | Esperadas tres escenas sobre clases sin conexión; observadas cinco escenas genéricas e instrucciones pegadas, con CTA distinto. |
| Oportunidades: Newsletter/LinkedIn | FAIL | Esperados asunto, saludo y secciones; observados plantilla y mandato de “post” junto al de newsletter. Sí abre la pieza creada y conserva los metadatos correctos. |
| Audiencia, necesidad, español y hechos | PASS | Los dos segmentos y sus necesidades aparecen en los textos respectivos. Se conserva la URL de referencia; no se copia la frase canario ni se inventan cifras/testimonios. Sólo cubre estas muestras. |
| Ocho campos editados y recarga | PASS | Título, gancho, guion, caption, CTA, audiencia, canal y responsable mantuvieron los valores tras guardar y recargar. El guion manual de tres escenas permaneció íntegro. |
| Recurso asociado | PASS | Seleccionar `qa-ficha-studio.txt` desde Recursos y guardar mantuvo el checkbox marcado después de recargar y el ID en `assetIds`. |
| Cancelar salida del editor | PASS | Con un título local pendiente, “Todas las piezas” pide confirmar descarte. Cancelar conserva ruta y texto local. |
| Conflicto y descarte explícito | PASS | Una escritura API propia simuló editor B. Guardar desde UI devuelve 409, conserva ambas versiones y bloquea guardar. Cancelar descarte mantiene local; confirmar carga servidor. |
| Título vacío y CTA de 2001 caracteres | PASS | Las acciones UI devuelven 400, sin sustituir la versión guardada ni perder la edición. Tras corregir, guardar devuelve 200. |
| Instrucciones de 10001 caracteres | PASS | Crear por UI devuelve 400, conserva los 10001 caracteres y no aumenta las tres piezas existentes. |
| Exportar pieza editada | PASS | Descarga Markdown de 530 bytes con los textos manuales, Reel, youtube y la URL de origen correctos. |
| Editar formato/escenas por separado | BLOCKED | La build no ofrece esos controles en el editor; el guion sí es editable como texto. No se simuló cobertura UI escribiendo esos campos por API. |
| Proveedor real de IA | BLOCKED | Sin credenciales. Se probó únicamente la estructura local y su identificación. No se probaron calidad, errores ni recuperación de una integración real. |

Las expectativas y resultados completos de cada caso están en [studio.json](studio.json).

## Evidencias y límites

[Estado final de marca y piezas](../evidence/studio-final-state.json), [diario de observaciones](../evidence/studio-observations.json), [conflicto visible](../evidence/studio-conflict.png), [límite de instrucciones](../evidence/studio-instruction-limit.png) y [Markdown exportado](../evidence/studio-piece-export.md). Los originales de las dos primeras generaciones se preservaron antes de editar; el estado final se guarda aparte.

No se validó IA, publicación, aprobación ni calendario. No se usaron mocks como integración real. El conflicto empleó una segunda escritura autorizada de la misma cuenta, no dos personas reales. La URL example.com es una procedencia sintética, no una extracción pública validada. Se revisó español, sin afirmar soporte multilingüe universal.

Datos de reproducción conservados en `/tmp/30x-adversarial-studio`. Proceso propio: PID 3869535, sesión 71929, puerto 4112; pestaña propia: `tab_3x_07e54779-9ab2-4979-8a15-674c4eff160a`. Ambos se cerraron al concluir; no se operaron ni cerraron recursos ajenos.

