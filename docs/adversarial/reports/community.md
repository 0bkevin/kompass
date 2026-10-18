# Sensor comunitario — revisión adversarial independiente

**Resultado: FAIL. 13 casos: 12 PASS, 1 FAIL, 0 BLOCKED. Un hallazgo P2 confirmado.**

Revisión del build existente el 18 de octubre de 2026, en `http://127.0.0.16:4106`. Instancia propia: `DATA_DIR=/tmp/30x-adversarial-community`, puerto 4106, PID 3837845, sesión de ejecución 43973. Se usó únicamente la pestaña propia `tab_3r` y el mismo host. Sin rebuild, cambios de implementación, credenciales reales ni lectura de informes ajenos.

## Hallazgo community-1 · P2

**El sensor mantiene conteos antiguos aunque “Actualizar” renueve sus señales.**

Con el gestor abierto en 9 respuestas, una respuesta pública adicional llevó la API y SQLite a 10 y habilitó Formación al llegar a cinco respuestas. El gestor siguió mostrando 9 y sólo Ventas. La recarga del documento recuperó el total 10 y las cuatro filas correctas.

La reproducción más clara ocurre en “Señales y validación”: con el gestor en 10, una respuesta sintética adicional llevó la API a 11 y Ventas a 3/6 y 3/6. Al pulsar **Actualizar**, las señales mostraron “3 respuestas de 6”, mientras la tabla del sensor, en la misma página, siguió mostrando total 10 y Ventas 3/5 y 2/5. La captura muestra la contradicción. No se observó pérdida de conteos en el servidor.

Pasos:

1. Crear una pregunta por UI con dos grupos y dos opciones.
2. Acumular Ventas 5 (3/2) y Formación 4; abrir el gestor y mantenerlo montado.
3. Enviar la quinta de Formación por la API pública propia. Comparar API total 10 con gestor total 9.
4. Recargar; abrir “Señales y validación”.
5. Enviar otra de Ventas/Formar al equipo. La API devuelve total 11 y Ventas 3/6, 3/6.
6. Pulsar “Actualizar”. Comparar la nota renovada con la tabla antigua.

Esperado: poder actualizar la evidencia de la vista conservando consistencia entre señales y resultados, o disponer de actualización y fecha de consulta explícitas para el sensor.

Causa probable como apoyo al comportamiento reproducido: el estado local de encuestas se carga al montar/cambiar de marca; la recarga de señales es independiente. Referencias: `src/features/Community.tsx:93`, `:107`, `:310`; `src/features/Journey.tsx:1885`.

Evidencias: [contradicción tras Actualizar](../evidence/community-update-mismatch.png), [gestor obsoleto en nueve](../evidence/community-stale-nine.png), [recuperación por recarga](../evidence/community-reloaded-ten.png).

## Casos

| Caso | Esperado antes de probar | Observado | Resultado |
| --- | --- | --- | --- |
| Crear encuesta por UI con opciones y grupos correctos | Crear exactamente una pregunta con 2 opciones y los 2 grupos de la empresa sintética. | UI creó la pregunta; API ySQLite contienen Automatizar ventas/Formar al equipo y Ventas sintéticas/Formación sintética con sus IDs correctos; total 0. | PASS |
| Validación de creación vacía e inválida | Vacío, una opción, duplicados por mayúsculas y contacto rechazan sin crear encuestas. | Pregunta vacía detenida por required; servidor rechazó una opción, duplicados y pregunta con correo. Se conservó 1 encuesta. Error visible y cancelación disponibles. | PASS |
| Enlace público y primera respuesta sin sesión | Sin sesión se permite elegir grupo/tema; submit vacío desactivado; respuesta 1 no expone desgloses. | Tras Cerrar sesión, /api/session devolvió user:null; UI pública habilitó envío sólo con grupo/tema. Respuesta 1: Ventas/Automatizar=1, resultados[], señales 0. | PASS |
| Umbral por grupo a 4 y total global 8 | Cuatro respuestas en cada grupo siguen sin desgloses ni señales aunque global 8. | Respuesta 4 de Ventas enviada por UI; fixtures propias llevaron Formación a 4. API total 8 y results[]; sin señales antes del quinto voto de Ventas. | PASS |
| Quinta respuesta y ocultación del grupo insuficiente | Ventas 5 habilita sólo Ventas, con 3/5 y 2/5; Formación 4 sigue oculta. | Quinta de Ventas enviada por UI: tabla pública yAPI muestran exactamente 3/5 y 2/5. SQLite:3+2 en Ventas y 4 en Formación;2 señales únicamente de Ventas. | PASS |
| Atribución exacta y señales de ambos grupos | ConFormación 5: filas 0/5 y 5/5; exactamente 3 señales no nulas y procedencia de encuesta. | API total 10; tabla recuperada por recarga coincide. Notas/UI/SQLite: Ventas 3/5,2/5 y Formación 5/5; señal community,aggregate=true, sampleSize 5 y pollId correctos. Cero votos no genera señal. | PASS |
| Contadores sin registros personales del participante | Sólo contador por grupo/tema; cuerpo con email o campos extra rechazado. | SQLite guarda 3 celdas agregadas; no tabla de participantes. Campoemail devolvió 400 y texto sintético no apareció en records. Cuenta operadora permanece en autenticación separada. | PASS |
| Cautelas sobre representatividad y repetición | No afirmar personas únicas ni muestra representativa; el reenvío tras recarga se entiende como respuesta voluntaria no verificada. | UI de gestión, pública y señales contienen cautelas explícitas. Misma sesión anónima pudo responder tras recarga; se contaron respuestas y ninguna UI afirmó identidades únicas. | PASS |
| Gestor abierto y botón Actualizar tras respuestas externas | Actualizar debe permitir comparar conteos y señales vigentes sin contradicciones en la misma vista. | API pasó 9→10 y apareció Formación; gestor siguió 9. Después API 11 conVentas 3/6,3/6; Actualizar renovó señales a 3/6 pero tabla siguiótotal 10 y 3/5,2/5. Recarga de documento recuperó datos. | FAIL |
| Pausa y reapertura por UI | Pausa persiste, conserva resultados, bloquea envío 409; Reabrir restablece recepción sin perder conteos. | Pausar UI produjo active=false; enlace anónimo recargado mostró pausa y tabla, sin formulario. POST 409 mantuvo total 10. Reabrir UI produjo active=true y siguiente respuesta fue 200,total 11. | PASS |
| Respuestas inválidas y administración anónima | Grupo/opción ajenos, faltantes, JSON nulo y campos personales no incrementan; gestión exige sesión. | Cinco solicitudes inválidas 400, total siguió 10. Tras logout, GET gestión/PATCH/DELETE devolvieron 401. No se guardaron datos del cuerpo rechazado. | PASS |
| Eliminar, cancelar, confirmar y desaparición de señales | Cancelar conserva 1 encuesta; confirmar elimina encuesta y 3 señales; recarga deja vacío y enlace deja de funcionar. | Cancelación conservó 1,total 11. Confirmación UI: gestor vacío; tras recarga señales vacías; SQLite communityPolls 0/audienceSignals 0. GET/POST público 404. | PASS |
| Estado de error público y reintento | Enlace borrado muestra error legible y reintento sin inventar resultados. | UI mostró No pudimos abrir esta pregunta / No se encontró esta pregunta / Reintentar; pulsarlo conservó 404 y estado legible. | PASS |

