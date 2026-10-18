# Correcciones de la revisión adversarial

25 defectos resueltos por 25 agentes distintos. Cubren los 26 hallazgos originales; la duplicación de referencias apareció en dos revisiones y tiene un único responsable. Los informes adversariales anteriores se mantienen como evidencia histórica.

La suite integrada aprobó 373/373 pruebas (0 fallos, 0 canceladas). Build Vite y TypeScript aprobados. La línea base tenía 170 pruebas; los informes individuales conservan las reproducciones rojas y sus comprobaciones posteriores.

Se verificó por SHA-256 que los 257 archivos de la auditoría original permanecen intactos.

## Responsables y resultados

| Punto | Responsable independiente | Corrección comprobada |
| --- | --- | --- |
| [company-1](reports/company-1.md) | fix_company_1 | Cambiar el nombre conserva mercados e idiomas personalizados. |
| [company-2](reports/company-2.md) | fix_company_2 | La importación oculta las direcciones de contacto etiquetadas dentro de párrafos, también al leer resultados anteriores. |
| [audience-1](reports/audience-1.md) | fix_audience_1 | Se rechazan perfiles con nombre, rol o necesidades vacíos después de quitar espacios. |
| [signals-1](reports/signals-1.md) | fix_signals_1 | Las fichas individuales explícitas se rechazan y las señales históricas inadmisibles quedan fuera del análisis. |
| [signals-2](reports/signals-2.md) | fix_signals_2 | Las URL con datos de contacto detectables se rechazan conservando identificadores públicos legítimos. |
| [community-1](reports/community-1.md) | fix_community_1 | Actualizar consulta preguntas y señales y refresca sus conteos conjuntamente. |
| [discovery-1](reports/discovery-1.md) | fix_discovery_1 | El RSS público de NASA vuelve a poder leerse conservando los bloqueos de destinos privados. |
| [duplicate-reference](reports/duplicate-reference.md) | fix_duplicate_reference | Capturar la misma publicación reutiliza el registro y cuenta una sola evidencia. |
| [references-2](reports/references-2.md) | fix_references_2 | Se rechazan URL locales o reservadas conocidas y se omiten los enlaces históricos inadmisibles. |
| [references-3](reports/references-3.md) | fix_references_3 | El detalle permite descargar el adjunto original y distingue ausencia de archivo de errores recuperables. |
| [opportunities-1](reports/opportunities-1.md) | fix_opportunities_1 | Estabilidad y descenso se muestran como tales; crecimiento exige aumentos comparables. |
| [studio-1](reports/studio-1.md) | fix_studio_1 | El borrador aplica formato, cantidad, CTA y ejemplo; conserva las notas libres en un brief para revisión. |
| [calendar-1](reports/calendar-1.md) | fix_calendar_1 | Los borradores y las fechas residuales inválidas quedan fuera de grilla, contadores y CSV. |
| [results-1](reports/results-1.md) | fix_results_1 | Las notas rechazan fichas identificables explícitas y conservan las métricas anteriores ante un error. |
| [assets-1](reports/assets-1.md) | fix_assets_1 | Los nombres Unicode nuevos se conservan al subir, buscar y descargar el archivo original. |
| [assets-2](reports/assets-2.md) | fix_assets_2 | Los TXT UTF-8 válidos se aceptan hasta 25 MiB inclusive; el exceso tiene un error específico y no deja archivos parciales. |
| [sources-1](reports/sources-1.md) | fix_sources_1 | Cambiar el tipo de fuente elimina consultas incompatibles y el resumen muestra el feed RSS real. |
| [sources-2](reports/sources-2.md) | fix_sources_2 | Cambiar entre YouTube y Apify mantiene una plataforma compatible con lo que muestra el formulario. |
| [providers-1](reports/providers-1.md) | fix_providers_1 | La interfaz permite un envío explícito con confirmación de destino y versión, permisos y recibos. |
| [navigation-1](reports/navigation-1.md) | fix_navigation_1 | Recargar o salir de Audiencia protege los cambios pendientes y permite cancelar sin perder campos. |
| [navigation-3](reports/navigation-3.md) | fix_navigation_3 | La búsqueda de Referencias sigue visible en móvil y permite filtrar, borrar y conservar el foco. |
| [signals-3](reports/signals-3.md) | fix_signals_3 | El tema se limita a los 160 caracteres admitidos; el texto largo se muestra completo sin desbordar. |
| [discovery-2](reports/discovery-2.md) | fix_discovery_2 | Las entidades HTML de Hacker News se leen correctamente, sin doble decodificación ni ejecutar etiquetas. |
| [results-2](reports/results-2.md) | fix_results_2 | Corregir sólo las notas conserva los decimales exactos y el mismo registro de resultados. |
| [navigation-2](reports/navigation-2.md) | fix_navigation_2 | Escape y las demás salidas protegen la fuente en edición; cancelar conserva el formulario. |

## Verificación integrada

- Empresa general ficticia Lumen Taller QA conserva Costa Rica y Español; el recorrido no depende de una marca 30X.
- Una oportunidad reúne la referencia pública capturada y la necesidad del grupo; la primera observación conserva Sin historial suficiente y no afirma crecimiento.
- Creación desde Oportunidades produce un carrusel de 4 láminas para la audiencia elegida, CTA exacto y ejemplo hipotético; conserva el brief sin pegar instrucciones en el texto publicable.
- Edición de título y gancho, guardado, envío a revisión y aprobación mantienen referencia y brief; la pieza pasa a programada por la acción explícita del calendario.
- Calendario muestra una pieza programada. Descarga nativa CSV contiene exactamente 1 fila de datos y 12 columnas con título, fecha y estado esperados.
- Guardar resultados manuales produce un único registro con 1500.5 visualizaciones, 75.25 interacciones y 3.5 contactos, etiquetado como ficticio en las notas.
- Tras recargar a390px, corregir sólo las notas conserva el mismo outcome ID, createdAt y métricas exactas. Campos a 16px, step any, formulario válido y documento de 390px.
- Buscador de Referencias visible a390px: no coincidencias tiene explicación; piloto devuelve la referencia esperada y borrar restaura una fila y el foco.
- Menú móvil navega a Audiencia; Actualizar preguntas y señales finaliza sin carga eterna. Página y Home no desbordan los 390px.
- Inicio refleja 6 de 6 etapas con actividad tras el recorrido. No se envió una publicación externa ni se utilizaron claves reales.

Los comandos, resultados y artefactos conjuntos están en [validation.json](validation.json). Cada informe por punto conserva pruebas, capturas y límites específicos. Las expectativas anteriores ajustadas explícitamente están en [CONTRACTS.md](CONTRACTS.md).

## Límites de la comprobación

La lectura real de NASA se comprobó por separado. Las pruebas de publicación y proveedores de pago usan transportes controlados; no acreditan entrega externa, precisión de modelos, costos reales ni resultados comerciales. La activación de cada proveedor requiere sus credenciales y permisos. El crecimiento exige historia comparable, y los resultados siguen siendo registros manuales identificados como tales.

La detección de fichas/contactos es estructural; no identifica universalmente nombres en prosa libre. El saneamiento de lecturas históricas no equivale a un borrado físico de datos previos. Los datos de las pruebas son sintéticos.
