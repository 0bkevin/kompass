# Análisis de referencias y lectura audiovisual

Estado: **PARTIAL**. 13 casos: **12 PASS, 0 FAIL, 1 BLOCKED**. Sin hallazgos P1–P3 confirmados en los casos ejecutados. La lectura audiovisual real queda **BLOCKED**, no aprobada.

Instancia independiente: `http://127.0.0.21:4111`, `DATA_DIR=/tmp/30x-adversarial-video`, proceso PID 3865055, sesión 96670. Cuenta ficticia `qa-video@example.com`. Se revisó el build existente con T3, pestaña propia `tab_3w_07e54779-9ab2-4979-8a15-674c4eff160a`, con snapshots previos y comprobaciones posteriores por UI/API/SQLite. No se usaron claves reales, no se pagó ni se enviaron medios al proveedor. Se conservaron los datos de reproducción.

## Comparación de resultados

### 1. Referencia de sólo título/enlace sin contenido legible — PASS

**Esperado:** El análisis local usa sólo el material disponible, expone incertidumbre y no afirma haber visto imágenes/audio.

**Observado:** UI Analizar referencia guardó heuristic, confidence=low y el título como gancho. La UI dice que no describe audio ni imágenes; hipótesis sin causalidad. API registra título/enlace, sin contenido completo y fallo de resolución de example.invalid.

**Evidencia:** [video-local-analysis.png](../evidence/video-local-analysis.png), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 2. Análisis local con descripción de referencia sintética — PASS

**Esperado:** Con texto disponible y sin API de IA debe producir un análisis local identificable, conservando procedencia.

**Observado:** En la referencia YouTube sintética con descripción, la acción de UI produjo análisis orientativo por reglas locales, confianza baja, adaptación al segmento Líderes sintéticos y ningún videoAnalysis. Source y métricas nativas se conservaron.

**Evidencia:** [video-youtube-detail.png](../evidence/video-youtube-detail.png), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 3. Recarga, repetición y corrección — PASS

**Esperado:** El análisis persiste al recargar; actualizar no duplica. Una corrección invalida el análisis anterior y el nuevo usa el título corregido.

**Observado:** Tras recargas, la UI seguía mostrando el análisis guardado a 02:06:42.826Z. Actualizar análisis cambió analyzedAt a 02:10:18.508Z sin crear referencias. PATCH de preparación corrigió el título y devolvió status=new sin analysis; la acción UI Analizar referencia guardó el gancho corregido a 02:10:25.609Z. Conteo final=7.

**Evidencia:** [video-local-corrected-analysis.png](../evidence/video-local-corrected-analysis.png), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 4. Seis factores editoriales consultables — PASS

**Esperado:** Debe poder consultarse gancho, formato, tema, momento, autor/publicador y rendimiento, con observación separada de interpretación.

**Observado:** Oportunidades → Entender y crear → Gancho, formato, tema y momento muestra los seis factores tanto con HN como con YouTube como primera referencia. Expone título disponible, formato de metadatos, agrupación propuesta, fecha de fuente, atribución y métricas, cada uno con limitación. ReferenceDetail tiene una presentación más breve; no se considera incumplimiento global.

**Evidencia:** [video-factors-opportunities.png](../evidence/video-factors-opportunities.png), [video-youtube-six-factors.png](../evidence/video-youtube-six-factors.png), [video-youtube-native-metrics.png](../evidence/video-youtube-native-metrics.png).

### 5. Métricas nativas y separación de redes — PASS

**Esperado:** Representar los valores de cada fuente con su procedencia, sin sumar redes ni afirmar crecimiento/causalidad por una sola observación.

**Observado:** UI YouTube: 1234 vistas, 56 likes, 7 comentarios, origen YouTube Data API, observación 2026-10-18T00:00:00Z. UI HN: 77 puntos y 8 comentarios, origen Hacker News API. Al agrupar dos referencias no se sumaron los valores y el factor de rendimiento identificó la referencia HN. Texto explícito: métricas de redes distintas no se suman ni se comparan como equivalentes; una observación no demuestra crecimiento.

**Evidencia:** [video-youtube-native-metrics.png](../evidence/video-youtube-native-metrics.png), [video-factors-opportunities.png](../evidence/video-factors-opportunities.png), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 6. Gemini ausente y recuperación — PASS

**Esperado:** No iniciar análisis audiovisual sin configuración; explicar la dependencia y permitir localizar configuración.

**Observado:** Referencia compatible de YouTube muestra Gemini no configurado y no ofrece Examinar video. El botón del aviso Fuentes y equipo navega a /settings, donde Gemini aparece Sin configurar. POST suplementario devuelve409 Configura Gemini... sin guardar videoAnalysis.

**Evidencia:** [video-youtube-detail.png](../evidence/video-youtube-detail.png), [video-http-observations.json](../evidence/video-http-observations.json).

### 7. Reel sin medio accesible — PASS

**Esperado:** Una URL de Instagram sin medio/API disponible debe conservarse como metadatos y no habilitar lectura audiovisual.

**Observado:** El detalle dice No hay un archivo audiovisual accesible y Sólo hay metadatos disponibles; no hay botón Examinar video. No se visitó Instagram ni contenido detrás de login.

**Evidencia:** [video-inaccessible-gate.png](../evidence/video-inaccessible-gate.png).

### 8. Error por indicador de conexión obsoleto — simulación local controlada — PASS

**Esperado:** Si la UI cree que Gemini está configurado y el servidor lo rechaza, mostrar error, recuperar controles, preservar el foco y no fabricar resultado.

