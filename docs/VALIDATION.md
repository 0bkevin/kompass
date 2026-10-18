# Validación de la entrega

Fecha: 18 de octubre de 2026. Entorno local con Node.js 24, SQLite temporal y credenciales de prueba. No constituye una validación de operación pública a escala.

## Pruebas automáticas

- `npm test`: 373 pruebas aprobadas, sin fallos, cancelaciones ni pruebas omitidas. La línea base anterior a las correcciones tenía 170.
- `npm run build`: compilación Vite y comprobación TypeScript aprobadas.
- Tres pruebas de recorrido HTTP integrado cubren alta, contexto de empresa, audiencia, referencias, oportunidad, borrador, revisión, aprobación, calendario y resultados. Usan SQLite temporal y respuestas externas simuladas.
- Se comprueban aislamiento entre empresas, permisos de revisor, aprobación ligada a la versión del contenido, correcciones de resultados sin duplicación y rechazo de métricas inválidas.
- El sensor comunitario comprueba agregación, umbral de cinco respuestas por grupo, eliminación de señales al borrar la pregunta y rechazo de campos personales en las respuestas.
- Los conectores opcionales prueban presupuestos compartidos y reservas concurrentes. El análisis semántico prueba citas literales, contexto vigente, aislamiento, concurrencia y rechazo de resultados inválidos.

## Comprobación con servicios reales

El inspector leyó `https://example.com` y recuperó «Example Domain» con estado de página leída. Una URL de Instagram aportada durante el alta quedó como enlace, con su limitación visible.

En la entrega anterior a la auditoría, un descubrimiento manual incorporó 49 referencias después de deduplicar respuestas de Hacker News y Google Trends RSS. GDELT devolvió HTTP 429 y el recorrido mantuvo los resultados disponibles indicando cobertura parcial. Esto comprueba acceso puntual, no continuidad ni cobertura de redes sociales.

Después de corregir el clasificador de direcciones, `safeFetch` leyó el [RSS público de NASA](https://www.nasa.gov/feed/) con HTTP 200 y recuperó 10 entradas. La salida y las regresiones de seguridad están en [discovery-1](remediation/reports/discovery-1.md). La corrección de entidades HTML de Hacker News se comprobó con transporte controlado, sin atribuir esa simulación a una lectura real.

No se utilizaron credenciales ni llamadas de pago para validar Apify, YouTube, modelos de texto o Gemini. Sus pruebas automáticas simulan las respuestas. La primera observación de temas queda sin historial suficiente para afirmar crecimiento.

## Recorrido en navegador

Sobre la versión compilada se comprobó, con una empresa ficticia identificada como prueba:

1. Registro e inicio de sesión.
2. Alta desde texto y enlace público, revisión editable y confirmación de audiencia.
3. Descubrimiento de referencias y lectura de oportunidades con evidencia y limitaciones.
4. Creación y edición de un borrador, envío a revisión y aprobación.
5. Programación en el calendario y registro manual de resultados.
6. Creación de una pregunta comunitaria, apertura pública, selección de grupo/tema y respuesta con confirmación. Con una respuesta no se muestran resultados desglosados.

Las cifras introducidas en la prueba de resultados son ficticias y se identifican así en sus notas. No hubo una publicación comercial real ni se demostró rendimiento, ahorro o ROI.

Tras integrar las 25 correcciones se repitió el recorrido en el servidor compilado: contexto y audiencia de una empresa ficticia general, oportunidad con historial insuficiente, carrusel de cuatro láminas con CTA exacto, edición, revisión, aprobación, calendario, descarga CSV y resultados manuales. El CSV contiene una fila y 12 columnas. Recargar en móvil y corregir sólo las notas conserva el mismo registro y las métricas 1500.5 / 75.25 / 3.5; son cifras ficticias.

Los [25 responsables independientes y sus pruebas](remediation/SUMMARY.md) cubren los 26 hallazgos de la auditoría. Los informes originales permanecen intactos. La verificación conjunta y los digest de código y compilación están en [validation.json](remediation/validation.json).

## Interfaz

La revisión inicial inspeccionó Inicio a 1440 × 1000 y 390 × 844 píxeles CSS, más Oportunidades y Empresa. La comprobación integrada posterior usa 1280 × 800 y 390 × 844: calendario, resultados, buscador de referencias, menú, actualización de audiencia e Inicio con las seis etapas activas. No se observó desplazamiento horizontal del documento en esas vistas. Los campos móviles se muestran a 16px; búsqueda y borrado conservan el foco.

La revisión visual inicial utilizó las capturas, el contrato de superficie y el producto documentado; sus artefactos están en `.impeccable/review/`. Las nuevas capturas y descargas están en `docs/remediation/evidence/`. Ese alcance no certifica todas las combinaciones de estado, navegador o tecnología asistiva.

## Límites pendientes de operación real

- No existe descubrimiento general de LinkedIn. Instagram, TikTok y YouTube requieren configuración, permisos y disponibilidad de sus conectores; una noticia o señal de búsqueda no demuestra crecimiento en esas redes.
- El crecimiento necesita observaciones comparables a lo largo del tiempo. La priorización inicial usa reglas de texto; la interpretación semántica requiere el proveedor opcional.
- Las respuestas comunitarias son voluntarias, no verificadas y no garantizan personas únicas o representatividad. No se modelan individuos de la audiencia.
- Las métricas propias se registran manualmente. Los ajustes editoriales requieren suficiente muestra comparable y no establecen causalidad.
- El calendario no publica automáticamente en redes. La generación de un video final y las integraciones de publicación dependen de proveedores específicos.
- Antes de una operación pública prolongada deben validarse credenciales, condiciones y conservación/actualización de datos de cada API, además del alojamiento, copias de seguridad y necesidades de escala del operador.

La trazabilidad de cada parte del audio está en [TRANSCRIPT-TO-PRODUCT.md](TRANSCRIPT-TO-PRODUCT.md).
