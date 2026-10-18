# Historia de commits de la entrega

La serie contiene 52 commits locales posteriores a `549e0bbf5b58`. Las 51 entradas siguientes preceden al commit que incorpora este documento.

La base se reutiliza desde `30x-track@b203ac729d18`. Cada cambio conserva su propósito; los cierres adversariales distinguen regresiones automatizadas de comprobaciones interactivas.

## Commits

### 01. `8a2af94eda` — chore(platform): importar la base funcional de 30x-track

Reutilizar la aplicación existente desde 30x-track@b203ac729d18: React, TanStack Start, Express, SQLite, sesiones, roles, descubrimiento y estudio editorial.

Importar únicamente código, contratos, configuración de ejemplo y pruebas. Los datos, claves y directorios de ejecución permanecen fuera de Git.

Alcance: 66 archivos.

- test: 102/102 pruebas.
- build: aprobado.

### 02. `fc2ae9c972` — docs(product): definir una plataforma para empresas guiada por su audiencia

Traducir la transcripción y el reto en un recorrido general de empresa, audiencia, evidencia, oportunidad, pieza, revisión, calendario y aprendizaje.

Registrar las restricciones de contenido público, las hipótesis editoriales y la identidad visual heredada sin promesas de ROI ni cobertura inventada.

Alcance: 6 archivos.

### 03. `cb1dcc113a` — feat(storage): aislar contexto, señales y aprendizaje por empresa

Ampliar los tipos de registros persistidos con importaciones, señales, resultados, observaciones temporales, preguntas comunitarias y análisis de oportunidades. Mantener el aislamiento y los registros existentes.

Alcance: 1 archivos.

### 04. `b39a68815b` — fix(connectors): permitir fuentes públicas y distinguir entregas inciertas

Corregir el bloqueo de la red pública de NASA conservando las denegaciones privadas y reservadas.

Distinguir rechazos definitivos de respuestas ambiguas del proveedor para no convertir un error de transporte en un reenvío duplicado.

Alcance: 1 archivos.

### 05. `2098797f75` — feat(providers): limitar gasto compartido y reservar cada intento de Apify

Incorporar límites diarios y mensuales por credencial compartida, reservas concurrentes y consulta del presupuesto por empresa. Los intentos fallidos consumen su reserva; el ledger no se presenta como factura real.

Añadir regresiones de concurrencia, agotamiento y recuperación con transportes controlados.

Alcance: 4 archivos.

### 06. `0cca559d39` — feat(evidence): validar privacidad, identidad y factores verificables

Separar los detectores de fichas individuales y contactos, la política de citas públicas y la identidad conservadora de publicaciones.

Añadir fingerprints de evidencia y seis factores editoriales que distinguen observación, hipótesis y limitaciones. No deducir afinidad de audiencia de métricas nativas.

Alcance: 7 archivos.

### 07. `6fe6ee0409` — feat(uploads): incorporar un parser multipart que conserve nombres Unicode

Añadir el adaptador de nombres UTF-8/Latin-1 y filename* usando las interfaces públicas de Multer y Busboy. Preparar saneamiento y cabeceras de descarga sin reescribir los bytes del archivo.

Declarar Busboy directamente y el mínimo de Multer que expone streamHandler.

Alcance: 3 archivos.

### 08. `5d0f1161d7` — feat(context): convertir contenido público en contexto empresarial revisable

Extraer contexto acotado desde web y texto aportado, conservar procedencia y distinguir página leída, enlace guardado, contenido provisto y error.

Proponer campos editables sin sobrescribir la empresa automáticamente y ocultar contactos etiquetados, también en lecturas históricas.

Alcance: 2 archivos.

### 09. `e4edd96848` — feat(insights): vincular necesidades, evidencia y resultados manuales

Construir oportunidades por empresa y segmento, separar estabilidad, descenso y crecimiento comparable, y mantener frío el primer muestreo.