**Observado:** Se simuló únicamente GET /social/settings en la pestaña propia para devolver configured=true. El servidor real siguió sin credenciales. Clic UI Examinar video recibió409, mostró Configura Gemini..., mantuvo el foco de prueba, reactivó botones y dejó videoAnalysis ausente. Se retiró la inyección al terminar.

**Evidencia:** [video-error-missing-gemini-local-simulation.png](../evidence/video-error-missing-gemini-local-simulation.png), [video-http-observations.json](../evidence/video-http-observations.json).

### 9. YouTube sin duración verificable — configuración ficticia local — PASS

**Esperado:** La fuente debe validarse antes de enviar medios al proveedor y ofrecer recuperación si no puede comprobar duración.

**Observado:** Con credencial sintética local y YouTube deshabilitado, clic UI Examinar video devolvió422: no se puede comprobar duración; configurar conector o usar referencia descubierta con duración. No se llegó a Gemini; status siguió new y no se guardó videoAnalysis.

**Evidencia:** [video-no-duration-local-fixture.png](../evidence/video-no-duration-local-fixture.png), [video-http-observations.json](../evidence/video-http-observations.json), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 10. Fuente incompatible pese a acceso declarado — fixture adversarial — PASS

**Esperado:** No confiar sólo en un indicador de accesibilidad; rechazar URLs incompatibles antes de proveedor.

**Observado:** Fixture deliberadamente incoherente con mediaAccess=youtube_url y example.invalid. Con configuración ficticia local, clic UI Examinar video devolvió422 Sólo se pueden analizar URLs públicas de YouTube, videos subidos... o medios reconocidos. Controles recuperados; no resultado guardado.

**Evidencia:** [video-unsupported-source-local-fixture.png](../evidence/video-unsupported-source-local-fixture.png), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 11. Permisos de revisor — PASS

**Esperado:** El revisor puede consultar pero no iniciar análisis local ni audiovisual; el servidor también debe bloquearlo.

**Observado:** Cambio temporal de membership en SQLite propia a reviewer. UI mostró aviso de rol y deshabilitó foco, Examinar video y Analizar referencia. POST suplementarios en ambas rutas devolvieron403 Necesitas permisos de edición. Se restauró owner.

**Evidencia:** [video-reviewer-permissions.png](../evidence/video-reviewer-permissions.png), [video-http-observations.json](../evidence/video-http-observations.json).

### 12. Entradas vacías/inválidas — API suplementaria — PASS

**Esperado:** Rechazar falta de referencia, foco no textual e ID inexistente sin modificar datos.

**Observado:** POST /analyze {}→400 Selecciona una referencia; analyze-video {focus:17}→400 El enfoque debe ser texto de hasta500 caracteres; ID inexistente→404. Conteo de referencias se mantuvo y los fallos audiovisuales quedaron sin análisis.

**Evidencia:** [video-http-observations.json](../evidence/video-http-observations.json), [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

### 13. Lectura audiovisual real y persistencia de resultado Gemini — BLOCKED

**Esperado:** Un proveedor real debe observar el vídeo accesible, devolver cobertura y límites verificables y persistir un resultado audiovisual fiel al medio.

**Observado:** No hay Gemini real ni autorización para usar claves/pago o enviar medios a terceros. No se ejecutó una integración real ni una respuesta de éxito simulada. Los gates y errores anteriores no prueban exactitud audiovisual.

**Evidencia:** [video-persisted-fixtures.json](../evidence/video-persisted-fixtures.json).

## Hallazgos

Ningún fallo funcional confirmado en los casos ejecutados. El candidato inicial sobre factores ausentes del detalle se descartó como fallo global tras comprobar interactivamente los seis factores en Oportunidades, incluidos los contadores exactos, autor y fecha de la referencia YouTube sintética. El detalle conserva un resumen más breve y no tiene enlace directo al panel de factores.

## Alcance y límites

- Todos los datos de marca, referencias y métricas son sintéticos; prueban representación y flujo, no exactitud de conectores reales.
- IA audiovisual REAL ausente: BLOCKED. Sin verificación real de imágenes, audio, muestreo, tiempos, respuesta de proveedor o persistencia de un análisis exitoso.
- La simulación del indicador GET y la configuración ficticia sólo ejercitan errores locales anteriores al proveedor. No equivalen a una integración exitosa.
- No se probaron archivos subidos, medios de Apify ni fuentes detrás de login; no se enviaron vídeos ni publicaciones a terceros.
- Los seis factores se consultan desde Oportunidades. El detalle de referencia sólo muestra un resumen y no enlaza directamente al panel de factores; se registra como diferencia de ubicación, sin fallo funcional global confirmado.
- Los factores de una oportunidad agrupada describen la primera referencia; las demás conservan sus evidencias separadas.
- Pruebas de permisos limitadas a owner/reviewer de la base temporal propia; no es una auditoría universal de aislamiento.
- No se modificó implementación ni se ejecutaron build/format. No se leyeron informes ajenos.

## Reproducción

Arrancar el build existente con las variables indicadas en el brief y el mismo DATA_DIR/puerto, sin cargar claves. La referencia de sólo título terminó corregida como `[SINTÉTICO CORREGIDO] 3 pruebas de IA en procesos`; el JSON de fixtures conserva su resultado final. La referencia YouTube con métricas nativas tiene ID `qa-video-youtube-native`. Para consultar sus seis factores: Oportunidades → IA en procesos → Entender y crear → Gancho, formato, tema y momento. HN se separó al final en el tema `HN IA sintética` para comprobar cada fuente individualmente.

Las fixtures de error `qa-video-no-duration` y `qa-video-unsupported-source` se conservaron sin resultado audiovisual. La configuración Gemini ficticia se eliminó/deshabilitó y el rol se restauró a owner al concluir. Proceso y pestaña propios cerrados tras la revisión.