## Datos y exactitud

Se preparó por API una cuenta ficticia `qa-community@example.com`, una empresa sintética y dos grupos: Ventas sintéticas y Formación sintética. La encuesta se creó por UI. Sus opciones fueron “Automatizar ventas” y “Formar al equipo”; API y SQLite confirmaron los mismos grupos y opciones.

Las respuestas primera, cuarta y quinta de Ventas se enviaron mediante el formulario público sin sesión. Las restantes fueron fixtures propias por API pública para alcanzar estados específicos; no representan personas distintas.

| Estado | Ventas: automatizar / formar | Formación: automatizar / formar | Global | Desglose público / señales |
| --- | --- | --- | --- | --- |
| Primera de Ventas | 1 / 0 | 0 / 0 | 1 | Ninguno |
| Cuarta de Ventas | 3 / 1 | 0 / 0 | 4 | Ninguno |
| Ambos grupos con cuatro | 3 / 1 | 0 / 4 | 8 | Ninguno |
| Quinta de Ventas, por UI | 3 / 2 | 0 / 4 | 9 | Sólo Ventas; dos señales |
| Quinta de Formación | 3 / 2 | 0 / 5 | 10 | Ambos grupos; tres señales no nulas |
| Sexta de Ventas, tras reabrir | 3 / 3 | 0 / 5 | 11 | API correcta; gestor obsoleto |
| Eliminación confirmada | — | — | — | Cero encuestas y cero señales en SQLite |

Cada señal conservó grupo, tema, muestra, origen `community`, indicador agregado y vínculo a la encuesta. No se expusieron resultados de Formación con cuatro respuestas, aunque la suma global ya superaba cinco. Las notas no atribuyeron representatividad, identidad única ni causalidad.

Pausar y reabrir se probaron por UI; el enlace pausado recargado mantuvo resultados y retiró el formulario. El POST devolvió 409 sin incrementar. Cancelar la eliminación preservó la encuesta; confirmar borró encuesta y señales. Después de recargar, la UI quedó vacía y el enlace devolvió 404. “Reintentar” mostró el mismo error legible.

## Privacidad y límites

SQLite contenía tablas de autenticación/empresa/records, sin tabla de participantes. El registro de encuesta guardaba únicamente metadatos y celdas `segmentId, optionId, count`. Las respuestas inválidas con un correo sintético fueron rechazadas y no aparecieron en records. Esto verifica el sensor de la base propia, no toda infraestructura o posibles logs externos.

La repetición desde el mismo navegador tras recarga fue aceptada y contada como otra respuesta. La UI explica que no hay verificación de identidad, garantía de personas únicas ni muestra representativa.

No se probaron todos los roles, concurrencia, límites de volumen ni edición/eliminación de grupos en el perfil. La cuenta/empresa son fixtures sintéticas; no se usaron personas reales, demo ni proveedores externos. La encuesta se eliminó intencionalmente como parte de la prueba; se conserva el directorio temporal para reproducción.

## Artefactos

- [Informe JSON](community.json)
- [Observaciones API/UI/SQLite sanitizadas](../evidence/community-observations.json)
- [Validación inválida](../evidence/community-invalid.png)
- [Quinta respuesta pública](../evidence/community-threshold-five.png)
- [Pausa pública](../evidence/community-paused.png)
- [Enlace eliminado](../evidence/community-deleted.png)

Los identificadores públicos de enlace se redactaron en las observaciones. No se incluyen cookies, contraseñas ni tokens de sesión.

Al terminar se detuvo únicamente el PID propio 3837845 (sesión 43973, salida 0) y se cerró únicamente la pestaña propia tab_3r. Los datos temporales se conservaron.
