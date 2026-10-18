# Resultados y aprendizaje — revisión adversarial independiente

**Estado: FAIL. 17 casos: 15 PASS, 2 FAIL, 0 BLOCKED. Hallazgos: 1 P2 y 1 P3; ninguno P1.**

Se probó el build existente en `http://127.0.0.25:4115`, con cuenta ficticia `qa-results@example.com`, SQLite exclusiva en `/tmp/30x-adversarial-results` y descubrimiento desactivado. Se leyeron PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md como requisitos. No se modificó código de producto ni se recompiló. La única pestaña operada fue `tab_41_07e54779-9ab2-4979-8a15-674c4eff160a`; todas las llamadas llevaron su tabId.

Las referencias, piezas, audiencias y cifras fueron **sintéticas**. Se crearon la cuenta y empresa por API; se prepararon estados aprobada/programada/publicada y las muestras comparables en SQLite propia. Las acciones de seleccionar, registrar, corregir y validar formularios se ejecutaron mediante herramientas nativas T3 en la UI. Se consultaron API y SQLite después para comprobar el estado. No se envió contenido a una red ni se usaron claves reales.

## Hallazgos confirmados

### results-1 · P2 · Las notas de resultados permiten guardar fichas identificables de contactos

1. Entrar como editor/propietario y seleccionar una pieza aprobada o publicada en /results.
2. En «Periodo de medición y aprendizajes», escribir una ficha sintética con nombre, correo, teléfono e interés individual.
3. Guardar, recargar y revisar el registro y GET insights.

**Esperado:** Rechazar o anonimizar la ficha individual, manteniendo resultados y aprendizajes agregados conforme al límite del producto.

**Observado:** Se guardó sin aviso ni anonimización: «SINTÉTICO. Contacto individual: Persona QA, persona-qa@example.com, teléfono +52 55 1234 5678; pidió formación.». El texto se persistió en outcomes.notes y volvió a mostrarse tras recargar. Es un control ausente en las notas; no se demostró exposición entre cuentas ni se usaron personas reales.

**Evidencia:** [results-personal-notes.png](../evidence/results-personal-notes.png), [results-observations.json](../evidence/results-observations.json). **Causa localizada:** `PRODUCT.md:31`, `docs/TRANSCRIPT-TO-PRODUCT.md:24`, `server/audience-insights.mjs:905`, `src/features/Journey.tsx:2623`.

### results-2 · P3 · API y UI discrepan sobre fracciones y bloquean una corrección de notas

1. POST outcome de una pieza publicada con métricas 300.5/30.25/3.5; comprobar 200.
2. Recargar /results y seleccionar esa pieza.
3. Cambiar sólo la nota y pulsar «Actualizar registro».

**Esperado:** El formulario debe aceptar los valores admitidos por API o la API debe aplicar la misma regla de enteros; corregir una nota no debe obligar a cambiar cifras válidas previamente guardadas.

**Observado:** Los campos de las tres métricas quedaron con validity.valid=false por step=1; el navegador bloqueó el submit y la nota anterior siguió persistida. El contrato API documentado exige finitos en rango y no exige enteros; el hallazgo es la incompatibilidad de edición, no que aceptar fracciones por sí solo viole ese contrato.

**Evidencia:** [results-fraction-correction.png](../evidence/results-fraction-correction.png), [results-observations.json](../evidence/results-observations.json). **Causa localizada:** `server/audience-insights.mjs:640`, `src/features/Journey.tsx:2596`, `src/features/Journey.tsx:2607`, `src/features/Journey.tsx:2618`.

## Exactitud y aprendizaje

El primer registro de A guardó exactamente 1234 visualizaciones, 87 interacciones y 9 contactos. La corrección cambió esos valores a 1500/100/10 y actualizó URL/nota conservando el mismo outcome `8c3093d1-267d-486b-90c3-915c38a3cf1f` y su fecha de creación. Recargar y volver a seleccionar A precargó los valores corregidos. La base final conserva 19 outcomes sin pieceId duplicado.

Estas son las sumas esperadas antes de compararlas con la tabla de la UI y el cálculo independiente desde SQLite. Todas coincidieron; los canales aparecen en filas separadas.

