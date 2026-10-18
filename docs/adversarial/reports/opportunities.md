# Revisión independiente: Oportunidades

Estado: **FAIL**. 18 casos: **16 PASS, 2 FAIL, 0 BLOCKED**. Dos hallazgos confirmados P2; ninguno P1 o P3.

Revisión interactiva del build existente el 18 de octubre de 2026, en http://127.0.0.19:4109/opportunities. Base propia `/tmp/30x-adversarial-opportunities`, proceso PID 3852545, sesión exec 69217, pestaña T3 `tab_3u_07e54779-9ab2-4979-8a15-674c4eff160a`. Cuenta ficticia `qa-opportunities@example.com`. No se modificó implementación, build, estilos, credenciales ni bases ajenas.

## Datos y método

Se leyó PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md, y se usaron README y docs/IMPLEMENTATION.md sólo para aclarar límites. Se arrancó sin claves OpenAI/Gemini/YouTube/Apify y con DISCOVERY_ENABLED=false. Cuenta y marca vacía por API propia; fixtures de referencias y snapshots mediante SQLite propia. Las acciones examinadas se ejecutaron por herramientas nativas T3: filtros, búsqueda, expansión, consulta de evidencias, dos capturas repetidas, cambio de marca y creación de borrador. Se comprobaron estados después de cada acción y tras recargar; API/SQLite complementan la evidencia visual.

**Todos los datos son sintéticos, incluso las referencias con isDemo=false.** Las ventanas históricas se sembraron para simular el paso del tiempo; no se esperaron semanas. RSS/HN aportan aquí conteos sintéticos de publicaciones; no se interpreta el canal sugerido LinkedIn como una medición de crecimiento de esa red.

La marca principal tiene dos segmentos: ventas EdTech, cuya necesidad declarada es cerrar demos mediante diagnóstico del embudo y seguimiento educativo; y operaciones de salud, cuya necesidad es organizar turnos, admisión clínica y espera asistencial. Se añadieron un tema compartido, uno ajeno con vistas exageradas, una referencia demo y otra descartada. Una segunda marca contiene sólo una referencia demo explícita.

## Hallazgos confirmados

### opportunities-1 · P2 · Descensos y muestras estables reciben la etiqueta verde «Crecimiento observado»

Esperado: Un descenso de 3 a 1 publicaciones debe describirse como descenso o ausencia de crecimiento; valores iguales tampoco deben anunciar crecimiento.

Observado: La explicación muestra 1 frente a 3 y «No se observó aumento de frecuencia», pero growth.label=observed activa un badge verde «Crecimiento observado». También se reproduce con 1→1 y 0→0. Esto puede orientar una decisión editorial a una señal de crecimiento inexistente.

Reproducción:

1. Usar la base propia y el build existente; no hace falta proveedor.
2. Reproducir los snapshots temporales sintéticos con: env DATA_DIR=/tmp/30x-adversarial-opportunities node /tmp/30x-adversarial-opportunities/audit/history.mjs comparable.
3. Abrir /opportunities en la marca Laboratorio de oportunidades, pulsar Actualizar y buscar Turnos clínicos.
4. Abrir Entender y crear y comparar el badge con Qué sabemos del crecimiento.

Evidencia: `docs/adversarial/evidence/opportunities-decline-labelled-growth.png`, `docs/adversarial/evidence/opportunities-api-observations.json#history.comparable`.

Causa localizada: `server/audience-insights.mjs:328`, `src/features/Journey.tsx:55`, `src/features/Journey.tsx:866`.

### opportunities-2 · P2 · Capturas repetidas de una misma URL se cuentan como evidencias independientes

Esperado: La oportunidad debe deduplicar la referencia por identidad/URL antes de contar evidencias o advertir que son copias de la misma publicación.

Observado: Se crean dos IDs (dd3acfc7-b970-4c39-b5ef-82ccbb97ac14 y 5648e52e-e478-4b56-9636-dd72237e288c) con idéntica URL, título, texto y fuente Equipo. La oportunidad presenta 2 referencias disponibles y dos Consultar original al mismo destino. Con qa-sales-1 sembrada existe además otra copia del mismo destino en otro grupo; la prueba de doble conteo se sostiene sólo con los dos guardados UI.

Reproducción:

1. En la marca noDemo abrir Agregar referencia.
2. Guardar URL https://example.com/edtech/funnel, título Cerrar demos EdTech con diagnóstico comercial y el mismo texto de la fixture de ventas.
3. Repetir exactamente el guardado desde el formulario.
4. Pulsar Actualizar en Oportunidades; abrir Ventas EdTech → Entender y crear → Consultar 2 referencias; recargar y repetir la consulta.

