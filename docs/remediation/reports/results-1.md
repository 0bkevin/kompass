# results-1 — Notas de resultados con datos personales

Estado: **fixed**, pendiente del recorrido integrado del coordinador. Responsable: `fix_results_1`.

La API rechaza notas con emails, teléfonos y fichas individuales antes de guardar resultados. Las lecturas antiguas omiten únicamente la nota personal y mantienen sus métricas. Corregir sólo métricas tampoco arrastra ni vuelve a exponer esa nota antigua.

## Causa y cambio

`outcomeInput` validaba el tipo y el máximo de 5000 caracteres, pero faltaba el control de datos agregados. `learningFor` devolvía la nota original y el fallback de corrección reutilizaba `existing.notes`. Se aplica `assertAggregateAudienceText` en la entrada y una proyección de nota agregada en las dos rutas antiguas. El helper compartido, `publicLink` y `admissibleSignal` permanecen intactos.

La proyección no modifica las filas ni filtra resultados completos: conserva IDs, fechas, métricas, totales y ventana de medición, por lo que el aprendizaje comparable permanece igual. Si se corrige una fila antigua sin enviar `notes`, se guarda esa misma fila con las nuevas métricas y sin su nota personal; una nota agregada válida se conserva y una cadena vacía permite borrarla explícitamente.

Journey añade una indicación breve enlazada con `aria-describedby`. El error existente tiene `role=alert` y conserva los campos para corregir. No se han cambiado las métricas ni sus `step`, que corresponden a results-2.

## Rojo y verde

Se ejecutó primero `node --test tests/remediation-results-1.test.mjs` contra el código sin corregir. La prueba literal observó **200, nota persistida y expuesta por insights**. La suite específica quedó en 2 PASS / 4 FAIL. [Salida roja](../evidence/results-1/test-before.txt).

El recorrido T3 reprodujo la cadena literal del informe con una pieza aprobada sintética: «SINTÉTICO. Contacto individual: Persona QA, persona-qa@example.com, teléfono +52 55 1234 5678; pidió formación.». Se guardó, se recargó y se mostró con 1500 visualizaciones, 100 interacciones y 10 contactos. [Captura roja](../evidence/results-1/before-reload.png).

Tras el cambio, la misma nota enviada desde el formulario devuelve **400**. El error explica qué eliminar sin reflejar el contenido, y el formulario mantiene 1500/100/10 y la nota escrita. Al recargar la fila antigua, `insights` omite `notes` y conserva todas sus métricas; se comprobó por SQLite que la fila y su texto anterior seguían existiendo antes de corregirla. [Nota antigua omitida](../evidence/results-1/legacy-note-omitted.png), [rechazo escritorio](../evidence/results-1/rejected-desktop.png), [rechazo móvil](../evidence/results-1/rejected-mobile.png).

Corregir la nota por un aprendizaje agregado y recargar mantiene **1 outcome**, el mismo ID, `createdAt`, `publishedAt`, `pieceId` y 1500/100/10. Se comprobó escritorio 1280×800 y móvil emulado 390×844 sin desbordamiento horizontal. [Resultado corregido](../evidence/results-1/corrected-desktop.png), [móvil](../evidence/results-1/corrected-mobile.png), [observaciones](../evidence/results-1/browser-checks.json).

La suite propia pasa **6/6**. El conjunto cercano pasa **54/54**:

```bash
node --test tests/remediation-results-1.test.mjs tests/audience-insights.test.mjs tests/remediation-signals-1.test.mjs tests/remediation-signals-2.test.mjs
```

[Salida verde](../evidence/results-1/test-after.txt). Cubre el literal, email/teléfono aislado, fichas etiquetadas/CSV, rechazo atómico, máximo 5000, corrección por `pieceId`, omisión antigua sin mutación, corrección sólo métricas, aprendizaje comparable 3+3, roles/marcas y las protecciones existentes de URL/publicación.

## Alcance y límites

Todo es sintético: cuenta, empresa, pieza, contacto y métricas. No hubo claves reales, publicación externa, gasto ni llamadas a proveedores. Se usaron exclusivamente desarrollo propio en `127.0.1.24:5514`/API 4514, SQLite `/tmp/30x-remediation-results-1` y la pestaña propia `tab_4h_07e54779-9ab2-4979-8a15-674c4eff160a`. Pestaña cerrada, proceso detenido y puertos 4514/5514 liberados.

El helper compartido detecta contactos explícitos y estructuras de ficha; no asegura reconocer todos los nombres sueltos ni toda paráfrasis. No se borraron registros masivamente: las notas antiguas se omiten en las lecturas de insights y sólo se retiran de una fila cuando se corrige. No se ejecutó build ni format global. La comprobación móvil usa viewport emulado, no dispositivo físico. La compilación y revisión integrada corresponden al coordinador; results-2 queda fuera del cambio.