| Audiencia | Canal | Piezas | Visualizaciones | Interacciones | Contactos |
| --- | --- | ---: | ---: | ---: | ---: |
| Ventas QA | LinkedIn | 9 | 14200 | 3330 | 125 |
| Formación QA | Instagram | 7 | 6000 | 900 | 6 |
| Ventas QA | Instagram | 2 | 500 | 210 | 5 |
| Formación QA | LinkedIn | 1 | 100 | 90 | 1 |

La muestra principal de Ventas/LinkedIn/Post usa T1=(1000,200,20), T2=(2000,600,30), T3=(3000,1200,40) y B1=(1000,100,5), B2=(2000,200,6), B3=(3000,300,7), con fecha de publicación 10 de octubre y registro 18 de octubre. Medianas de interacciones/vistas: **30% frente a 10%**. Con sólo T1,T2 y B1–B3 se esperaba ningún ajuste; se observó prioridad 34 y mensaje de muestra insuficiente. Cuatro señuelos de otro segmento, canal, formato o ventana no completaron la muestra. Al incorporar T3 se esperaba +8; UI y API mostraron prioridad **34→42**, 3+3 y ventana 7–14 días. La explicación dice que son métricas manuales y no atribuye causalidad ni compara redes.

Una segunda muestra de Formación/Instagram/Reel contiene tres tasas del tema 20%,30%,40% y tres tasas base 0%. Se esperaba ajuste 0 por referencia cero; se observó exactamente 0, medianas 30.0%/0.0%, prioridad 32 y explicación explícita. Los datos sin resultados muestran un estado vacío. No se observó una afirmación de ROI o rendimiento real derivada de las fixtures.

[Captura de sumas](../evidence/results-exact-totals.png) · [Captura de explicación del ajuste](../evidence/results-learning.png) · [Respuestas y valores verificables](../evidence/results-observations.json)

## Casos

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| Sin métricas | Mostrar ausencia de resultados; no fabricar métricas ni conclusiones. | UI indicó que aún no hay métricas; insights.learning.outcomes=[] antes de registrar la primera pieza. | PASS |
| Selección de pieza exacta | Listar approved/scheduled/published, excluir draft y conservar audiencia/canal/formato de la pieza elegida. | Selector listó A aprobada, B programada y C publicada; excluyó D borrador. A mostró LinkedIn/Post/Ventas QA; B Instagram/Reel/Formación QA; C Instagram/Reel/Ventas QA. | PASS |
| Registro manual desde aprobada | Guardar URL, fecha, métricas y nota; cambiar sólo esa pieza a published sin envío a una red. | A guardó URL example.com/publicaciones/qa-results-a, 2026-10-17T12:00Z y 1234/87/9; API/SQLite: status published, metricsOrigin manual, publicationOrigin manual_record. Sólo POST outcome y lecturas locales en la acción. | PASS |
| Pieza programada y cero | Registrar publicación manual de una pieza scheduled y conservar cero como dato válido. | B pasó a published con 0/0/0; UI mostró Formación QA/Instagram con una pieza y cero en los tres contadores. | PASS |
| Pieza publicada | Permitir incorporar resultados a una pieza ya published. | C guardó 300/30/3 con fecha 2026-10-10T12:00Z; apareció en tabla y registros sin crear otra pieza. | PASS |
| Corregir y recargar sin duplicación | Actualizar el mismo outcome, conservar la nueva URL/nota/cifras al recargar y precargar el formulario. | A conservó outcome 8c3093d1-267d-486b-90c3-915c38a3cf1f y createdAt; cambió URL a qa-results-a-corregida y cifras a 1500/100/10. Recarga/formulario/SQLite coincidieron. No pieceId duplicados en 19 outcomes finales. | PASS |
| Validación UI | Impedir envío de negativos, fracciones, exceso de límite y fecha futura. | -1 inválido por min; 1.5 por step; 1000000000001 por max; 2027-01-01 por fecha máxima. Ninguno sustituyó el registro previo. | PASS |
| Validación API de números y fechas | Responder 400 a negativos, NaN/cadena/null, infinito, >10^12 y fechas futuras/inválidas; aceptar 10^12 inclusivo. | Casos inválidos devolvieron 400; 1e400 también 400. Tres métricas exactamente 10^12 devolvieron 200. Fixture restaurada después. | PASS |
| Enlaces privados y personales | Rechazar IP privada/loopback, credenciales y parámetros de correo. | UI rechazó http://127.0.0.1/privado y ?email=persona-qa@example.com con error; API rechazó además 192.168.1.1 y user:password@example.com con 400. | PASS |
| Sin aprobación | Borrador ausente del selector y POST outcome rechazado sin convertirlo en publicado. | D no apareció en UI; POST devolvió 409 «La pieza necesita estar aprobada...» y siguió draft. | PASS |
| Rol revisor | Consultar resultados sin formulario de escritura; POST outcome 403. | UI mostró aviso de acceso de revisor y ningún formulario; POST 403 «Necesitas permisos de edición.». Rol preparado y restaurado sólo en la base propia. | PASS |
| Sumas exactas por audiencia y canal | 19 outcomes sintéticos repartidos sin mezclar canales: ventas/linkedin 9,14200,3330,125; formación/instagram 7,6000,900,6; ventas/instagram 2,500,210,5; formación/linkedin 1,100,90,1. | Tabla UI coincidió exactamente con los cuatro grupos y con sumas independientes desde SQLite; ninguna pieza se contó dos veces. | PASS |
| Muestra insuficiente y exclusión de contextos | Dos piezas del tema y tres de base no ajustan prioridad; piezas de otro segmento/canal/formato/ventana no completan la muestra. | Automatización ventas quedó en 34 con mensaje «hacen falta al menos 3... y 3...» aun con cuatro señuelos con otro contexto. | PASS |
| Comparación comparable 3+3 | Medianas 30% frente a 10% y ajuste descriptivo acotado +8 para mismo segmento/canal/formato/ventana. | Tras añadir T3, prioridad pasó 34→42; UI y API mostraron 3+3, LinkedIn/post, 7–14 días, 30.0% vs 10.0%, +8 y límite sin atribución causal. | PASS |
| Base cero y afirmaciones | No dividir por cero ni calcular mejora/ROI/causalidad; explicar límite. | Formación/Instagram/Reel 3+3 mostró 30.0% frente a 0.0%, delta 0, «La referencia es cero»; se mantuvo prioridad 32. No afirmó rendimiento real, ROI ni causalidad. | PASS |
| Datos individuales en notas | Mantener el corpus dentro del límite de datos agregados; rechazar o anonimizar una ficha de contacto identificable. | UI guardó nombre ficticio, email y teléfono juntos con interés de formación. API devolvió 200; persistieron y se mostraron tras recarga. | FAIL |
| Corrección UI de valores aceptados por API | Un registro válido para API debe poder corregirse en la UI sin sustituir sus cifras para superar validación. | API aceptó 300.5/30.25/3.5 (200). Al recargar, los tres campos step=1 resultaron inválidos; cambiar sólo la nota y guardar no produjo actualización. Se restauró 300/30/3 al acabar. | FAIL |

