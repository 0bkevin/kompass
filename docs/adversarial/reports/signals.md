# Señales de audiencia públicas y editoriales

**Resultado: FAIL.** 15 casos agrupados: 12 PASS, 3 FAIL, 0 BLOCKED. Tres hallazgos confirmados: **2 P2 y 1 P3**. La matriz HTTP complementaria contiene 37 pruebas (34 PASS, 3 FAIL); forma parte de la evidencia de esos casos y no se suma como cobertura independiente.

Revisión independiente el 18 de octubre de 2026 sobre [la instancia asignada](http://127.0.0.15:4105/audience), con navegador nativo T3 y API/SQLite propios. Se leyó PRODUCT.md, docs/TRANSCRIPT-TO-PRODUCT.md, README.md y docs/IMPLEMENTATION.md como requisitos y límites. Commit `549e0bbf5b5858eb79bf069d847daee269ad344e`; build existente del 18 de octubre, 01:49:38 UTC. No se ejecutó build/format ni se modificó implementación. No se leyeron informes ajenos ni se delegó.

Base aislada: `/tmp/30x-adversarial-signals`. Cuenta ficticia: `qa-signals@example.com`. Marca principal `200e0b9c-4ffb-4594-9498-8dfecd09c890`; segmentos `segment-sales` y `segment-health`. Toda la evidencia de negocio, nombres, muestras y contenido es **sintética**, señalada como tal. No se usaron credenciales reales, proveedores ni fuentes tras login.

## Hallazgos confirmados

### signals-1 · P2 · Se guardan fichas individuales con nombre

**Esperado:** el corpus de señales admite necesidades agregadas y prohíbe nombres/perfiles o filas individuales. La prohibición está expresa en [el contrato](../../IMPLEMENTATION.md:18) y la propia UI pide evitar nombres y datos de personas.

**Reproducción UI:** /audience → Señales y validación → Origen “Hipótesis del equipo” → tema “Ficha individual · SINTÉTICO” → observación:

> FICHA INDIVIDUAL SINTÉTICA. Nombre: Ana Sintética Ejemplo. Cargo: directora comercial. Necesidad individual: preparar propuestas más rápido.

Guardar y recargar.

**Observado:** HTTP 201, id `be337ae7-3666-4c46-8e37-60f520df43ee`; se persiste y muestra como hipótesis de Ventas. El envío directo de la misma ficha también dio 201. Las consultas a SQLite/GET confirmaron su conservación. El filtrado sólo reconoce emails/teléfonos dentro de topic/note, de modo que esta fila individual explícita lo atraviesa. Es un incumplimiento reproducido del límite del corpus; no se observaron datos reales ni exposición entre marcas.

Evidencia: [captura](../evidence/signals-individual-row.png), [prueba HTTP “fila individual con nombre”](../evidence/signals-http.json), [estado final](../evidence/signals-observed.json). Causa localizada en `server/audience-insights.mjs:842–851`; requisito `docs/IMPLEMENTATION.md:18`.

### signals-2 · P2 · Un email en la cita elude la protección de datos personales

**Esperado:** un dato de contacto debe rechazarse también dentro de la cita, igual que en la observación.

**Reproducción UI:** crear señal pública con tema “Cita con identidad · SINTÉTICO”, nota agregada sin contacto y enlace `https://example.com/personas/persona.sintetica@example.com`. Guardar y recargar. Por API, repetir con `https://example.com/?contact=persona.sintetica@example.com`.

**Observado:** ambos se aceptan con 201; la URL se almacena completa y la UI genera “Consultar evidencia” con ese href. El registro UI es `061bbc7b-da3a-4cf2-ae27-85b834c372f2`. El mismo email en note es rechazado con 400. La comprobación de contacto omite sourceUrl; publicLink sólo bloquea ciertos nombres de parámetros y no inspecciona sus valores ni la ruta.

Evidencia: [fila guardada](../evidence/signals-pii-citation-saved.png), [HTTP: email en ruta y query no reconocida](../evidence/signals-http.json), [hrefs renderizados y persistencia](../evidence/signals-observed.json). Fuente: `server/audience-insights.mjs:132–144, 844–852`; requisito `docs/IMPLEMENTATION.md:18`. Las URLs no se solicitaron a terceros.

### signals-3 · P3 · La UI acepta un tema que el servidor rechaza por longitud

**Esperado:** el límite del campo debe orientar al máximo real de 160 antes de enviar.

**Reproducción UI:** con nota y enlace válidos, escribir 161 caracteres “A” en “Tema o necesidad” y guardar.

**Observado:** el campo tiene maxLength 200 y validity.valid es true; el servidor responde 400: “Tema: longitud inválida (máximo 160)”. El formulario conserva el texto y se puede corregir; no hubo pérdida de datos.

Evidencia: [captura del error](../evidence/signals-limits.png), [validez del campo y respuesta](../evidence/signals-observed.json). Fuente: `src/features/Journey.tsx:2014` frente a `server/audience-insights.mjs:842`.

## Casos ejecutados

| Caso | Esperado y observación | Resultado |
| --- | --- | --- |
| 1. Vacío y cita pública obligatoria en UI | Sin tema, observación o cita pública no se debe enviar ni crear una señal. → La validación nativa detuvo el envío. Tras rellenar tema/nota, sourceUrl siguió obligatorio; GET devolvió signals:[]. | PASS |
| 2. Alta pública por segmento y tema | Guardar la señal con la audiencia seleccionada, la cita, el origen y tres piezas revisadas. → POST 201; id 463d84ad-3ffa-414b-8dc5-f9d013dbd0d9, segment-sales, public_content, URL exacta y sampleSize:3. La fila muestra Ventas y 3 piezas revisadas. | PASS |
| 3. Alta editorial sin cita ni muestra | Una hipótesis de Salud puede guardarse sin enlace y debe conservar su carácter editorial y muestra ausente. → POST 201; segment-health y sourceType:editorial, sin sourceUrl/sampleSize. La fila mostró Hipótesis del equipo y Muestra no indicada. | PASS |
| 4. Persistencia y cautela al recargar | Las dos señales y su origen deben sobrevivir la recarga; el perfil no se convierte en audiencia observada. → Tras navegar de nuevo a /audience, ambas señales seguían en GET/UI. Perfiles mostró hipótesis editoriales del equipo; señales mantuvo etiquetas pública/editorial y muestra. | PASS |
| 5. URL privada en UI y recuperación | Rechazar una cita 127.0.0.1, conservar el formulario y permitir corregirlo. → HTTP 400 con alerta de dominio público. El contenido quedó escrito y se pudo corregir el enlace para continuar las pruebas. | PASS |
| 6. Emails y teléfonos en tema/observación | El servidor debe impedir datos de contacto en el texto agregado. → El email en la observación fue bloqueado desde UI; API bloqueó email y teléfono sintéticos con 400. | PASS |
| 7. Forma JSON, campos y tipo de señal | Rechazar campos extra, tipos incorrectos, valores vacíos, segmento ajeno y community falsificado. → Las pruebas HTTP devolvieron 400 para participant extra, topic array, vacíos, segmento inexistente y sourceType inválido. No se aceptó fingir una señal comunitaria. | PASS |
| 8. Citas privadas, sesión y esquemas inválidos | No admitir IP privadas/loopback, intranet, credenciales, puertos distintos a 80/443, javascript ni login/sesión. → 14 probes HTTP devolvieron 400, incluidos IPv4 privadas, ::1, localhost, .local, host sin punto, puerto 8080, userinfo y parámetros token/email. | PASS |
| 9. Muestra: tipo y límites de servidor | Aceptar enteros 1–10.000.000 y rechazar cero, negativos, fracciones, strings, null y exceso. → Ambos extremos dieron 201; seis muestras inválidas dieron 400. Las muestras válidas son fixtures sintéticas, no medición real. | PASS |
| 10. Borrar y cancelar borrado | Cancelar mantiene las dos señales; aceptar elimina sólo la señal editorial seleccionada. → Dismiss dejó ambas filas y registros. Accept eliminó c4fe2e18-a7f4-411b-9cc7-587d4bd5a697; la pública permaneció en GET y tras recarga posterior. | PASS |
| 11. Cambio de marca y borrado ajeno | Otra marca con el mismo ID de segmento debe aparecer vacía y no poder borrar una señal de la marca original. → En la marca b883e52c-c788-4472-9739-2b847c1779d8, GET/UI sin señales y DELETE del ID original devolvió 404; el original permaneció. Volver por selector restauró sus nueve señales. | PASS |
| 12. Relación y pesos en oportunidades | Añadir una señal debe afectar sólo su segmento; pública pesa más que editorial, manteniendo incertidumbre. → Referencia sintética Quásar zafiro: sin señal segmentIds:[], prioridad 16; editorial Ventas → sólo segment-sales, 19; borrar → [],16; pública Ventas → sólo segment-sales,25. Filtro Salud vacío y Ventas muestra oportunidad. Razones separan origen y siguen diciendo No demuestra consumo ni afinidad; crecimiento insufficient. | PASS |
| 13. Fichas individuales con nombre | Cumplir la restricción de no guardar nombres ni filas individuales de audiencia. → UI y POST aceptaron una FICHA INDIVIDUAL SINTÉTICA con nombre, cargo y necesidad individual (201), persistida y mostrada como hipótesis de Ventas. | FAIL |
| 14. Emails dentro de la cita | Rechazar datos personales también en sourceUrl, igual que en la nota. → UI guardó https://example.com/personas/persona.sintetica@example.com. API también aceptó email en ruta y en ?contact=. Todos se conservaron y renderizaron como enlaces de evidencia. | FAIL |
| 15. Límite de tema coherente entre UI/API | El campo debe orientar al límite real antes de permitir un envío aparentemente válido. → La UI tiene maxLength:200; texto de 161 caracteres pasó validity.valid y el submit llegó al servidor, que respondió 400 Tema: longitud inválida (máximo 160). El texto se conservó para corregirlo. | FAIL |

## Relación con oportunidades

Se insertó una única **referencia sintética** “Quásar zafiro” por SQLite en la base propia para aislar el efecto de las señales. La referencia fue identificada como fixture y nunca se usó para alegar una observación real. Las señales se añadieron y borraron **por UI**.

| Estado | Segmentos asociados | Prioridad editorial |
| --- | --- | --- |
| Sin señal del tema | Ninguno | 16 |
| Una hipótesis editorial para Ventas | Sólo Ventas | 19 |
| Tras borrarla por UI | Ninguno | 16 |
| Una señal pública para Ventas | Sólo Ventas | 25 |

En /opportunities, el filtro Salud mostró “Ninguna oportunidad coincide con tus filtros”; Ventas mostró la oportunidad. Las razones diferenciaron los conteos públicos/editoriales y conservaron “No demuestra consumo ni afinidad de personas”. El crecimiento siguió `insufficient`; el perfil continuó como hipótesis del equipo. Evidencia: [captura](../evidence/signals-opportunity-scope.png) y [comparaciones API/UI](../evidence/signals-observed.json).

## Límites y reproducción

- Auditoría de la versión compilada existente, commit 549e0bbf5b5858eb79bf069d847daee269ad344e y build dist/server/server.js de 2026-10-18 01:49:38 UTC; no se recompiló ni modificó implementación.
- Todas las cuentas, marcas, citas, muestras, nombres y referencia usados son sintéticos. example.com sólo documenta fixtures; no se probó exactitud de contenido externo real ni representatividad de audiencia.
- Se comprobó la relación en oportunidades con una referencia sintética insertada exclusivamente en la base aislada; no prueba descubrimiento real, IA, resultados o proveedores.
- No se auditó el sensor comunitario ni el editor de perfiles; tienen revisores separados. Tampoco se cubrió la matriz completa de roles/usuarios, concurrencia, límite de 2.000 señales o resolución DNS/redirecciones de fuentes.
- Los fallos de fichas personales y citas con email se observaron con datos sintéticos. No se observó exposición de datos reales ni cruce entre marcas en los casos ejecutados.
- La repetición cubierta consiste en corregir envíos rechazados, recargar y reemplazar una señal borrada; no se afirma deduplicación general de señales.
- Proceso propio PID 3836607, sesión 42659, detenido al finalizar; pestaña propia cerrada. Datos de reproducción conservados en /tmp/30x-adversarial-signals.

Arranque empleado, con proveedores sin credenciales y descubrimiento desactivado:

```bash
env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN \
  DATA_DIR=/tmp/30x-adversarial-signals PORT=4105 DISCOVERY_ENABLED=false \
  node server/start-host.mjs
```

Proceso propio: PID `3836607`, sesión `42659`, terminado con salida 0. Pestaña propia `tab_3q_07e54779-9ab2-4979-8a15-674c4eff160a`, cerrada al finalizar. Se verificó que el puerto 4105 quedó sin listener y que la base seguía presente con nueve señales de prueba.

El [JSON estructurado](signals.json) contiene expectativas, resultados, hallazgos y artefactos. La [matriz HTTP](../evidence/signals-http.json) conserva las entradas sintéticas y respuestas; valores ficticios de userinfo/token fueron redactados.