Registrar señales agregadas y resultados corregibles por pieza, con validación de privacidad y métricas finitas. El aprendizaje requiere muestra comparable y no afirma causalidad.

Alcance: 2 archivos.

### 10. `96a598a6fd` — feat(community): recoger necesidades con contadores agregados

Añadir preguntas públicas cerradas con grupos y temas, controles de publicación y eliminación, y resultados desglosados desde cinco respuestas por grupo.

No crear perfiles de participantes ni atribuir unicidad o representatividad a respuestas voluntarias.

Alcance: 2 archivos.

### 11. `9e9e7eeb4e` — feat(analysis): fundamentar oportunidades con citas y contexto vigentes

Validar el análisis opcional con evidencia literal, fingerprint y contexto actual de la empresa. Rechazar citas inválidas, cambios concurrentes y permisos revocados antes de guardar.

Mantener explícitos proveedor ausente, simulación y límites del análisis.

Alcance: 2 archivos.

### 12. `2cf210e394` — feat(editorial): endurecer captura, borradores y publicación versionada

Integrar deduplicación de capturas, validación de perfiles y fuentes, archivos UTF-8 hasta 25 MiB y limpieza de cargas fallidas.

Generar estructuras por formato con CTA y cantidad explícitos, conservando las notas fuera del texto publicable. Limpiar programación al invalidar aprobación y exigir confirmación de versión y destino antes de enviar.

Actualizar cuatro contratos de pruebas que antes esperaban instrucciones pegadas o publicaciones duplicadas.

Alcance: 6 archivos.

### 13. `cd28807688` — feat(api): conectar el recorrido completo de empresa a aprendizaje

Montar los routers de contexto, audiencia, comunidad y análisis en la aplicación autenticada. Exponer errores recuperables al ocupar un puerto.

Añadir recorridos HTTP completos con aislamiento, aprobación versionada, planificación y resultados manuales.

Alcance: 2 archivos.

- test: 170/170 pruebas.

### 14. `015ef6deb3` — feat(contracts): modelar briefs, evidencia y recibos de publicación

Definir los contratos de oportunidades, señales y resultados junto a briefs editoriales y destinos de publicación tipados.

Distinguir un webhook aceptado de una publicación social confirmada en las etiquetas compartidas.

Alcance: 3 archivos.

- TypeScript: aprobado.

### 15. `adeefd91a8` — feat(onboarding): revisar la empresa a partir de su contenido

Añadir un alta guiada desde sitio web, enlaces públicos o texto. Presentar la propuesta de empresa y audiencia para revisión editable antes de confirmar.

Mostrar procedencia, limitaciones, carga y recuperación sin exigir transcribir toda la marca.

Alcance: 2 archivos.

- TypeScript: aprobado.

### 16. `d5246c8b52` — fix(audience): conservar mercados y proteger perfiles sin guardar

Representar mercados e idiomas personalizados sin sustituirlos al cambiar otro campo. Validar nombre, rol y necesidades después de quitar espacios.

Registrar guardias de cambios pendientes, conservar errores y datos al cancelar, y bloquear guardados duplicados.

Alcance: 1 archivos.

- TypeScript: aprobado.

### 17. `d26a20b1a7` — fix(library): alinear límites, formatos y recuperación de cargas

Mostrar el límite real de 25 MiB y la codificación UTF-8, admitir CSV en el selector y conservar resultados individuales al cargar un lote.

Mantener el reintento de actualización sin volver a subir archivos ya guardados.

Alcance: 1 archivos.

- TypeScript: aprobado.

### 18. `460ef210c9` — feat(references): consultar adjuntos y recuperar capturas sin duplicar

Separar la cita pública del adjunto autenticado y permitir descargar el original con nombre, tipo y tamaño. Diferenciar ausencia de archivo de fallos recuperables y abortar lecturas obsoletas.