## Límites y reproducción

- Todas las métricas, referencias, nombres y contactos son fixtures sintéticas. No demuestran rendimiento real, ahorro, ROI ni representatividad.
- Se auditó el build existente sin recompilar ni modificar código de producto. Piezas, referencias y muestras comparables se prepararon en SQLite propia; registrar y corregir se probó mediante UI nativa T3.
- No se realizó publicación externa ni se usaron claves/proveedores reales. Se verificó el registro manual y su procedencia; no es una prueba de integración de publicación social.
- La aprobación se preparó como fixture de estado; esta revisión no audita todo el flujo de revisión versionada ni todos los roles o escenarios de concurrencia.
- La validación de URL se probó con IPs y parámetros explícitos; no cubre todos los nombres DNS ni todas las formas posibles de datos personales.

El ensayo PII guardó exclusivamente una persona y medios de contacto ficticios; no prueba acceso entre cuentas. Las fracciones se restauraron a 300/30/3 al terminar para conservar las sumas conocidas. El rol temporal de revisor se restauró a propietario. La base y los scripts de fixtures permanecen en `/tmp/30x-adversarial-results`, `/tmp/results-fixtures.mjs` y `/tmp/results-learning-fixtures.mjs`. Para el umbral insuficiente se omite T3; el script de aprendizaje con `--complete` incorpora T3.

Runtime propio: sesión 18456, PID 3895781. Se cerró la pestaña propia, se terminó sólo ese PID con TERM y se verificó el puerto 4115 sin listener. Los datos temporales se conservaron. No se leyeron informes de otros revisores.

Entrega estructurada: [results.json](results.json). Evidencia: ocho capturas `docs/adversarial/evidence/results-*.png` y [results-observations.json](../evidence/results-observations.json).

