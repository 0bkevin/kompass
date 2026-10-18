# Resultado de la revisión adversarial

21 agentes nuevos e independientes revisaron 21 funcionalidades mediante navegador T3, con host, cuenta y SQLite propios. Se registraron 343 escenarios: 300 PASS, 28 FAIL y 15 BLOCKED. Son escenarios registrados, no una certificación exhaustiva ni un conteo de peticiones HTTP.

Se confirmaron 26 hallazgos por funcionalidad, agrupados en 25 defectos distintos. El duplicado de referencias fue descubierto por dos revisores independientes y se cuenta una sola vez en la agrupación. Los informes originales permanecen separados.

## Prioridad de corrección

Esta priorización pertenece a la consolidación; los informes de cada agente conservan sus resultados independientes.

1. Aplicar las restricciones de datos personales y procedencia pública en todas las entradas: company-2, signals-1/2, results-1 y references-2.
2. Corregir la lectura de crecimiento y el conteo de evidencia: opportunities-1 y el grupo references-1/opportunities-2. Afectan directamente la confianza de la decisión editorial.
3. Completar el resultado utilizable de creación y entrega: studio-1 y providers-1. Revisar el texto producido además de los metadatos, y permitir usar las integraciones que la interfaz ofrece configurar.
4. Preservar las decisiones y el trabajo del usuario: company-1, navigation-1, assets-1 y las demás inconsistencias de formulario, calendario, actualización y móvil detalladas debajo.

## Cobertura individual

| Funcionalidad                                                                            | Resultado | PASS | FAIL | BLOCKED | Hallazgos                                |
| ---------------------------------------------------------------------------------------- | --------- | ---: | ---: | ------: | ---------------------------------------- |
| [Autenticación](reports/auth.md)                                                         | PASS      |   14 |    0 |       0 | Sin fallos confirmados                   |
| [Alta guiada de empresa](reports/onboarding.md)                                          | PASS      |    8 |    0 |       0 | Sin fallos confirmados                   |
| [Empresa y contenido después del alta](reports/company.md)                               | FAIL      |   10 |    2 |       1 | company-1, company-2                     |
| [Perfiles de audiencia y necesidades](reports/audience.md)                               | FAIL      |   11 |    1 |       0 | audience-1                               |
| [Señales de audiencia públicas y editoriales](reports/signals.md)                        | FAIL      |   12 |    3 |       0 | signals-1, signals-2, signals-3          |
| [Sensor comunitario: gestión y pregunta pública](reports/community.md)                   | FAIL      |   12 |    1 |       0 | community-1                              |
| [Descubrimiento público](reports/discovery.md)                                           | FAIL      |   11 |    2 |       1 | discovery-1, discovery-2                 |
| [Captura y organización de referencias](reports/references.md)                           | FAIL      |   15 |    3 |       0 | references-1, references-2, references-3 |
| [Oportunidades: prioridad, afinidad y crecimiento](reports/opportunities.md)             | FAIL      |   16 |    2 |       0 | opportunities-1, opportunities-2         |
| [Análisis semántico opcional de oportunidades](reports/semantic.md)                      | PARTIAL   |   21 |    0 |       1 | Sin fallos confirmados                   |
| [Análisis de referencias y lectura audiovisual](reports/video.md)                        | PARTIAL   |   12 |    0 |       1 | Sin fallos confirmados                   |
| [Generación y edición de borradores](reports/studio.md)                                  | FAIL      |    9 |    3 |       2 | studio-1                                 |
| [Revisión, comentarios y aprobación versionada](reports/approval.md)                     | PARTIAL   |   16 |    0 |       1 | Sin fallos confirmados                   |
| [Programación, calendario y exportación](reports/calendar.md)                            | FAIL      |   10 |    1 |       1 | calendar-1                               |
| [Resultados y aprendizaje](reports/results.md)                                           | FAIL      |   15 |    2 |       0 | results-1, results-2                     |
| [Archivos](reports/assets.md)                                                            | FAIL      |   18 |    2 |       0 | assets-1, assets-2                       |
| [CRUD y configuración de fuentes](reports/sources.md)                                    | FAIL      |   18 |    2 |       1 | sources-1, sources-2                     |
| [Integraciones, credenciales, presupuestos y publicación opcional](reports/providers.md) | FAIL      |   22 |    1 |       4 | providers-1                              |
| [Equipo, roles e aislamiento](reports/permissions.md)                                    | PARTIAL   |   20 |    0 |       1 | Sin fallos confirmados                   |
| [Inicio, navegación, responsive, búsqueda y guardias](reports/navigation.md)             | FAIL      |   15 |    3 |       0 | navigation-1, navigation-2, navigation-3 |
| [Actualización automática, cadencia y backoff](reports/scheduler.md)                     | PARTIAL   |   15 |    0 |       1 | Sin fallos confirmados                   |

