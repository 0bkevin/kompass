# community-1 — refresco coherente de comunidad

**Corregido; pendiente de integración del coordinador.** Datos ficticios aislados en `/tmp/30x-remediation-community-1`, navegador propio `127.0.1.16:5506`, API4506.

El sensor tenía una consulta local independiente: “Actualizar” sólo renovaba las señales. Además, StrictMode ejecutaba cleanup/setup y dejaba vacía la marca activa, por lo que dos GET200 podían terminar con “Cargando preguntas…” permanente.

La ruta ahora comparte `useAudienceEvidence`. Una carga consulta preguntas y señales, y publica el par completo. Cancela la carga previa, descarta respuestas antiguas y datos de otra marca, y conserva el último par si falla una consulta. El sensor ofrece **Actualizar preguntas y señales**, hora de última consulta y reintento. Crear/pausar/reabrir/eliminar también actualizan el mismo recurso. Volver a la ventana refresca con límite30s y sin polling. Los formularios conservan su instancia durante el refresco; el sensor sólo cambia de instancia al cambiar de marca.

## Evidencia antes → después

- **StrictMode:** GET200 con pregunta0 y sensor atascado → recarga completa muestra pregunta0 y finaliza loading.
- **Misma pregunta0→5:** antes, “Actualizar” mostraba notas3/5 y2/5 con sensor0; después, el mismo script muestra total5, filas3de5/2de5 y las mismas notas. Los borradores abiertos de pregunta y señal conservaron nodoDOM y valor.
- **Fallo y reintento:**503 local simulado en preguntas conserva ambos conjuntos en5 con error visible. Reintento actualiza ambos a6; mantiene2señales y susIDs.
- **Umbral por grupo:** segundo grupo con4 permanece oculto; al llegar5 aparecen sus2filas y el total11. Veinte ráfagas de foco/visibilidad produjeron una sola parejaGET.
- **Carreras:** un primer parGET retenido e intencionalmente ajeno a AbortSignal no sobrescribe el par posterior a una creación. MarcaA→B con respuestasA retenidas conserva sólo la preguntaB; volverA recupera11 y4señales.
- **Interfaz:** revisión conjunta1280×900 y390×844, foco visible, controles usables y sin desplazamiento horizontal del documento.

Scripts reutilizables: [comprobaciones de navegador](../evidence/community-1-browser-checks.json). Resultados y simulaciones: [observaciones](../evidence/community-1-observations.json). Capturas: [StrictMode antes](../evidence/community-1-strict-before.png), [contradicción antes](../evidence/community-1-update-before.png), [error recuperable](../evidence/community-1-error-after.png), [escritorio después](../evidence/community-1-desktop-after.png), [móvil después](../evidence/community-1-mobile-after.png).

## Comprobaciones

`node --test tests/community.test.mjs tests/audience-insights.test.mjs` — **22PASS,0FAIL**.

`npx tsc --noEmit --pretty false` — **exit0**.

No se añadió una prueba de código fuente: el runner Node no dispone de DOM/renderer; los efectos y formularios se comprobaron en navegador T3 real con las expresiones guardadas. No se ejecutó build ni formato global. La compilación y comprobación de producción integrada quedan al coordinador.

## Límites y cierre

Se publican juntas las dos respuestas HTTP, pero no se creó una transacción servidor entre endpoints. Se comprobó coherencia tras completar cada respuesta pública; una respuesta que llegue exactamente entreGET puede requerir otro refresco. Foco/visibilidad y503 se simularon de forma explícita; móvil es un viewport emulado. Sin personas reales, contactos externos, claves ni proveedores reales.

Pestaña propia cerrada y sesión16331 detenida; `ss -lptn '( sport = :4506 or sport = :5506 )'` confirma ambos puertos libres. Al detener `node --watch` apareció una aserción de FSWatcher del runtime; el proceso terminó y no quedaron listeners. No hay instrumentación de diagnóstico en producto. PRODUCT/DESIGN/app-surface conservaron sus mtimes anteriores.

