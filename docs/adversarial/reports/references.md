# Captura y organización de referencias — revisión independiente

**Resultado: FAIL.** 18 casos: 15 PASS, 3 FAIL, 0 BLOCKED. Hallazgos: 0 P1, 3 P2, 0 P3. Las pruebas corresponden a captura manual, bandeja y detalle; no equivalen a validar proveedores o contenido real.

Requisitos leídos: PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md. README.md y docs/IMPLEMENTATION.md se usaron como contexto. Se revisó el build existente sin compilar ni cambiar implementación, estilos o credenciales.

Entorno aislado: `http://127.0.0.18:4108`; DATA_DIR=`/tmp/30x-adversarial-references`; cuenta ficticia `qa-references@example.com`; empresa sintética `b9d6618e-3919-4e72-9259-89a3021361e3`. Discovery desactivado y cuatro variables de proveedor retiradas del entorno. Proceso PID 3850194, sesión 50498. Se usó exclusivamente la pestaña `tab_3t_07e54779-9ab2-4979-8a15-674c4eff160a`, con snapshots antes de interactuar. Pestaña cerrada, proceso terminado y puerto 4108 libre; base conservada para reproducir.

Los datos de referencias se crearon mediante los controles de UI. La empresa/audiencia sintéticas se prepararon por API para aislar el alcance. Se consultó `/api/brands/:id/references` y `/state`, y se recargó `/inbox` para comparar datos exactos. La consulta del archivo adjunto confirmó bytes y tipo; no se siguieron enlaces sintéticos o privados.

## Hallazgos confirmados

### references-1 · P2 · La captura manual duplica una URL ya guardada sin advertencia

Esperado: Conservar una referencia por URL o advertir del duplicado antes de crear otra, conforme a la deduplicación del recorrido de importación/enlaces.

Observado: Dos registros: 661dc990-99e3-4fb7-985d-9884d93e1f3e y b6b74028-1a9b-4cad-9b1e-ac875044314c. La UI muestra dos filas idénticas; cada una tiene estado independiente. La segunda usa el idioma predeterminado en y la primera es; no se alega identidad byte a byte de todo el registro.

Reproducción:

1. En /inbox, Agregar referencia: URL https://www.linkedin.com/posts/qa-references_ia-sintetica-123, título QA Captura IA — líderes & equipos y contexto de IA práctica.
2. Guardar y volver a abrir Agregar referencia.
3. Volver a guardar la misma URL, título y contexto.
4. Recargar /inbox y consultar GET /api/brands/b9d6618e-3919-4e72-9259-89a3021361e3/references.

Evidencia: [references-api-state.json](../evidence/references-api-state.json), [references-duplicate.png](../evidence/references-duplicate.png).

Apoyo de código/requisito: `docs/TRANSCRIPT-TO-PRODUCT.md:7`, `src/features/Discovery.tsx:1688`, `server/core.mjs:1084`. La causa estática sólo apoya el comportamiento reproducido.

### references-2 · P2 · La captura manual admite fuentes de loopback fuera del límite de contenido público

Esperado: Rechazar hosts locales/privados como fuente original en el flujo de referencias públicas y conservar los campos para corregir.

Observado: POST 201 y registro ecd72dbe-632c-4943-a5be-fc0ad84684dd; el detalle ofrece Ver original apuntando a loopback. Es una validación del corpus/origen insuficiente. No se observó ni se afirma SSRF, lectura privada ni navegación al destino.

Reproducción:

1. Abrir Agregar referencia.
2. Ingresar http://127.0.0.1:9/qa-private-reference y título QA URL privada loopback.
3. Guardar, abrir el detalle y recargar.

Evidencia: [references-api-state.json](../evidence/references-api-state.json), [references-private-url.png](../evidence/references-private-url.png).

Apoyo de código/requisito: `PRODUCT.md:31`, `docs/TRANSCRIPT-TO-PRODUCT.md:24`, `server/core.mjs:139`, `server/core.mjs:407`, `src/features/Discovery.tsx:1083`. La causa estática sólo apoya el comportamiento reproducido.

### references-3 · P2 · El detalle de una referencia documental no permite consultar su adjunto

Esperado: Acceso al archivo original o previsualización desde el detalle de la referencia, conservando su procedencia y contenido para revisión.