Alinear los límites de captura, explicar enlaces históricos omitidos y distinguir cero coincidencias de una biblioteca vacía.

Alcance: 2 archivos.

- TypeScript: aprobado.

### 19. `e9153845a2` — fix(sources): normalizar proveedores y proteger la configuración pendiente

Limpiar campos incompatibles al cambiar de fuente y mantener la plataforma visible alineada con la enviada. Mostrar el feed RSS real.

Proteger Escape, navegación, cambio de empresa y recarga; conservar el formulario ante errores y añadir el estado del presupuesto.

Alcance: 4 archivos.

- TypeScript: aprobado.

### 20. `030cbd6c4a` — feat(studio): editar formatos y confirmar envíos con aprobación vigente

Añadir controles de formato, CTA, cantidad y ejemplo hipotético, con brief separado del texto publicable.

Permitir el envío explícito con destino y versión confirmados, estados de carga, recibos y recuperación; los cambios sin guardar o una entrega incierta bloquean reenvíos inseguros.

Alcance: 3 archivos.

- TypeScript: aprobado.

### 21. `5dfeecff1d` — fix(calendar): excluir borradores y fechas residuales del plan editorial

Compartir la elegibilidad de grilla, contadores, próximos contenidos y CSV. Mantener registros históricos sin contarlos como planificación válida.

Conservar el historial publicado y devolver las piezas aprobadas con fecha residual a la bandeja para agendar.

Alcance: 4 archivos.

- TypeScript: aprobado.

### 22. `1f565e2c3f` — feat(community-ui): sincronizar preguntas y señales sin cargas eternas

Compartir una consulta con cancelación y cercado por empresa entre preguntas y señales. Conservar el último resultado válido ante fallos y permitir actualización explícita.

Añadir la respuesta pública accesible y el umbral agregado sin modelar participantes.

Alcance: 3 archivos.

- TypeScript: aprobado.

### 23. `db709aed3b` — feat(workspace): guiar de la audiencia al contenido y sus resultados

Conectar Inicio, Audiencia, Oportunidades, Empresa y Resultados con una acción siguiente clara y evidencia desplegable.

Mantener la búsqueda accesible en móvil, entradas a 16px, errores recuperables y métricas manuales corregibles con decimales exactos. Vincular las nuevas rutas y el alta guiada al shell existente.

Hacer configurables los puertos de desarrollo y documentar los proveedores opcionales sin secretos.

Alcance: 17 archivos.

- TypeScript: aprobado.
- build: aprobado.

### 24. `fb34a3972a` — docs(ux): conservar la revisión visual de escritorio y móvil

Registrar capturas, diagnósticos y rondas de revisión de la interfaz heredada. Mantener explícito su alcance visual y separarlo de las verificaciones funcionales posteriores.

Alcance: 9 archivos.

### 25. `7e85691a5d` — test(audit): preservar las 21 revisiones adversariales independientes

Archivar los 343 casos originales, sus resultados esperados y observados, los 26 hallazgos y las limitaciones de proveedores reales.

Conservar los 257 archivos originales, incluidas capturas y digest, como evidencia histórica sin sobrescribirla con el estado corregido.

Alcance: 257 archivos.

### 26. `d0ed272fbf` — test(company): conservar mercado e idioma al editar la marca

Cambiar el nombre conserva mercados e idiomas personalizados.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_company_1. Informe: docs/remediation/reports/company-1.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 9 archivos.

### 27. `66f7652f44` — test(context): ocultar contactos insertados dentro de párrafos

La importación oculta las direcciones de contacto etiquetadas dentro de párrafos, también al leer resultados anteriores.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_company_2. Informe: docs/remediation/reports/company-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 3 archivos.

### 28. `e3100fe973` — test(audience): rechazar perfiles vacíos tras normalizar espacios

Se rechazan perfiles con nombre, rol o necesidades vacíos después de quitar espacios.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_audience_1. Informe: docs/remediation/reports/audience-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 7 archivos.