## Defectos confirmados

### P2 · Guardar un cambio de nombre reemplaza silenciosamente un mercado permitido por la propuesta

**company-1** · [Informe independiente](reports/company.md).

Esperado: Editar un campo conserva el mercado que el usuario ya confirmó. Un mercado permitido en la propuesta debe seguir representándose en el formulario del perfil.

Observado: La propuesta admite mercado libre. El select del perfil tiene opciones fijas sin Costa Rica y cae en la primera opción. brandPatchInput detecta esa diferencia involuntaria y la envía en el PATCH junto al nombre; se pierde la selección de mercado.

Código: `src/features/Journey.tsx:1707`, `src/features/Brand.tsx:50`, `src/features/Brand.tsx:197`, `src/features/Brand.tsx:356`.

[Captura](evidence/company-applied-costa-rica.png)
[Captura](evidence/company-market-before-save.png)
[Captura](evidence/company-market-after-save.png)

### P2 · La redacción conserva direcciones de contacto etiquetadas dentro del párrafo

**company-2** · [Informe independiente](reports/company.md).

Esperado: El contrato de contexto exige redactar contactos en extractos. El domicilio explícito sintético debería omitirse junto al correo.

Observado: La UI y el registro persistido mantienen «Dirección: Calle Inventada 456, Ciudad Sintética»; sólo omiten el correo. La regla de domicilio sólo coincide al inicio del texto o de una línea. Es un fallo parcial de redacción dentro del workspace, reproducido exclusivamente con datos ficticios; no demuestra filtración de datos reales ni ruptura de aislamiento.

Código: `docs/IMPLEMENTATION.md:9`, `server/company-context.mjs:153`, `server/company-context.mjs:588`, `server/company-context.mjs:608`.

[Captura](evidence/company-inline-contact-address.png)

### P2 · Se guardan perfiles con rol y necesidades vacíos al introducir espacios

**audience-1** · [Informe independiente](reports/audience.md).

Esperado: Rechazar los dos campos obligatorios vacíos tras eliminar espacios.

Observado: PATCH 200 crea perfil con role:'' y needs:''; tras recarga la tarjeta persiste sin rol ni necesidad. Se reprodujo dos veces. Registro conservado: 8e128450-3d77-4a32-8e7a-b6c8037c8249, Blancos — reproducción sintética.

Código: `src/features/Brand.tsx:575`, `src/features/Brand.tsx:606`, `src/features/Brand.tsx:630`, `server/core.mjs:100`, `server/core.mjs:307`, `server/core.mjs:309`.

[Captura](evidence/audience-whitespace.png)

### P2 · Se guardan fichas individuales con nombre en el corpus de señales

**signals-1** · [Informe independiente](reports/signals.md).

Esperado: No persistir nombres o filas individuales: el contrato exige necesidades agregadas, sin perfiles individuales.

Observado: POST 201 (UI id be337ae7-3666-4c46-8e37-60f520df43ee; prueba HTTP id 11adc815-f895-4e85-a5c3-6d1d01185b46). La ficha se conserva en SQLite/GET y se muestra como Hipótesis del equipo de Ventas. No hubo datos de personas reales en esta auditoría.