Observado: La referencia e5fc29f7-9b6a-496b-81d9-5029750bdf6a apunta al asset 1e3e0e32-61c8-43b7-ad1a-55ba3d0ccb10; el archivo existe y su GET devuelve 200 y contenido correcto. El modal carece de enlaces y medios, y sólo ofrece Cerrar/Analizar referencia/Crear guion. No es pérdida física del archivo, sino falta de acceso contextual desde la referencia.

Reproducción:

1. En Agregar referencia, adjuntar /tmp/qa-references-attachment.txt (texto sintético), sin enlace ni texto.
2. Guardar y abrir la referencia qa-references-attachment.txt desde /inbox.
3. Buscar una acción para ver/descargar el documento y recargar el detalle.
4. Comparar su assetId con GET /state y consultar la URL del asset.

Evidencia: [references-api-state.json](../evidence/references-api-state.json), [references-attachment-detail.png](../evidence/references-attachment-detail.png).

Apoyo de código/requisito: `docs/TRANSCRIPT-TO-PRODUCT.md:11`, `src/features/Discovery.tsx:1091`, `src/features/Discovery.tsx:1092`. La causa estática sólo apoya el comportamiento reproducido.

## Casos

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| Formulario vacío | Sin enlace, texto ni archivo, mostrar validación y no crear. | La UI mostró «Agrega un enlace, un texto o un archivo.»; permaneció abierta. El primer guardado válido produjo exactamente un registro. | PASS |
| URL mal formada | Rechazar «no es url» y permitir corregirla. | El campo type=url quedó inválido con «Please enter a URL.». Se corrigió y el flujo continuó. | PASS |
| Esquemas inseguros y credenciales | Rechazar javascript: y URLs con credenciales sin ejecutarlas. | javascript:void(0) y https://qa:qa@example.com/reference recibieron HTTP 400; no hay ninguna en el estado final. La UI mostró «URL debe usar http o https sin credenciales.» | PASS |
| Captura normal exacta | Conservar URL, título, contexto, idioma seleccionado y fuente manual. | El registro 661dc990-99e3-4fb7-985d-9884d93e1f3e conserva exactamente URL LinkedIn, título con raya/acentos/& y texto con saltos de línea; language=es, source=Equipo, format=link, tags=[]. | PASS |
| Tema, notas, fecha y métricas declaradas | Guardar el contexto aportado sin inventar datos observados. | El formulario no ofrece tema/fecha/métricas estructuradas. El tema IA práctica, notas, fecha 2026-10-15 y vistas 1234 se conservaron únicamente en text; no hay métricas ni publishedAt inventados. | PASS |
| Cancelar captura | Cancelar no debe persistir una referencia. | Se escribió «QA Cancelada — no persistir» y contexto; Cancelar cerró el modal y mantuvo dos registros. cancelledPresent=false al final. | PASS |
| Buscar por contexto y vacío | Encontrar el texto IA práctica y devolver cero para un término inexistente. | «IA práctica» devolvió la referencia; «no-existe-qa» dejó 0 filas y el contador 0. Vaciar la búsqueda restauró la fila. | PASS |
| Descartar, filtrar y restaurar | PATCH de estado exacto, filtro Descartadas correcto y persistencia al recargar. | La referencia normal pasó a dismissed; Descartadas mostró esa fila. Tras recargar seguía Descartada; Restaurar la devolvió a new sin cambiar sus datos. | PASS |
| Guardar y filtrar | Guardar en el radar y mostrar sólo esa referencia en Guardadas después de navegar/recargar. | El botón de marcador en /radar puso QA Reintento de bandeja en saved. /inbox y Guardadas mostraron exactamente esa fila y la etiqueta Guardada. | PASS |
| Repetir la misma URL manual | Aplicar deduplicación por URL, o avisar y permitir revisar la ya existente. | Guardar de nuevo la misma URL, título y contexto creó dos IDs diferentes, sin aviso. Ambas filas sobrevivieron a la recarga. | FAIL |
| Recuperación de fallo al actualizar la bandeja | Si el POST se guardó y falla GET /state, el reintento no debe duplicar. | Se simuló una única caída de GET /state en el navegador propio tras el POST real. La UI congeló campos y ofreció Recargar bandeja; count=1 antes y después del reintento; el modal cerró. | PASS |
| URL de loopback | El flujo limitado a fuentes públicas debe rechazar una URL de loopback. | http://127.0.0.1:9/qa-private-reference fue guardada con HTTP 201 y se ofrece como «Ver original». No se siguió el enlace ni se probó una petición de servidor. | FAIL |
| HTML literal | Conservar HTML como texto sin convertirlo en DOM o enlaces ejecutables. | Título y contexto con <b>, <strong> y <a href="javascript:void(0)"> se muestran literales. injectedNodes=0 y unsafeLinks=0. No se incluyeron scripts ni manejadores ejecutables. | PASS |
| Enlaces sociales sin proveedor | Conservar procedencia y distinguir enlace guardado de extracción o métricas reales. | LinkedIn y YouTube se guardaron como source=Equipo y format=link, sin plataforma/métricas inventadas. La URL de YouTube se reconoció en el detalle y avisó que Gemini no está configurado; no se lanzó análisis. | PASS |
| Fuente original de enlace | Ofrecer el href original exacto con apertura externa segura. | La referencia LinkedIn mostró Ver original con el href exacto, target=_blank y rel=noreferrer. No se visitó la URL sintética. | PASS |
| Adjunto y formato persistidos | Subir un documento sólo, conservar nombre/contenido y asociarlo a la referencia. | Se adjuntó qa-references-attachment.txt (55 bytes), sin URL/texto/título. La UI usó el nombre como título; reference.format=document y asset.type=document, mimeType=text/plain, assetId coincide. GET del archivo devolvió 200 y el texto sintético exacto. | PASS |
| Consultar original del documento desde el detalle | La referencia adjunta debe permitir abrir/descargar el documento de origen. | El modal sólo muestra el título y las acciones Analizar referencia/Crear guion. No tiene enlaces, previsualización ni control para abrir el adjunto, aunque la API conserva y entrega el archivo. | FAIL |
| Recarga final de datos | Los datos exactos y estados deben sobrevivir a una recarga completa de /inbox. | La recarga final mostró 7 filas; GET /state coincidió con títulos, URLs, texto, idioma, saved y assetId. Duplicados y URL privada también persisten. | PASS |

