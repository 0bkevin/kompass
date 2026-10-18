# studio-1 · Generación local con formato y brief separado

**Estado: corregido; pendiente de integración final del coordinador.**

La causa era la composición de cinco bloques idénticos en `createDraft`: el formato sólo cambiaba metadatos, las instrucciones podían convertirse en título y cuerpo y el CTA era fijo. El nuevo `localDraft` produce láminas, escenas, newsletter o párrafos según el formato. Usa la necesidad concreta de la audiencia en un texto breve y pasos editables.

## Contrato nuevo

El generador local aplica un conjunto deliberadamente limitado: tema, formato, CTA exacto, cantidad de láminas/escenas y ejemplo hipotético. Se conserva el valor anterior de cinco unidades por defecto; una petición de cuatro láminas o tres escenas se aplica. Los campos explícitos prevalecen sobre las notas.

La sintaxis documentada admite `4 láminas`, `3 escenas`, `CTA final exacto: «Texto.»`, `ejemplo hipotético` y `secciones: Registrar y Revisar`. Las cantidades admitidas son de tres a ocho; una cantidad fuera de rango deja una nota visible y utiliza cinco. Las restricciones adicionales no se presentan como entendidas.

`piece.editorialBrief` conserva `instructions`, `angle`, `audienceNeeds`, `referenceUrl`, `applied` y `notes`. Los textos libres íntegros quedan en un disclosure separado de los campos publicables, con revisión manual explícita. La necesidad se resume en el contenido y se conserva completa en el brief. El exportador existente sigue usando los campos publicables.

El coordinador actualizó explícitamente cuatro casos antiguos de tres archivos que exigían pegar instrucciones/adaptaciones en el guion. Se mantienen las pruebas de 10.000 caracteres de instrucciones, contexto de 5.000 y necesidad de 3.000, todos los límites, validación de proveedor y guardado roundtrip; los textos completos ahora se comprueban en el brief. No se ocultaron las caídas: la ejecución intermedia está en `studio-1-nearby.txt`.

## Rojo y verde

- `node --test tests/remediation-studio-1.test.mjs`: inicialmente cuatro fallos, incluidos los tres recorridos originales y el contexto largo. [Salida roja](../evidence/studio-1-red.txt).
- La suite nueva termina con ocho casos: idea propia, referencia, oportunidad, contexto largo, prioridad de controles, CTA con otra instrucción posterior, post/negación de ejemplo y validación sin persistencia.
- `node --test tests/remediation-studio-1.test.mjs tests/draft-contract.test.mjs tests/intelligence.test.mjs tests/social-intelligence.test.mjs tests/integrated-flow.test.mjs tests/piece-draft.test.mjs tests/workflow-recovery.test.mjs`: **57/57**, exit 0. [Salida verde](../evidence/studio-1-green.txt).
- `node --check server/intelligence.mjs`: exit 0.

## Recorrido original en navegador

En la pestaña propia de T3 y `http://127.0.1.22:5512`, las acciones de crear, editar, guardar y recargar se realizaron mediante UI. Se capturaron las respuestas reales de la API, sin credenciales ni cookies.

1. **Idea propia, Carrusel/Instagram/operaciones:** cuatro láminas y CTA exacto «Descarga la plantilla de inventario.». La necesidad de inventario y el ejemplo hipotético aparecen en el contenido; el canario editorial queda únicamente en el brief.
2. **Referencia, Reel/TikTok/docentes:** tres escenas, necesidad de clases sin conexión y CTA exacto «Guarda esta guía para tu próxima clase.». Se conserva referencia y URL; no se copia la frase canario de la fuente ni «Crear un post original».
3. **Oportunidades, Newsletter/LinkedIn:** asunto, saludo y secciones Registrar/Revisar, con CTA exacto «Responde FICHA para recibir la plantilla.». El mandato previo de post se conserva en el brief y queda fuera de título, guion y caption.
4. **Guardado y recarga:** el CTA manual «CTA revisado de QA.» persiste con el guion y el brief exactos.
5. **Viewport móvil 390 × 844:** ningún desborde de página/modal y los nueve controles a 16 px. Una creación por UI con campos explícitos aplica tres láminas, CTA nuevo y omisión de ejemplo, aunque las notas pedían ocho y un ejemplo.

[Respuestas y comprobaciones](../evidence/studio-1-browser.json), [brief separado](../evidence/studio-1-carousel-brief.png), [newsletter](../evidence/studio-1-newsletter.png), [controles móviles](../evidence/studio-1-mobile-controls.png).

## Alcance y recursos

Se tocaron sólo helpers locales/generación en `server/intelligence.mjs`, `NewDraft` y disclosure del brief en Studio, el tipo opcional de Piece y el test nuevo. Los cambios de expectativas antiguas pertenecen al coordinador. No se tocaron publicación, decodificación HTML, conectores de fuentes, canales ni permisos.

Marca, cuenta y referencia son ficticias. La referencia analizada se preparó en SQLite como fixture sintética; no se acredita extracción de example.com. No se usaron claves ni modelos reales, ni se publicó contenido. La estructura local no promete comprensión semántica arbitraria. Los tests de proveedor incluidos usan simulaciones.

No se ejecutó build ni formato global; sólo se formatearon los rangos propios de helpers y NewDraft y el archivo de regresión nuevo. La integración final corresponde al coordinador. Móvil es un viewport emulado de escritorio.

Pestaña `tab_49_07e54779-9ab2-4979-8a15-674c4eff160a` cerrada; sesión `46789` detenida; puertos `4512/5512` confirmados sin escuchas. La detención de Node --watch emitió una aserción FSEventWrap; los recorridos habían terminado y ambos procesos se cerraron. Datos de reproducción conservados en `/tmp/30x-remediation-studio-1`.