### 29. `6ce5470b01` — test(privacy): impedir fichas individuales en señales de audiencia

Las fichas individuales explícitas se rechazan y las señales históricas inadmisibles quedan fuera del análisis.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_signals_1. Informe: docs/remediation/reports/signals-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 3 archivos.

### 30. `86776328a5` — test(privacy): detectar contactos codificados en URL de evidencia

Las URL con datos de contacto detectables se rechazan conservando identificadores públicos legítimos.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_signals_2. Informe: docs/remediation/reports/signals-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 7 archivos.

### 31. `98a1b10995` — test(community): comprobar conteos actualizados y recuperación de fallos

Actualizar consulta preguntas y señales y refresca sus conteos conjuntamente.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_community_1. Informe: docs/remediation/reports/community-1.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 9 archivos.

### 32. `fcb1ec1fe1` — test(discovery): permitir NASA manteniendo las defensas de red

El RSS público de NASA vuelve a poder leerse conservando los bloqueos de destinos privados.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_discovery_1. Informe: docs/remediation/reports/discovery-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 9 archivos.

### 33. `02f73359b3` — test(evidence): contar una publicación aunque se capture dos veces

Capturar la misma publicación reutiliza el registro y cuenta una sola evidencia.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_duplicate_reference. Informe: docs/remediation/reports/duplicate-reference.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 8 archivos.

### 34. `d8d0734a12` — test(references): rechazar citas locales y ocultar enlaces inadmisibles

Se rechazan URL locales o reservadas conocidas y se omiten los enlaces históricos inadmisibles.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_references_2. Informe: docs/remediation/reports/references-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 17 archivos.

### 35. `662d843070` — test(references): descargar el adjunto original con bytes idénticos

El detalle permite descargar el adjunto original y distingue ausencia de archivo de errores recuperables.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_references_3. Informe: docs/remediation/reports/references-3.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 17 archivos.

### 36. `ecc0ea860e` — test(trends): distinguir crecimiento, estabilidad y descenso

Estabilidad y descenso se muestran como tales; crecimiento exige aumentos comparables.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_opportunities_1. Informe: docs/remediation/reports/opportunities-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 11 archivos.

### 37. `10394b7059` — test(studio): respetar formato y CTA sin publicar instrucciones

El borrador aplica formato, cantidad, CTA y ejemplo; conserva las notas libres en un brief para revisión.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_studio_1. Informe: docs/remediation/reports/studio-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 10 archivos.

### 38. `f647d89709` — test(calendar): excluir fechas residuales de grilla y CSV

Los borradores y las fechas residuales inválidas quedan fuera de grilla, contadores y CSV.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_calendar_1. Informe: docs/remediation/reports/calendar-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 20 archivos.

### 39. `877a8c2789` — test(results): rechazar fichas personales sin alterar métricas

Las notas rechazan fichas identificables explícitas y conservan las métricas anteriores ante un error.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_results_1. Informe: docs/remediation/reports/results-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 12 archivos.

### 40. `22e8c0de68` — test(uploads): preservar nombres Unicode y descargas exactas

Los nombres Unicode nuevos se conservan al subir, buscar y descargar el archivo original.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_assets_1. Informe: docs/remediation/reports/assets-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 18 archivos.

### 41. `e57f86ba46` — test(uploads): cubrir el límite inclusivo de 25 MiB y la limpieza

Los TXT UTF-8 válidos se aceptan hasta 25 MiB inclusive; el exceso tiene un error específico y no deja archivos parciales.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_assets_2. Informe: docs/remediation/reports/assets-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 14 archivos.

### 42. `b59b04764a` — test(sources): convertir HN a RSS sin arrastrar consultas ocultas

Cambiar el tipo de fuente elimina consultas incompatibles y el resumen muestra el feed RSS real.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_sources_1. Informe: docs/remediation/reports/sources-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 17 archivos.