## Límites

- Auditoría del build existente: sin build, format, cambios de implementación ni lectura de otros informes.
- Todas las referencias y el archivo son sintéticos. La cuenta ficticia fue creada desde UI; la empresa/audiencia sintéticas se prepararon por API.
- Se probaron los campos y controles ofrecidos por UI. No hay campos estructurados para tema, fecha de publicación o métricas en el modal.
- La revisión de análisis/IA y video corresponde a otra auditoría. No se enviaron solicitudes a proveedores ni se validó contenido real de plataformas.
- La prueba de recuperación simula una caída de GET /state mediante window.fetch en la pestaña propia; el POST y la persistencia fueron reales en la base aislada. Se restauró fetch antes de continuar.
- La prueba de HTML utilizó etiquetas inertes y javascript:void(0) como texto; no scripts, manejadores ni enlaces ejecutados.
- Se verificó archivo .txt; otros tipos/tamaños, carga concurrente, móviles, roles y otras cuentas no están cubiertos.
- La fuente original de las URLs sintéticas se verificó por href y atributos; no se navegó al contenido externo o privado.

El formulario ofrece enlace, título, contexto, idioma y un adjunto; no ofrece campos separados de tema, fecha o métricas. Guardar como favorita se comprobó desde el marcador de `/radar` y se contrastó en el filtro Guardadas de `/inbox`; el detalle de `/inbox` no contiene esa acción. Las referencias de texto y enlaces mantienen el formato genérico `link`; el archivo `.txt` mantiene `document`. No se presentaron las declaraciones del contexto como métricas observadas.

El reintento posterior a un POST confirmado se probó con una única caída simulada del GET `/state` en la pestaña propia. Mostró «Referencia guardada, no se pudo actualizar», bloqueó los campos y ofreció Recargar bandeja. Antes y después había un único registro. Esa recuperación aprobada no elimina el duplicado que se genera al repetir manualmente la URL en un modal nuevo.

## Artefactos

- Informe estructurado: [references.json](references.json).
- [references-api-state.json](../evidence/references-api-state.json).
- [references-normal.png](../evidence/references-normal.png).
- [references-duplicate.png](../evidence/references-duplicate.png).
- [references-retry.png](../evidence/references-retry.png).
- [references-private-url.png](../evidence/references-private-url.png).
- [references-html-literal.png](../evidence/references-html-literal.png).
- [references-saved.png](../evidence/references-saved.png).
- [references-attachment-detail.png](../evidence/references-attachment-detail.png).

Todos los artefactos son sintéticos y no incluyen tokens, cookies ni contraseñas. No se leyeron otros informes ni se delegaron agentes.
