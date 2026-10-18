# results-2 — Corrección de notas con métricas decimales

Responsable: `/root/fix_results_2`. Estado: corregido, pendiente de integración del coordinador.

El servidor admite métricas finitas entre 0 y 10¹², incluidas fracciones. Los tres campos de `OutcomeForm` imponían `step=1`. Por eso un registro admitido por API no se podía corregir desde la interfaz: la validación nativa impedía enviar incluso un cambio exclusivo de notas.

Se sustituyó únicamente ese atributo por `step="any"` en Visualizaciones, Interacciones y Contactos generados de [Journey.tsx](../../../src/features/Journey.tsx). Permanecen los límites, los campos obligatorios, el registro manual, la validación de notas agregadas y las guardias. El servidor no cambia y las métricas no se redondean.

## Reproducción y comprobación

1. En una empresa aislada y ficticia se preparó una pieza aprobada. Un POST real guardó 300.5 / 30.25 / 3.5 con respuesta 200 y outcome `4d169652-3987-482d-99f6-7f9a8b4c06fe`.
2. Antes del cambio, seleccionar la pieza mostraba los tres campos con `stepMismatch=true` y formulario inválido. Cambiar sólo la nota y pulsar Actualizar registro no produjo ningún POST; la nota original continuó persistida. Véase [captura roja](../evidence/results-2/red-decimals-block-submit.png).
3. Con la corrección, el mismo formulario fue válido y produjo un único POST 200. El mismo outcome y `createdAt` conservaron exactamente las tres cifras, la nueva nota y un solo registro. Se recargó y volvió a seleccionar la pieza para comprobar el estado persistido. Véase [captura de escritorio](../evidence/results-2/green-note-corrected-desktop.png).
4. En 390 × 844 se modificó únicamente la nota, se llegó al botón con Tab y se guardó con Enter. Después de otra recarga persistieron el mismo ID, las métricas exactas y la nota móvil. Los campos tienen 16 px, el foco del botón es visible y no hay desbordamiento horizontal del documento: ancho de documento y viewport 390 px. Véanse [foco móvil](../evidence/results-2/mobile-keyboard-submit-focus.png) y [recarga móvil](../evidence/results-2/mobile-reload-preserves-decimals.png).
5. La API rechazó con 400 quince variantes inválidas: negativos, valores superiores al máximo, cadenas, null y representaciones no finitas. Ninguna alteró el registro. Los límites inclusivos 0 y 10¹² dieron 200, mismo ID. Se restauraron las cifras decimales. En los campos reales también se comprobaron 0, 0.125, 300.5 y 10¹² válidos; negativos, exceso, vacío y entradas no finitas inválidos.

[Observaciones estructuradas](../evidence/results-2/observations.json).

## Comprobación cercana

`node --test tests/remediation-results-1.test.mjs tests/audience-insights.test.mjs`: **19/19**, cero fallos, cancelados u omitidos; exit 0. [Log completo](../evidence/results-2/nearby-tests.log). No se modificaron tests existentes ni se añadió una prueba que sólo repita el atributo; la comprobación regresiva atraviesa el formulario y submit reales en T3.

## Alcance y límites

Toda la información es sintética. La aprobación inicial es una fixture; no se acredita aquí todo el recorrido de revisión. No se publicó ni envió nada externamente. La prueba móvil usa el viewport de Chromium, no un dispositivo físico. La compilación y suite integradas corresponden al coordinador. El informe adversarial original permanece intacto.
