# Auditoría adversarial por funcionalidad

Se asigna un agente nuevo por funcionalidad, con una cuenta/base temporal y un host exclusivos. Se prueban el resultado observable, su exactitud y la persistencia, con casos normales y adversariales. No se realizan correcciones durante la auditoría.

La especificación de referencia es PRODUCT.md junto con la transcripción del audio y el reto aportados por el usuario. El [contrato de revisión](BRIEF.md) fija las evidencias exigidas. `manifest.json` identifica la versión examinada.

## Cobertura prevista

| N.º | Funcionalidad                                                            | Informe independiente                     |
| --- | ------------------------------------------------------------------------ | ----------------------------------------- |
| 1   | Registro, inicio/cierre de sesión y recuperación de sesión               | [auth](reports/auth.md)                   |
| 2   | Alta guiada de empresa desde web, enlaces y texto                        | [onboarding](reports/onboarding.md)       |
| 3   | Empresa y contenido: importación posterior, historial y edición de marca | [company](reports/company.md)             |
| 4   | Perfiles de audiencia y necesidades                                      | [audience](reports/audience.md)           |
| 5   | Señales de interés públicas y editoriales                                | [signals](reports/signals.md)             |
| 6   | Sensor comunitario interno y pregunta pública agregada                   | [community](reports/community.md)         |
| 7   | Descubrimiento público, sincronización y errores de cobertura            | [discovery](reports/discovery.md)         |
| 8   | Captura, bandeja, filtros y detalle de referencias                       | [references](reports/references.md)       |
| 9   | Priorización de oportunidades, afinidad y crecimiento temporal           | [opportunities](reports/opportunities.md) |
| 10  | Análisis semántico opcional de oportunidades y citas                     | [semantic](reports/semantic.md)           |
| 11  | Análisis de referencias y video opcional                                 | [video](reports/video.md)                 |
| 12  | Generación de borradores y edición del contenido                         | [studio](reports/studio.md)               |
| 13  | Revisión, comentarios y aprobación versionada                            | [approval](reports/approval.md)           |
| 14  | Programación, calendario y exportaciones                                 | [calendar](reports/calendar.md)           |
| 15  | Registro/corrección de resultados y aprendizaje                          | [results](reports/results.md)             |
| 16  | Archivos, carga, descarga y uso en piezas                                | [assets](reports/assets.md)               |
| 17  | Configuración y edición de fuentes                                       | [sources](reports/sources.md)             |
| 18  | Integraciones, credenciales, presupuestos y publicación opcional         | [providers](reports/providers.md)         |
| 19  | Equipo, invitaciones, roles y aislamiento entre empresas                 | [permissions](reports/permissions.md)     |
| 20  | Inicio, navegación, móvil, búsqueda y cambios sin guardar                | [navigation](reports/navigation.md)       |
| 21  | Actualización automática, cadencia y espera progresiva                   | [scheduler](reports/scheduler.md)         |

Se añadió una revisión independiente de actualización automática para comprobar dinámicamente la cadencia y el backoff que estaban desactivados en la revisión de CRUD de fuentes.

PASS indica que los casos observados devolvieron el resultado esperado; no certifica todas las combinaciones. FAIL registra al menos un defecto confirmado. PARTIAL separa lo comprobado de dependencias pendientes; BLOCKED requiere una condición externa para probar el resultado. Los servicios de pago o con credenciales ausentes nunca se contabilizan como integraciones reales aprobadas.
