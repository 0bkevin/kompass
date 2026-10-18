# Contenido: simplificación del recorrido editorial

Revisión del 18 de octubre de 2026. Prueba interactiva de agente en el navegador nativo de T3, con un espacio de ejemplo aislado en `127.0.0.92:5512`. No es una prueba de usabilidad con personas reclutadas. No se enviaron publicaciones a servicios externos ni se usaron proveedores de IA.

## Fricciones observadas

- Crear un post mostraba ocho controles desde el inicio; carruseles y videos añadían un noveno. El botón de creación aparecía después de aproximadamente 1.000 px de formulario en escritorio y 1.200 px en móvil.
- En una pieza aprobada del espacio de ejemplo, el bloque con el siguiente paso comenzaba en `y=813` dentro de una ventana de escritorio de `1280×800`. Había que pasar la vista previa para encontrarlo.
- La pieza aprobada resaltaba un botón «Enviar ahora» deshabilitado cuando no había un conector disponible, aunque exportar y organizar el calendario sí funcionaban.

## Cambios

| Momento    | Recorrido visible                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear      | Tema, notas, formato, canal y audiencia. «Crear borrador» es la acción principal.                                                                                                             |
| Ajustar    | Una sección opcional conserva referencia de origen, llamado a la acción exacto, cantidad de láminas o escenas y ejemplo hipotético. Los valores siguen formando parte de la misma solicitud.  |
| Editar     | Los cambios sin guardar siguen visibles y conservan sus protecciones de salida y conflicto.                                                                                                   |
| Revisar    | El siguiente paso aparece antes del editor largo: enviar a revisión y, según el rol, aprobar o solicitar cambios.                                                                             |
| Planificar | Una pieza aprobada destaca «Elegir fecha en el calendario». Los cambios pendientes bloquean la planificación y explican que guardar exige una aprobación nueva.                               |
| Publicar   | «Exportar» permite llevar el texto al canal. El envío por conector sigue disponible dentro de una sección opcional, con su confirmación y recibo. No se ofrece un botón de envío sin destino. |
| Aprender   | Una pieza con registro de envío o publicación ofrece «Registrar resultados». La aceptación de un conector no se presenta como publicación final confirmada.                                   |

El diseño conserva los colores verdes, las fuentes y los controles existentes. Ninguna fuente, advertencia de procedencia, campo editorial o protección de aprobación se eliminó.

## Verificación

- TypeScript: `npx tsc -b --pretty false`, correcto.
- Diez pruebas existentes de contratos de borrador, conservación de cambios, conflictos y recuperación, correctas.
- Detector de Impeccable: una advertencia orientativa por un subtítulo de `16px`, tamaño ya contemplado en `DESIGN.md`; sin hallazgos mecánicos bloqueantes.
- Confirmación interactiva de la compilación integrada en escritorio `1280×800` y móvil `390×844`: cinco campos iniciales, sección opcional cerrada y sin desbordamiento horizontal. En escritorio, el botón de creación termina en `y=740`; el siguiente paso del editor comienza en `y=292`. En móvil, el siguiente paso comienza en `y=430`, antes del editor.
- Se eligieron una referencia de ejemplo, cuatro láminas, un ejemplo hipotético y un llamado a la acción exacto; después se cerró la sección opcional. La solicitud real conservó todos esos valores y recibió HTTP 200. La pieza resultante tiene título, cuatro escenas, audiencia correcta, el CTA exacto y motor local. [Solicitud y resultado](editorial-evidence/request-and-result.json).
- Se completó por la interfaz: borrador → revisión → aprobación → edición con aviso de cambios pendientes y planificación bloqueada → guardar y retirar aprobación → revisión → nueva aprobación → fecha guardada. La pieza terminó en `scheduled`, con fecha `2026-10-19T12:22:00.000Z` y sin recibo de publicación.
- El conector opcional sin destino muestra cómo exportar y ningún botón «Enviar ahora». Exportar descargó un Markdown de 1.359 bytes con las cuatro láminas y el CTA exacto. La referencia del espacio de ejemplo no tiene URL; el exportador existente usa su texto de reserva «Fuente: Idea propia». Esta prueba no acredita un enlace de origen; los casos con fuentes públicas reales se documentaron en la revisión anterior de 30X.
- La primera confirmación detectó que en móvil faltaban aproximadamente 44 px para mostrar el botón completo dentro del modal. Se dejó formato y canal en la misma fila entre 360 y 600 px para recuperar ese espacio. Confirmación final de la compilación: botón completamente visible entre `y=738` y `y=781`, dentro de un modal que termina en `y=801`, en la ventana de `390×844`. Ambas columnas miden `157px`; los controles conservan tipografía de `16px`. Ancho del documento `390px`, sin desbordamiento horizontal.

Capturas: [formulario en escritorio](editorial-evidence/create-desktop.png), [formulario en móvil](editorial-evidence/create-mobile.png), [siguiente paso del borrador](editorial-evidence/draft-next-step-desktop.png) y [aprobación y conector opcional en móvil](editorial-evidence/approved-mobile.png).

El servidor temporal y la pestaña de pruebas se cerraron al terminar. El espacio de trabajo real del usuario se conservó.