Código: `server/audience-insights.mjs:842`, `server/audience-insights.mjs:844`, `docs/IMPLEMENTATION.md:18`, `PRODUCT.md:31`.

[Captura](evidence/signals-individual-row.png)

### P2 · La validación de datos personales se elude mediante la URL de evidencia

**signals-2** · [Informe independiente](reports/signals.md).

Esperado: Rechazar el email en cualquier campo de la señal, incluida la cita.

Observado: 201 y persistencia completa del email en sourceUrl; la UI ofrece Consultar evidencia con ese href. El mismo email dentro de note se rechaza con 400. publicLink sólo revisa algunos nombres de parámetros y no los valores o la ruta.

Código: `server/audience-insights.mjs:132`, `server/audience-insights.mjs:136`, `server/audience-insights.mjs:844`, `server/audience-insights.mjs:852`, `docs/IMPLEMENTATION.md:18`.

[Captura](evidence/signals-pii-citation-saved.png)

### P2 · El sensor mantiene conteos antiguos aunque Actualizar renueve sus señales

**community-1** · [Informe independiente](reports/community.md).

Esperado: La acción visible para actualizar evidencia debe permitir que señales y resultados del sensor reflejen el mismo conjunto de respuestas, o el sensor debe tener una actualización explícita y fecha de consulta.

Observado: Las señales pasan a 3 respuestas de 6 pero la encuesta en la misma página continúa con total 10 y Ventas 3 de 5 y 2 de 5. Antes también permaneció en total 9 tras alcanzarse 5 en Formación. La recarga del documento recupera exactitud; no se observó pérdida en SQLite.

Código: `src/features/Community.tsx:93`, `src/features/Community.tsx:107`, `src/features/Community.tsx:310`, `src/features/Journey.tsx:1885`.

[Captura](evidence/community-update-mismatch.png)
[Captura](evidence/community-stale-nine.png)
[Captura](evidence/community-reloaded-ten.png)

### P2 · El clasificador bloquea el RSS público de NASA al tratar 192.0/16 como reservado

**discovery-1** · [Informe independiente](reports/discovery.md).

Esperado: La dirección 192.0.66.108 no pertenece al bloque especial 192.0.0.0/24 y el RSS público accesible debe consultarse.

Observado: UI/API: «No se permite acceder a direcciones privadas o reservadas.» NASA aporta 0 referencias aunque su RSS devuelve 10 entradas. isPublicAddress retorna false porque server/connectors.mjs:34 rechaza cualquier 192.0.x.x. Es un fallo de la aplicación, no bloqueo externo.

Código: `server/connectors.mjs:34`, `server/connectors.mjs:100`, `server/intelligence.mjs:656`.

[Captura](evidence/discovery-nasa-rejected.png)

### P2 · La captura manual duplica publicaciones y aumenta la evidencia contada

**references-1** · [Informe independiente](reports/references.md).

Esperado: Conservar una referencia por URL o advertir del duplicado antes de crear otra, conforme a la deduplicación del recorrido de importación/enlaces.

Observado: Dos registros: 661dc990-99e3-4fb7-985d-9884d93e1f3e y b6b74028-1a9b-4cad-9b1e-ac875044314c. La UI muestra dos filas idénticas; cada una tiene estado independiente. La segunda usa el idioma predeterminado en y la primera es; no se alega identidad byte a byte de todo el registro.

Código: `docs/TRANSCRIPT-TO-PRODUCT.md:7`, `src/features/Discovery.tsx:1688`, `server/core.mjs:1084`.

[Captura](evidence/references-duplicate.png)

**opportunities-2** · [Informe independiente](reports/opportunities.md).

Esperado: La oportunidad debe deduplicar la referencia por identidad/URL antes de contar evidencias o advertir que son copias de la misma publicación.