### 43. `1b2df1b40d` — test(sources): alinear YouTube y Apify con la plataforma elegida

Cambiar entre YouTube y Apify mantiene una plataforma compatible con lo que muestra el formulario.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_sources_2. Informe: docs/remediation/reports/sources-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 18 archivos.

### 44. `7e826b58b8` — test(publishing): confirmar destino y versión antes de enviar

La interfaz permite un envío explícito con confirmación de destino y versión, permisos y recibos.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_providers_1. Informe: docs/remediation/reports/providers-1.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 14 archivos.

### 45. `6af647478a` — test(navigation): conservar la audiencia al cancelar una salida

Recargar o salir de Audiencia protege los cambios pendientes y permite cancelar sin perder campos.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_navigation_1. Informe: docs/remediation/reports/navigation-1.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 6 archivos.

### 46. `9089374390` — test(mobile): filtrar referencias y restaurar el foco al borrar

La búsqueda de Referencias sigue visible en móvil y permite filtrar, borrar y conservar el foco.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_navigation_3. Informe: docs/remediation/reports/navigation-3.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 11 archivos.

### 47. `209677f075` — test(signals): verificar 160 caracteres y texto largo en móvil

El tema se limita a los 160 caracteres admitidos; el texto largo se muestra completo sin desbordar.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_signals_3. Informe: docs/remediation/reports/signals-3.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 10 archivos.

### 48. `db550c8140` — test(discovery): decodificar entidades sin ejecutar etiquetas

Las entidades HTML de Hacker News se leen correctamente, sin doble decodificación ni ejecutar etiquetas.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_discovery_2. Informe: docs/remediation/reports/discovery-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 16 archivos.

### 49. `d03e6ada4c` — test(results): corregir notas conservando decimales y registro

Corregir sólo las notas conserva los decimales exactos y el mismo registro de resultados.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_results_2. Informe: docs/remediation/reports/results-2.md.

Esta comprobación es interactiva en el navegador y queda documentada con sus observaciones y capturas; no se presenta como un test automatizado adicional.

Alcance: 8 archivos.

### 50. `27815d8648` — test(navigation): proteger una fuente ante Escape y recarga

Escape y las demás salidas protegen la fuente en edición; cancelar conserva el formulario.

Registrar la reproducción del defecto y la comprobación posterior del responsable fix_navigation_2. Informe: docs/remediation/reports/navigation-2.md.

Añadir la regresión ejecutable y la evidencia interactiva disponible; los transportes controlados permanecen identificados como simulación.

Alcance: 12 archivos.

### 51. `7d407fff11` — test(integration): cerrar 25 correcciones con 373 pruebas y recorrido completo

Consolidar los 25 responsables, las reproducciones y los resultados integrados. Conservar los 257 archivos de la auditoría original y verificar los digest del código y del build.

Registrar 373 pruebas, compilación, recorrido completo en escritorio y móvil, CSV exacto y corrección de resultados sin duplicación. Mantener separados los datos ficticios, los proveedores simulados y la operación externa no comprobada.

Alcance: 27 archivos.

- test: 373/373 pruebas.
- build: aprobado.

## Cierre

El commit final es `docs(delivery): documentar operación, validación y la historia de cambios` y contiene las instrucciones de operación, la validación vigente y este índice.

La última instantánea de código aprobó 373 pruebas y la compilación. El recorrido compilado y las evidencias originales permanecen en [la validación integrada](remediation/SUMMARY.md).

Los directorios de ejecución, las bases, los secretos, node_modules y dist permanecen fuera de Git. Las rutas temporales citadas en informes son contexto de la ejecución local; las regresiones automatizadas crean sus propias fixtures.

## Revisión de términos y permisos de acceso — 18 de octubre de 2026

