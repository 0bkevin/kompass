# navigation-3 · Búsqueda de Referencias en móvil

Estado: **fixed**, pendiente de integración del coordinador. Responsable: `/root/fix_navigation_3`.

El problema estaba en dos reglas CSS: `styles.css` ocultaba `.global-search` bajo 1050 px y `workspace.css` repetía el ocultamiento bajo 900 px. A 390 px, el input existía pero su label tenía `display:none`; había tres referencias y ninguna alternativa de búsqueda. [Captura anterior](../evidence/navigation-3/before-mobile-hidden-search.png).

La misma búsqueda se mantiene visible y pasa a la segunda fila del encabezado a 900 px. Conserva el menú y el botón de captura, usa 16 px en móvil y admite nombres de empresa largos. El botón **Borrar búsqueda** devuelve el foco al input; Escape limpia el texto. Referencias distingue ahora cero coincidencias de no tener referencias, con una indicación para recuperar resultados. Este hunk de InboxPage se coordinó con el agente de references-3; su detalle no se modifica. No se añade búsqueda global a Oportunidades.

## Evidencia del resultado

- **24/24 comprobaciones de navegador**. En 390, 768, 901, 1024 y 1440 px se escribe ALFA, se verifica el único ID esperado, se busca un término sin resultados y se borran los filtros para recuperar exactamente los tres IDs originales. También se prueban teclado, foco, menú, modal de captura, cambio de empresa y navegación. [Registro](../evidence/navigation-3/browser-checks.json).
- **320 px:** documento de 320 px, input de 16 px y búsqueda, borrado, menú y captura dentro del viewport. [Captura](../evidence/navigation-3/after-320-boundaries.png).
- **Contraste calculado desde estilos computados:** texto 11.70:1, placeholder 4.58:1, iconos 5.87:1 y foco 3.97:1 contra la superficie del campo.
- **13/13 tests cercanos**, cero fallos, cancelaciones u omitidos. `node --test tests/legacy-navigation.test.mjs tests/workflow-recovery.test.mjs tests/remediation-navigation-2.test.mjs`. [Log](../evidence/navigation-3/nearby-tests.log).
- `npx tsc --noEmit`: exit 0, sin diagnósticos. [Log](../evidence/navigation-3/types.log).

La referencia ALFA esperada es `49a4af6a-1261-4f85-9bbe-e159a4501e87`; los otros dos IDs son `703ecbd3-c2fa-4fa3-9270-a193dabb8460` y `edd1ece4-0765-40ed-8011-688080c8014d`. Los datos son ficticios y se crearon en una base aislada.

[Resultado móvil](../evidence/navigation-3/after-mobile-alfa.png) · [Tablet](../evidence/navigation-3/after-tablet-beta.png) · [Desktop](../evidence/navigation-3/after-desktop-alfa.png) · [Cero coincidencias](../evidence/navigation-3/after-mobile-no-matches.png).

## Alcance y límites

Sólo se modifican App.tsx, los hunks del buscador/encabezado en workspace.css, EmptyState de InboxPage y la línea pertinente de DESIGN.md. No se añade un test que repita una constante CSS: el síntoma se verifica en su seam real, el navegador.

Se usó T3/Chromium con viewports CSS; no dispositivo físico o Safari. El filtrado sigue siendo local a las referencias cargadas de la empresa. No se usan proveedores, claves reales ni envíos externos.

La pestaña y el runtime propios se cerraron; puertos 4521/5521 libres. Node 24 --watch emitió una aserción FSEventWrap al recibir SIGTERM durante el cierre, un fallo de teardown también visto en otros runtimes de revisión. La búsqueda funcionó durante todas las comprobaciones y no quedaron procesos escuchando.