Observado: Se crean dos IDs (dd3acfc7-b970-4c39-b5ef-82ccbb97ac14 y 5648e52e-e478-4b56-9636-dd72237e288c) con idéntica URL, título, texto y fuente Equipo. La oportunidad presenta 2 referencias disponibles y dos Consultar original al mismo destino. Con qa-sales-1 sembrada existe además otra copia del mismo destino en otro grupo; la prueba de doble conteo se sostiene sólo con los dos guardados UI.

Código: `server/core.mjs:1091`, `server/audience-insights.mjs:489`, `server/audience-insights.mjs:581`.

[Captura](evidence/opportunities-duplicate-evidence.png)

### P2 · La captura manual admite fuentes de loopback fuera del límite de contenido público

**references-2** · [Informe independiente](reports/references.md).

Esperado: Rechazar hosts locales/privados como fuente original en el flujo de referencias públicas y conservar los campos para corregir.

Observado: POST 201 y registro ecd72dbe-632c-4943-a5be-fc0ad84684dd; el detalle ofrece Ver original apuntando a loopback. Es una validación del corpus/origen insuficiente. No se observó ni se afirma SSRF, lectura privada ni navegación al destino.

Código: `PRODUCT.md:31`, `docs/TRANSCRIPT-TO-PRODUCT.md:24`, `server/core.mjs:139`, `server/core.mjs:407`, `src/features/Discovery.tsx:1083`.

[Captura](evidence/references-private-url.png)

### P2 · El detalle de una referencia documental no permite consultar su adjunto

**references-3** · [Informe independiente](reports/references.md).

Esperado: Acceso al archivo original o previsualización desde el detalle de la referencia, conservando su procedencia y contenido para revisión.

Observado: La referencia e5fc29f7-9b6a-496b-81d9-5029750bdf6a apunta al asset 1e3e0e32-61c8-43b7-ad1a-55ba3d0ccb10; el archivo existe y su GET devuelve 200 y contenido correcto. El modal carece de enlaces y medios, y sólo ofrece Cerrar/Analizar referencia/Crear guion. No es pérdida física del archivo, sino falta de acceso contextual desde la referencia.

Código: `docs/TRANSCRIPT-TO-PRODUCT.md:11`, `src/features/Discovery.tsx:1091`, `src/features/Discovery.tsx:1092`.

[Captura](evidence/references-attachment-detail.png)

### P2 · Descensos y muestras estables reciben la etiqueta verde «Crecimiento observado»

**opportunities-1** · [Informe independiente](reports/opportunities.md).

Esperado: Un descenso de 3 a 1 publicaciones debe describirse como descenso o ausencia de crecimiento; valores iguales tampoco deben anunciar crecimiento.

Observado: La explicación muestra 1 frente a 3 y «No se observó aumento de frecuencia», pero growth.label=observed activa un badge verde «Crecimiento observado». También se reproduce con 1→1 y 0→0. Esto puede orientar una decisión editorial a una señal de crecimiento inexistente.

Código: `server/audience-insights.mjs:328`, `src/features/Journey.tsx:55`, `src/features/Journey.tsx:866`.

[Captura](evidence/opportunities-decline-labelled-growth.png)

### P2 · La estructura local pega la dirección editorial en el guion e ignora el formato y CTA pedidos

**studio-1** · [Informe independiente](reports/studio.md).

Esperado: Una estructura local puede ser preliminar, pero debe reflejar el formato elegido y la dirección proporcionada sin presentar las instrucciones como texto para publicar; el CTA solicitado debe quedar en su campo o declararse claramente que no pudo aplicarse.

Observado: En tres creaciones UI, los metadatos son correctos pero el contenido usa la misma plantilla de cinco bloques/escenas. Incluye literalmente «Dirección editorial:» y las instrucciones; CTA fijo «Comparte qué caso quieres poner a prueba.». Carrusel carece de cuatro láminas y newsletter de asunto/saludo/secciones. Desde Oportunidades incluso queda «Crear un post original...» junto a la instrucción de newsletter. La edición manual permite recuperar el flujo; el defecto no se clasifica P1.