Evidencia: `docs/adversarial/evidence/opportunities-duplicate-evidence.png`, `docs/adversarial/evidence/opportunities-api-observations.json#duplicate`.

Causa localizada: `server/core.mjs:1091`, `server/audience-insights.mjs:489`, `server/audience-insights.mjs:581`.


## Casos

| Caso | Esperado antes de probar | Observado | Resultado |
| --- | --- | --- | --- |
| Estado vacío | Sin referencias, explicar el vacío y ofrecer un siguiente paso sin inventar oportunidades. | 0 referencias; «Primero necesitamos referencias y contexto» y CTA «Descubrir contenido». | PASS |
| Afinidad exacta para dos audiencias | Embudo EdTech sólo sales-edtech; Turnos clínicos sólo health-ops; Coordinación aplicada ambos; Astrofotografía ninguna. | La API devuelve exactamente esos conjuntos; las etiquetas de audiencia en UI coinciden. | PASS |
| Separación de demo en marca noDemo | Una referencia isDemo no debe influir en oportunidades de una marca noDemo. | qa-demo-1 excluida; cobertura avisa que las referencias de demostración se excluyeron. La descartada qa-dismissed tampoco produce una oportunidad. | PASS |
| Espacio completamente demo | Las oportunidades demo deben estar identificadas y no demostrar crecimiento. | Cambio de marca por UI: «Ejemplo ilustrativo», growth insufficient y explicación de demostración. No muestra oportunidades de la marca anterior. | PASS |
| Agrupación del tema normalizado | Embudo EdTech y EMBUDO EdTech deben producir una sola oportunidad. | Un grupo EMBUDO EdTech contiene qa-sales-2 y qa-sales-1; no duplica la fila por mayúsculas. | PASS |
| Filtro por audiencia | Ventas muestra Embudo y Coordinación; salud muestra Coordinación y Turnos. | Las dos selecciones visibles producen exactamente esas filas antes de introducir duplicados adicionales. | PASS |
| Búsqueda combinada y recuperación | Buscar un término debe combinarse con la audiencia; una búsqueda sin coincidencias debe poder restablecerse. | Con salud, turnos muestra Coordinación y Turnos porque ambos tienen esa necesidad en razones; zzznomatch987 muestra vacío. «Ampliar exploración» limpia búsqueda y audiencia y amplía a no vinculadas. | PASS |
| Incluir señales no vinculadas | Astrofotografía sin relación debe quedar fuera por defecto y entrar al marcar la opción. | Oculta al inicio; tras Ampliar exploración aparece; al desmarcar la casilla desaparece. Sin etiquetas de audiencia. | PASS |
| Orden y prioridad editorial independientes de popularidad | Orden descendente por prioridad explicada; las vistas de un tema ajeno no lo deben asignar a audiencias. | Base: EMBUDO 54, Coordinación 51, Turnos 51, Astrofotografía 10. El tema ajeno con 999999999 vistas permanece último y sin segmento. UI conserva el orden de la API. | PASS |
| Procedencia, enlaces y métricas nativas separadas | Cada evidencia debe conservar título, fuente, URL y sus propios valores, sin sumar redes. | Consultar 2 referencias muestra enlaces exactos /edtech/followup y /edtech/funnel con rel noreferrer. HN: 3 comentarios y 20 puntos; RSS sintético: 100 vistas, 4 me gusta y 2 comentarios. No hay total cruzado. Todos son datos sintéticos. | PASS |
| Deduplicación al repetir una referencia desde UI | Guardar dos veces la misma URL y texto no debe presentarse como dos evidencias independientes de una oportunidad. | Dos guardados UI devuelven registros diferentes y la oportunidad Ventas EdTech dice «2 referencias disponibles» con el mismo título, fuente y URL repetidos. Persiste tras recarga. | FAIL |
| Cold start y una sola observación | Sin línea base y después de una sola observación, el crecimiento debe seguir insuficiente. | Sin snapshots y con un único snapshot sintético reciente: hasHistory=false; badge «Sin historial suficiente» y explicación de dos ventanas. | PASS |
| Observaciones no comparables | Scope de fuentes/consulta diferente o ventana de 1 día frente a 7 días debe invalidar comparación. | Fases sintéticas different-scope y wrong-window devuelven hasHistory=false, insufficient en todos los temas y el mismo estado en UI al Actualizar. | PASS |
| Aumento comparable y señal inicial | Con ventanas sintéticas de 7 días, mismas fuentes/consulta, separadas por 8 días: 1→4 debe mostrar aumento acotado; 0→2 señal inicial. | EMBUDO observed: 4 frente a 1 y «Aumentó la frecuencia en esta muestra»; Coordinación early_signal: 2 frente a 0 y advertencia de muestra pequeña. La explicación no atribuye alcance, éxito ni tendencia global. | PASS |
| Descenso y estabilidad no equivalen a crecimiento | 3→1, 1→1 y 0→0 no deben mostrar crecimiento observado. | API devuelve observed y UI badge verde «Crecimiento observado» en los tres casos; detalle reconoce «No se observó aumento de frecuencia». | FAIL |
| Caducidad de observaciones | Un par cuyo último dato es de hace cuatro días debe quedar insuficiente. | Fase stale sintética: hasHistory=false y UI vuelve a Sin historial suficiente; recarga mantiene el estado. | PASS |
| Peso de observación pública frente a hipótesis editorial | Misma señal temática y segmento deben aumentar prioridad de forma diferenciada y explicar su origen. | Turnos y Coordinación pasan de 51 a 54 con una nota editorial y a 60 al reemplazarla por señal public_content con URL sintética; la UI reordena primero los dos temas con 60 y explica 1 observación pública. | PASS |
| Entender y crear conserva contexto | Filtro salud y oportunidad compartida deben crear con health-ops y qa-shared-1; los cambios a carrusel/Instagram deben persistir. | UI preselecciona health-ops; se eligen carousel e instagram y Crear borrador navega a /studio/c4822a68-559e-4971-8e70-71307512d43f. API/SQLite: referenceId qa-shared-1, segmentId health-ops, format carousel, channel instagram, status draft. | PASS |