Esta serie posterior reemplaza la activación por credenciales por controles de permiso. No establece una certificación legal universal. Validación conjunta final: **422 pruebas aprobadas**, cero fallos/omitidas/canceladas, compilación y TypeScript correctos; comprobación de navegador en 390 y 1440 píxeles. [Matriz y evidencia de revisión](compliance/README.md).

53. `a64875694f` — feat(policy): require scoped and expiring reviews for external access
54. `de9c204818` — fix(egress): verify AI providers and publication destinations before sending data
55. `b878e09b28` — fix(sources): block unapproved scraping and retain immutable ingestion permissions
56. `573fafef2e` — fix(audience): exclude restricted evidence from observations and opportunity analysis
57. `1b988cf10e` — feat(editorial): preserve dataset credits through discovery drafts and exports
58. `5f44f39db6` — fix(settings): explain blocked connectors and keep owned-content onboarding usable
59. `dc2ba4bd57` — fix(privacy): self-host licensed fonts and remove browser CDN requests
60. `a5062668f0` — test(compliance): reproduce credential provenance redirect and revocation bypasses
61. `fc12a81e7b` — test(providers): verify restricted collection cannot spend mutate or derive metrics
62. `9938e6e8b2` — test(workflow): retain permitted scenarios with explicit synthetic source reviews
63. `a509660eb1` — docs(compliance): record official terms feature dispositions and final evidence
64. `docs(commits): document the source-permission hardening series` — índice de la serie y límites de su validación.

## Ajustes solicitados por el usuario — 18 de octubre de 2026

65. `b908d26` — fix(settings): remove provider terms links from connector cards

    Retirar los enlaces «Consultar condiciones del proveedor» de las tres tarjetas, manteniendo sus estados. Build y comprobación interactiva correctos.

66. `91b198e` — feat(platform): remove Telegram integration and retire saved credentials

    Eliminar Telegram de ajustes, selección de canales, contratos públicos, recepción y envío Bot API. Rechazar configuraciones antiguas sin modificar otros conectores; impedir el reenvío de piezas antiguas a webhooks. Borrar sus credenciales y cursores al arrancar y conservar contenido e historial.

    Migrar las regresiones de publicación a webhooks y comprobar retirada por HTTP, control de origen, limpieza de arranque y bloqueo de salida. Suite completa: **427 aprobadas**, cero fallos; build y TypeScript correctos. Ajustes y creación de contenido revisados en navegador; vistas previas actualizadas.

67. `docs(product): align workflow and validation with Telegram removal` — actualizar alcance vigente, matriz de funciones, evidencia de validación e índice de cambios.

## Servicios gestionados y arranque sin configurar proveedores

68. `6964357` — feat(platform): inherit managed AI and prepare first discovery automatically

    Unificar la configuración compartida de IA, separar disponibilidad de credenciales guardadas y proteger la clave de plataforma frente a cambios de destino o modelo por empresa. Preparar fuentes permitidas y compartir el primer descubrimiento entre entradas concurrentes. Añadir chequeo de despliegue y diez regresiones iniciales.

69. `a1f86db` — feat(ux): let teams start without provider setup

    Mostrar servicios incluidos, dejar ajustes avanzados en desplegables e iniciar el descubrimiento al completar contexto y audiencia. Exponer carga, fallos parciales y reintento. Actualizar las oportunidades derivadas cuando cambian los datos del espacio.

70. `e1d871c` — fix(integrations): recover platform defaults and clear stale preparation failures

    Permitir volver a la IA de plataforma desde una configuración desactivada, sin pedir otra clave. Sustituir el estado fallido inicial después de una búsqueda manual o periódica correcta. Dos regresiones adicionales: suite completa con **439 aprobadas**, build y TypeScript correctos.

71. `docs(operations): record managed-service readiness and live source verification` — documentar configuración central, chequeo sin secretos, comprobación real de fuentes, recorrido de empresa sin credenciales y límites de activación pendientes.