Código: `server/intelligence.mjs:1861`, `server/intelligence.mjs:1865`, `server/intelligence.mjs:1873`, `server/intelligence.mjs:1874`, `src/features/Journey.tsx:830`.

[Captura](evidence/studio-directions-and-cta.png)
[Captura](evidence/studio-local-reference.png)
[Captura](evidence/studio-opportunity-newsletter.png)

### P2 · Una fecha residual mantiene un borrador sin aprobación en la grilla y el CSV

**calendar-1** · [Informe independiente](reports/calendar.md).

Esperado: Al invalidar aprobación y abandonar scheduled, retirar la fecha de programación o excluir borradores/revisión del plan, próximos y exportación; octubre y semana deberían contar 1 pieza programada en esta fixture.

Observado: El borrador corregido conserva 22/10 16:20. Calendario muestra 2 piezas, lo coloca en Próximas en salir y lo exporta con Estado=Borrador. La edición normal desde UI sí limpia la fecha; el fallo requiere estado aceptado por API, no se reprodujo originándolo por el editor UI. No hubo publicación externa ni un borrador etiquetado como publicado.

Código: `server/core.mjs:663`, `server/core.mjs:672`, `src/features/Calendar.tsx:98`, `src/features/Calendar.tsx:129`, `src/features/Calendar.tsx:145`.

[Captura](evidence/calendar-draft-still-counted.png)

### P2 · Las notas de resultados permiten guardar fichas identificables de contactos

**results-1** · [Informe independiente](reports/results.md).

Esperado: Rechazar o anonimizar la ficha individual, manteniendo resultados y aprendizajes agregados conforme al límite del producto.

Observado: Se guardó sin aviso ni anonimización: «SINTÉTICO. Contacto individual: Persona QA, persona-qa@example.com, teléfono +52 55 1234 5678; pidió formación.». El texto se persistió en outcomes.notes y volvió a mostrarse tras recargar. Es un control ausente en las notas; no se demostró exposición entre cuentas ni se usaron personas reales.

Código: `PRODUCT.md:31`, `docs/TRANSCRIPT-TO-PRODUCT.md:24`, `server/audience-insights.mjs:905`, `src/features/Journey.tsx:2623`.

[Captura](evidence/results-personal-notes.png)

### P2 · Los nombres UTF-8 se corrompen al subir y dejan de encontrarse por su nombre original

**assets-1** · [Informe independiente](reports/assets.md).

Esperado: Mantener el nombre Unicode original en almacenamiento, biblioteca, búsqueda, detalle y cabecera de descarga.

Observado: El resultado local dice ñandú pero el registro y la tarjeta dicen Ã±andÃº. Buscar ñandú no encuentra el archivo. La descarga nativa recibe 03-Ã±andÃº & _prueba_ #100%.txt. La sustitución de comillas por guiones bajos es saneamiento del navegador; el mojibake ya existe en el servidor. El contenido conserva sus 57 bytes exactos.

Código: `server/core.mjs:775`, `server/core.mjs:1244`, `server/core.mjs:1283`, `src/features/Assets.tsx:32`.

[Captura](evidence/assets-1-unicode.png)
[Captura](evidence/assets-1-search.png)

### P2 · Un TXT válido de 11 MiB falla pese al límite anunciado de 25 MB

**assets-2** · [Informe independiente](reports/assets.md).

Esperado: Aceptar el TXT dentro del límite anunciado o informar del límite específico antes de subir y explicar el rechazo por tamaño.

Observado: El TXT de 11 MiB recibe 400 Formato no admitido y no se guarda; el de 10 MiB recibe 201 y sí queda en la biblioteca. La UI sólo valida 25 MiB y no informa el límite de 10 MiB para texto.

Código: `server/core.mjs:824`, `server/core.mjs:826`, `server/core.mjs:829`, `src/features/Assets.tsx:41`, `src/features/Assets.tsx:265`.

