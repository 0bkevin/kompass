# Validación de la entrega

Fecha: 18 de octubre de 2026. Entorno local con Node.js 24, SQLite temporal y credenciales de prueba. No constituye una validación de operación pública a escala.

## Revisión vigente de condiciones de uso

La revisión posterior de fuentes y permisos está en [compliance/README.md](compliance/README.md). Apify Instagram/TikTok, Reddit, YouTube editorial y Gemini video están bloqueados por el servidor. Webs/feeds adicionales, IA y webhooks requieren revisión por origen, ruta y finalidad. Las pruebas de éxito de proveedores de la entrega anterior no acreditan permisos ni describen conectores actualmente activables.

`node --test --test-timeout=20000 tests/*.test.mjs`: **439 aprobadas**, cero fallos, cancelaciones u omitidas. `npm run build` incluye TypeScript y pasa. Las regresiones cubren credenciales, fuentes heredadas, suplantación del origen, redirecciones, revocación, robots, cuota HN, datos restringidos en pantalla, salida hacia IA y publicación con atribución. No se hicieron llamadas de pago ni scraping social para comprobarlo.

Los inventarios de las dos bases de vista previa encontraron **cero referencias de proveedores restringidos y cero referencias YouTube pendientes de revisión de conservación**. Son inspecciones de solo lectura, sin borrar información; ver [evidencia](compliance/evidence/).

## Servicios de plataforma y primer uso

La suite vigente completa pasa con **439 pruebas**, cero fallos u omisiones, y el build de producción incluye TypeScript. Doce regresiones nuevas cubren herencia de IA entre empresas, no exposición/copia de la clave compartida, bloqueo de cambios de destino/modelo de esa clave, vuelta al servicio de plataforma, revocación con borrador local disponible, concurrencia y memoria del primer descubrimiento, fallos parciales, ejemplos/fuentes desactivadas y permisos HTTP. También comprueban que una empresa con IA desactivada puede volver al servicio de plataforma y que una búsqueda manual correcta sustituye un fallo inicial guardado.

Las fuentes predeterminadas nuevas no incluyen feeds pendientes de autorización. Inicio prepara las primeras referencias al tener contexto y audiencia, sin pedir credenciales. El resumen de oportunidades vuelve a consultar sus datos cuando cambia el estado del espacio. Ajustes separa disponibilidad, credencial guardada y personalización opcional; las tarjetas de proveedores restringidos quedan en una sección desplegable.

Comprobación real de fuentes sin IA ni conectores de pago: **Hacker News: 40 resultados; Google Trends: 10; GDELT: HTTP 429**. Ver [respuesta resumida](managed-integrations-validation.json). En QA se creó una empresa sintética mediante el formulario completo, sin credenciales de proveedor; la primera búsqueda guardó **47 referencias** y presentó el fallo parcial. Al guardar después una referencia propia por el formulario, tanto las etapas como la cobertura de Inicio pasaron de 47 a 48 sin recargar la página. Ajustes e Inicio se revisaron a 390 y 1440 px sin desbordamiento; las claves y conexiones adicionales no aparecen como un requisito inicial. Las cifras de configuración no se presentan como una verificación de conectividad o cuota.

`npm run integrations:check` identifica el flujo local disponible. `npm run integrations:check -- --require-ai` sale con código 1 en el entorno actual: no se proporcionaron la credencial global ni una revisión del operador. Los adaptadores sociales y de video siguen bloqueados, y no se afirma que todas las integraciones estén activas. La vista principal (3026) tiene activada la actualización periódica; QA (5450) conserva el refresco periódico desactivado para pruebas controladas.

## Retirada de Telegram

Por petición del usuario se eliminó Telegram del producto: pestaña y formulario de ajustes, canales de Studio/calendario, envío Bot API, ruta de recepción y excepción de origen. La API rechaza ese conector y canal; un pedido mixto inválido no desconecta el webhook. El arranque elimina solo sus credenciales y cursores, conservando piezas, recibos históricos, IA y webhooks. Las piezas antiguas no se redirigen a otro conector.

La suite completa pasa con **427 pruebas**, cero fallos u omisiones; `npm run build` pasa con TypeScript. Se mantienen las regresiones de aprobación, confirmación de destino, idempotencia, recepción HTTP, rechazos definitivos y entregas inciertas mediante transporte webhook simulado. No se hicieron llamadas externas de publicación.

Comprobación interactiva en la vista previa de QA: ajustes con solo IA y Publicación, formulario de webhook accesible, cero controles Telegram; creación de contenido con LinkedIn, Instagram, TikTok y YouTube. Ajustes y Studio sin desbordamiento horizontal a 390 y 1440 px. Ambas vistas previas (3026 y 5450) reiniciadas con el build actualizado.

## Pruebas anteriores a la revisión de permisos

- Línea base anterior: `npm test`, 373 pruebas aprobadas, sin fallos, cancelaciones ni pruebas omitidas. La línea base anterior a las correcciones tenía 170.
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