El [JSON del informe](opportunities.json) enlaza la evidencia específica de cada caso. [Las observaciones API](../evidence/opportunities-api-observations.json) conservan conteos, conjuntos de audiencia, orden, referencias y crecimiento de cada fase. Los fragmentos tras # en sus rutas identifican claves JSON, no anclas de una página web.

## Límites y observaciones condicionadas

- Todas las marcas, necesidades, señales, referencias, métricas y snapshots son fixtures sintéticas de una base temporal propia. No son observaciones reales de audiencias ni integración real con RSS, HN o YouTube.
- Los snapshots históricos se sembraron en minutos para simular ventanas: no se esperaron semanas. Se valida cómo los datos comparables/no comparables se interpretan y muestran, no la fiabilidad de un muestreo longitudinal real.
- DISCOVERY_ENABLED=false y claves OpenAI, Gemini, YouTube y Apify retiradas del proceso. No se usaron credenciales, gasto, scraping privado ni publicaciones externas.
- La exactitud semántica con IA y la calidad final del borrador quedan fuera de esta revisión. Se validaron IDs y metadatos transmitidos por el CTA. La dirección editorial heredada del tema compartido todavía menciona ambos segmentos y post; esa adecuación textual requiere revisión del borrador.
- Se usó una fixture YouTube metadata_only con campos previos de afinidad deliberadamente incorrectos: las oportunidades ignoran esos campos y conservan sales-edtech; growth queda insufficient y evidencia nativa muestra 123 vistas, 7 me gusta y 1 comentario. No certifica integración real.
- Experimento adicional con un campo metrics.score inyectado directamente en la fixture YouTube: nativeMetricDetail lo omite, pero Rendimiento dentro de factors lo repite como puntos. No se demostró que un conector o entrada soportada produzca ese campo para YouTube; se conserva en la evidencia como observación de robustez condicionada y no se cuenta como fallo confirmado del flujo normal.
- Sin revisión de móviles, permisos de otros roles, conectores reales, analítica de resultados propios ni navegación externa efectiva a URLs example.com. Los enlaces se verificaron por su destino DOM.
- No se modificó código de implementación, no se ejecutó build ni format, no se leyeron informes ajenos.

## Artefactos y reproducción

Capturas relevantes:

- [Vacío](../evidence/opportunities-empty.png).
- [Evidencia inicial](../evidence/opportunities-cold-evidence.png).
- [Referencia repetida](../evidence/opportunities-duplicate-evidence.png).
- [Descenso etiquetado como crecimiento](../evidence/opportunities-decline-labelled-growth.png).
- [Borrador con contexto transmitido](../evidence/opportunities-created-context.png).
- [Marca demo](../evidence/opportunities-demo-only.png).

La base y scripts permanecen en `/tmp/30x-adversarial-opportunities`. `audit/seed.py` contiene el corpus inicial y `audit/fixtures.json` documenta sus filas; `audit/history.mjs` reproduce las fases single, different-scope, wrong-window, comparable y stale; `audit/extra-fixtures.py` crea la marca demo y la fixture de video. Los dos duplicados se generaron desde la UI, no se sembraron por SQL. La prioridad por resultados propios quedó pendiente por ausencia de muestra y se identificó expresamente en la UI.

La pestaña propia se cerró con t3_preview_close y el proceso propio terminó con SIGTERM (salida 0); se conserva DATA_DIR para reproducción.