[Captura](evidence/assets-2-text-limit.png)

### P2 · Cambiar HN a RSS conserva una consulta oculta y el resumen oculta el feed real

**sources-1** · [Informe independiente](reports/sources.md).

Esperado: La configuración y su resumen deben reflejar sólo campos aplicables al nuevo tipo; RSS debe mostrar el feed.

Observado: El registro RSS conserva query=agent reliability, que ya no se puede editar desde el modal RSS. La fila prioriza esa query sobre la URL y presenta una configuración incorrecta al usuario. El feed sí quedó guardado; no se afirma que el fetch de RSS use esa query.

Código: `src/features/Settings.tsx:1310`, `src/features/Settings.tsx:260`, `src/features/Settings.tsx:455`, `server/core.mjs:702`.

[Captura](evidence/sources-hn-to-rss-stale-summary.png)

### P2 · YouTube→Apify muestra Instagram pero conserva plataforma incompatible y rechaza el guardado

**sources-2** · [Informe independiente](reports/sources.md).

Esperado: Seleccionar Apify debe inicializar su plataforma a Instagram/TikTok y mantener select, etiqueta URL y payload coherentes.

Observado: El select muestra Instagram, la etiqueta dice URL de TikTok y Guardar rechaza Apify admite fuentes de Instagram o TikTok. Reseleccionar Instagram permite guardar con platform=instagram. Causa inferida y respaldada por código: platform permanece youtube al cambiar el tipo.

Código: `src/features/Settings.tsx:1317`, `src/features/Settings.tsx:267`, `src/features/Settings.tsx:1376`, `server/core.mjs:738`.

[Captura](evidence/sources-youtube-to-apify-error.png)

### P2 · Los conectores de publicación se configuran, pero no se pueden usar desde la interfaz

**providers-1** · [Informe independiente](reports/providers.md).

Esperado: La promesa de Settings de publicar texto aprobado mediante Telegram/webhook debe ser accesible mediante una acción explícita con aprobación, separada de programar, o una explicación operable del uso de la integración.

Observado: El usuario puede guardar ambas conexiones pero la pieza approved/scheduled carece de acción Publicar. Planificar sólo cambia status/scheduledFor; el calendario remite a publicar manualmente desde canales. El endpoint de backend existe, pero ninguna alternativa UI lo expone o explica. No se validó entrega real.

Código: `src/features/Settings.tsx:975`, `src/features/Settings.tsx:1049`, `src/features/Studio.tsx:952`, `src/features/Studio.tsx:1005`, `src/features/Calendar.tsx:670`, `server/intelligence.mjs:2077`.

[Captura](evidence/providers-configured-telegram.png)
[Captura](evidence/providers-configured-webhook.png)
[Captura](evidence/providers-approved-no-publish.png)
[Captura](evidence/providers-schedule-dialog.png)
[Captura](evidence/providers-scheduled-no-publish.png)
[Captura](evidence/providers-calendar-manual.png)

### P2 · Recargar Audiencia pierde el perfil en edición sin advertencia

**navigation-1** · [Informe independiente](reports/navigation.md).

Esperado: Advertencia para cancelar/descartar o restauración de la edición.

Observado: Recarga directa sin diálogo beforeunload; desaparece el modal y el texto. Escape sí protege el mismo formulario.

Código: `src/features/Brand.tsx:437`, `src/features/Brand.tsx:448`, `src/App.tsx:201`.

[Captura](evidence/navigation-audience-before.png)
[Captura](evidence/navigation-audience-after.png)

### P2 · La búsqueda de Referencias desaparece en móvil sin alternativa

**navigation-3** · [Informe independiente](reports/navigation.md).

Esperado: Control de búsqueda visible/alcanzable o alternativa móvil que permita filtrar.

Observado: El único .global-search queda display:none y no hay botón de búsqueda alternativo. No se puede buscar por texto en Referencias desde móvil.

Código: `src/App.tsx:571`, `src/workspace.css:363`, `src/workspace.css:374`.

[Captura](evidence/navigation-mobile-search.png)
[Captura](evidence/navigation-desktop-search.png)

### P3 · El formulario permite temas más largos que el límite real de guardado

**signals-3** · [Informe independiente](reports/signals.md).

Esperado: La UI debe usar el límite de 160 o explicarlo antes de enviar.

Observado: El campo maxLength:200 considera válido el tema, pero el servidor devuelve 400 por máximo 160. Se requiere una corrección manual; el texto no se pierde.

Código: `src/features/Journey.tsx:2014`, `server/audience-insights.mjs:842`.

[Captura](evidence/signals-limits.png)

### P3 · Hacker News deja entidades HTML hexadecimales visibles en las referencias

**discovery-2** · [Informe independiente](reports/discovery.md).

Esperado: Mostrar https://... y apóstrofes como texto legible, manteniendo el saneamiento HTML.

Observado: Texto visible y persistido contiene &#x2F; y otros textos contienen &#x27;. La limpieza sólo decodifica unas pocas entidades; el enlace Ver original funciona. La evidencia sigue disponible pero pierde legibilidad.

Código: `server/intelligence.mjs:40`, `server/intelligence.mjs:617`, `src/features/Discovery.tsx:799`, `src/features/Discovery.tsx:1091`.

[Captura](evidence/discovery-hn-entities.png)

### P3 · API y UI discrepan sobre fracciones y bloquean una corrección de notas

**results-2** · [Informe independiente](reports/results.md).

Esperado: El formulario debe aceptar los valores admitidos por API o la API debe aplicar la misma regla de enteros; corregir una nota no debe obligar a cambiar cifras válidas previamente guardadas.

Observado: Los campos de las tres métricas quedaron con validity.valid=false por step=1; el navegador bloqueó el submit y la nota anterior siguió persistida. El contrato API documentado exige finitos en rango y no exige enteros; el hallazgo es la incompatibilidad de edición, no que aceptar fracciones por sí solo viole ese contrato.

Código: `server/audience-insights.mjs:640`, `src/features/Journey.tsx:2596`, `src/features/Journey.tsx:2607`, `src/features/Journey.tsx:2618`.

[Captura](evidence/results-fraction-correction.png)

### P3 · Fuentes y equipo descarta una fuente en edición con Escape sin confirmación

**navigation-2** · [Informe independiente](reports/navigation.md).

Esperado: Pedir confirmación de descarte o conservar borrador.

Observado: Escape cierra sin diálogo; al reabrir el formulario está vacío.

Código: `src/features/Settings.tsx:1287`, `src/features/Settings.tsx:1473`.

[Captura](evidence/navigation-settings-before.png)
[Captura](evidence/navigation-settings-after.png)

## Casos registrados como pendientes

- **Empresa y contenido después del alta · Lectura real de contenido social:** Sin credenciales, LinkedIn permanece linked y avisa que no se leyó perfil ni audiencia. La lectura social real no puede comprobarse en este entorno; su ausencia no se cuenta como integración aprobada.
- **Descubrimiento público · Integración real de proveedores sociales:** No hay credenciales de operador; no se configuraron ni consumieron proveedores de pago. Se verificaron únicamente los gates, no la integración real ni su calidad.
- **Análisis semántico opcional de oportunidades · Exactitud e integración de IA REAL:** No hay credenciales reales ni autorización de gasto. Todas las respuestas exitosas/adversariales posteriores al gate provinieron de un fetcher local controlado; no se probó exactitud ni disponibilidad de un modelo real.
- **Análisis de referencias y lectura audiovisual · Lectura audiovisual real y persistencia de resultado Gemini:** No hay Gemini real ni autorización para usar claves/pago o enviar medios a terceros. No se ejecutó una integración real ni una respuesta de éxito simulada. Los gates y errores anteriores no prueban exactitud audiovisual.
- **Generación y edición de borradores · Edición separada de formato y escenas:** El editor de esta build no ofrece esos controles; permite editar el guion como texto. No se reemplazó la acción UI por escrituras API para afirmar cobertura.
- **Generación y edición de borradores · Generación con proveedor de IA real:** No hay claves ni proveedor configurado; se verificaron sólo el aviso y la estructura local. No se usaron mocks ni créditos y no se atribuye precisión a IA real.
- **Revisión, comentarios y aprobación versionada · Entrega real a un canal externo:** No probado: entorno sin claves ni destinos autorizados; no se configuraron conectores ni se enviaron publicaciones a terceros.
- **Programación, calendario y exportación · Cambio de zona horaria:** Sólo se probó navegador y servidor UTC. No se cambió zona horaria ni se cubrió DST.
- **CRUD y configuración de fuentes · Cooldown automático:** DISCOVERY_ENABLED=false es obligatorio en esta auditoría. No hay estado de próxima ejecución ni control de cooldown en /settings. Sólo se revisó como apoyo la implementación del scheduler; no demuestra su comportamiento.
- **Integraciones, credenciales, presupuestos y publicación opcional · YouTube real: acceso y cuota:** No se suministraron credenciales reales; no se hizo consulta a YouTube. Guardar una cadena sintética no acredita acceso.
- **Integraciones, credenciales, presupuestos y publicación opcional · Apify real: actores y facturación:** No hay token real ni autorización de gasto. Todas las reservas fueron sondas locales; no se ejecutó un actor ni se verificó factura.
- **Integraciones, credenciales, presupuestos y publicación opcional · IA/Gemini reales: aceptación de credenciales:** Sólo se auditó configuración con valores sintéticos. Sin claves reales, ninguna llamada a modelos. Exactitud semántica/audiovisual fuera de este alcance.
- **Integraciones, credenciales, presupuestos y publicación opcional · Entrega real Telegram/webhook:** No hay bot/destino real autorizado; no se enviaron mensajes ni publicaciones. Los flags de configuración y gates no acreditan entrega.
- **Equipo, roles e aislamiento · Copiar enlace: lectura literal real:** navigator.clipboard.readText devolvió NotAllowedError: Read permission denied. No se verificó contenido literal global.
- **Actualización automática, cadencia y backoff · RSS público NASA desde UI:** UI mostró NASA RSS: No se permite acceder a direcciones privadas o reservadas. No se importaron referencias. La recuperación se verificó cambiando la fuente a BBC por UI; la lectura NASA queda sin demostrar. No se eludió el control.

El cooldown quedó sin prueba dinámica en el informe de fuentes porque su entorno desactivaba la actualización automática. Se revisó después como funcionalidad independiente: [actualización automática](reports/scheduler.md). Ese caso se conserva como BLOCKED en el informe original y en su conteo; no equivale a una rama globalmente sin revisar.

Los proveedores sintéticos sólo verifican el recorrido y las validaciones de la aplicación. No demuestran exactitud de un modelo real, entrega a una red, costos, cuota o continuidad de una API. Las cifras, nombres y domicilios de las pruebas son ficticios. Los snapshots temporales se sembraron: no se esperaron semanas ni se demostró rendimiento comercial.

PASS significa que los casos descritos devolvieron el resultado esperado. PARTIAL separa los casos comprobados de los pendientes; FAIL exige un fallo confirmado. Los candidatos descartados y las observaciones condicionadas no se suman a los defectos. Cada informe detalla sus límites, fixtures y recuperación.

## Integridad y reproducción

Se conserva la aplicación examinada sin correcciones durante la auditoría. `manifest.json` fija el código/build de partida; `integrity.json` registra la comprobación final. Las bases temporales se conservan bajo las rutas de `inventory.json`; los procesos de prueba se detuvieron. Pasos, resultados exactos y capturas se encuentran en cada informe. El [contrato de revisión](BRIEF.md) describe el método.
