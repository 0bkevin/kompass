# Auditoría independiente: navegación

Resultado **FAIL**. 18 casos: **15 PASS, 3 FAIL, 0 BLOCKED**. Dos hallazgos P2 y uno P3. Alcance: Inicio, rutas primarias/secundarias, historial, cambio de marca, búsqueda, cambios sin guardar y móvil. No se modificó código de producto ni se leyeron informes ajenos.

## Entorno y reproducción

- Build existente, commit `549e0bbf5b5858eb79bf069d847daee269ad344e`; no se ejecutó build ni format.
- URL: http://127.0.0.30:4120. Runtime sesión 36052, PID 3911746, puerto exclusivo 4120. Runtime terminado y pestaña propia cerrada al finalizar.
- Base conservada: `/tmp/30x-adversarial-navigation/radar.sqlite`; reiniciar con `DATA_DIR=/tmp/30x-adversarial-navigation PORT=4120 DISCOVERY_ENABLED=false node server/start-host.mjs`, quitando OPENAI_API_KEY, GEMINI_API_KEY, YOUTUBE_API_KEY y APIFY_API_TOKEN del entorno. No usar .env.
- Cuenta ficticia: `qa-navigation@example.com`. Dos marcas sintéticas: Norte `cda87f8d-f1d9-4c02-8423-e9fc20f629c0` y Sur `d6159a43-e5d4-4595-91f4-5a033afe0fc6`. No se incluyen contraseña ni cookies.
- Viewports CSS 1440×900 y 390×844. Navegador nativo T3, pestaña propia `tab_45_07e54779-9ab2-4979-8a15-674c4eff160a`, host exclusivo 127.0.0.30.
- Fixtures vía API; únicamente la pieza published sin outcome se estableció por SQLite propia para probar el CTA de recuperación. No hubo publicación externa ni proveedores de pago.

## Hallazgos reproducidos

### navigation-1 · P2 · Recargar Audiencia pierde el perfil en edición sin advertencia

1. Abrir /audience en Sintética Norte.
2. Nueva audiencia; escribir Audiencia PERDER AL RECARGAR en Nombre del perfil sin guardar.
3. Recargar la misma URL.

Esperado: Advertencia para cancelar/descartar o restauración de la edición.

Observado: Recarga directa sin diálogo beforeunload; desaparece el modal y el texto. Escape sí protege el mismo formulario.

Control: la misma recarga con `preview_navigate` sobre importación /brand y Estudio con cambios sí generó diálogo **beforeunload**; cancelarlo conservó sus inputs. AudiencePage sólo protege `closeEditing`, sin registrar la guardia que consulta App para recarga. Es una pérdida de edición local, no una eliminación de datos guardados.

Evidencia: [navigation-audience-before.png](../evidence/navigation-audience-before.png), [navigation-audience-after.png](../evidence/navigation-audience-after.png).

Apoyo de código: `src/features/Brand.tsx:437`, `src/features/Brand.tsx:448`, `src/App.tsx:201`.

### navigation-2 · P3 · Fuentes y equipo descarta una fuente en edición con Escape sin confirmación

1. Abrir /settings → Añadir fuente.
2. Escribir Fuente sintética sin guardar en Nombre de la fuente.
3. Pulsar Escape y reabrir Añadir fuente.

Esperado: Pedir confirmación de descarte o conservar borrador.

Observado: Escape cierra sin diálogo; al reabrir el formulario está vacío.

Se clasifica P3 como inconsistencia/fricción del descarte explícito de un modal; no hubo pérdida de datos previamente guardados. Empresa, Estudio y Audiencia sí confirmaron descartes equivalentes en las rutas probadas.

Evidencia: [navigation-settings-before.png](../evidence/navigation-settings-before.png), [navigation-settings-after.png](../evidence/navigation-settings-after.png).

Apoyo de código: `src/features/Settings.tsx:1287`, `src/features/Settings.tsx:1473`.

### navigation-3 · P2 · La búsqueda de Referencias desaparece en móvil sin alternativa

1. Abrir /inbox en Norte a 1440×900; Buscar en esta sección filtra las referencias.
2. Cambiar viewport a 390×844.
3. Intentar buscar una referencia desde la pantalla o el menú.

Esperado: Control de búsqueda visible/alcanzable o alternativa móvil que permita filtrar.

Observado: El único .global-search queda display:none y no hay botón de búsqueda alternativo. No se puede buscar por texto en Referencias desde móvil.

Evidencia: [navigation-mobile-search.png](../evidence/navigation-mobile-search.png), [navigation-desktop-search.png](../evidence/navigation-desktop-search.png).

Apoyo de código: `src/App.tsx:571`, `src/workspace.css:363`, `src/workspace.css:374`.


## Casos y resultados

### 1. PASS · Guardia de audiencia al cerrar con Escape

Esperado: Cancelar conserva el modal y valor; aceptar descarta y cierra sin crear perfil.

Observado: Confirm nativo avisa de cambios; cancelar mantiene Perfil sin guardar, aceptar cierra. Ninguna audiencia creada.

Evidencia: UI /audience; confirm Hay cambios sin guardar. ¿Cerrar y descartarlos?.

### 2. PASS · Inicio sin contexto

Esperado: Sin descripción, industria ni pilares: Completar contexto abre /brand y conteos a cero.

Observado: 0 de 6 etapas, todos los conteos cero; el CTA abre /brand en Fuentes y contenido con importación visible.

Evidencia: UI /home → /brand.

### 3. PASS · Empresa: guardias de navegación y cambio de marca

Esperado: Cambiar nombre sin guardar y navegar/cambiar marca pide confirmación. Cancelar mantiene formulario y marca; aceptar abre Sur sin aplicar cambios a Norte.

Observado: Confirm nativo en ambos casos. Cancelar conserva /brand, Norte sin guardar y selector Norte. Aceptar abre empresa Sur; API confirma Sur y Norte conserva nombre.

Evidencia: UI /brand; confirm ADN de la marca.

### 4. PASS · Importación: salir y recargar con cambios

Esperado: URL escrita sin importar debe proteger salida y recarga; cancelar conserva; aceptar salida descarta.

Observado: Confirm al ir a Inicio y beforeunload al recargar. Cancelar ambos conserva https://navigation.example.com; aceptar salida abre /home.

Evidencia: UI /brand → /home; confirm y beforeunload nativos.

### 5. PASS · Inicio: contexto completo sin audiencia

Esperado: CTA Definir audiencia abre /audience, con cero perfiles.

Observado: CTA y destino correctos; 1 de 6 etapas y cero perfiles.

Evidencia: UI /home → /audience.

### 6. PASS · Inicio: audiencia sin referencias

Esperado: CTA Descubrir contenido abre /radar; 1 perfil y cero referencias.

Observado: CTA y destino correctos, 2 de 6 etapas con actividad y 1 perfil definido.

Evidencia: UI /home → /radar.

### 7. PASS · Inicio: referencias sin piezas y con borrador

Esperado: Con 2 referencias visibles y 1 descartada, cuenta 2; sin piezas ofrece Oportunidades. Con borrador abre ese id exacto en Estudio.

Observado: Inicio muestra 2 referencias y CTA Explorar oportunidades → /opportunities; tras fixture Guion ALFA Norte muestra Continuar borrador → /studio/ID correcto.

Evidencia: UI /home → /opportunities y /studio/ID; API fixtures 3 referencias (1 dismissed), 1 draft.

### 8. PASS · Estudio: salida, marca y recarga con edición local

Esperado: Título modificado sin guardar activa confirm en salir/cambiar marca y beforeunload. Cancelar conserva; aceptar salida descarta y API conserva título original.

Observado: Los tres bloqueos funcionan; cancelar conserva Guion Norte NO GUARDADO y marca Norte. Aceptar Todas las piezas vuelve a lista y API conserva Guion ALFA Norte.

Evidencia: UI /studio/dc9649ec-21d1-43ff-85ec-91d4983b91cb → /studio; API pieza.

### 9. PASS · Inicio: revisión y aprobación

Esperado: Única pieza en review: Abrir revisión abre el id exacto con Aprobar; aprobada: Planificar publicación lleva a calendario con esa pieza.

Observado: Ambos destinos correctos; Estudio muestra En revisión y Aprobar pieza. Calendario carga Guion ALFA Norte como contenido aprobado.

Evidencia: API fixtures review→approved; UI /home→/studio/ID y /calendar.

### 10. PASS · Inicio: programada sin resultados

Esperado: Única pieza scheduled, cero outcomes: CTA Abrir calendario y conteos 1 programada, 0 publicadas.

Observado: CTA abre /calendar, pieza del 24/10 visible. Inicio muestra 1 programadas · 0 publicadas, 5 de 6 etapas.

Evidencia: UI /home→/calendar; Fixture programación 2026-10-24T12:00:00Z.

### 11. PASS · Inicio: publicada sin registro y con resultado

Esperado: Publicada sin outcome: Registrar resultados abre /results con pieza elegible; tras 1 registro: contador 1 y CTA oportunidades.

Observado: Publicada sin outcome ofrece Registrar resultados y /results muestra pieza para registrar. Tras outcome manual 123/12/3, Inicio muestra 0 programadas · 1 publicadas, 1 registro manual y Explorar oportunidades.

Evidencia: Fixture SQLite explícita published sin outcome; UI /home→/results y recarga posterior; API outcome sintético.

### 12. FAIL · Audiencia: recarga con formulario modificado

Esperado: Nueva audiencia con nombre editado sin guardar: recargar debe pedir confirmación o restaurar borrador.

Observado: Navegación a la misma URL recarga sin beforeunload, cierra el modal y pierde Audiencia PERDER AL RECARGAR; no hay registro persistido.

Evidencia: docs/adversarial/evidence/navigation-audience-before.png; docs/adversarial/evidence/navigation-audience-after.png.

### 13. PASS · Señales: salida y cambio de marca sin guardar

Esperado: Tema editado sin guardar confirma salida y cambio; cancelar mantiene; aceptar cambia contexto y no mezcla el tema de Norte.

Observado: Confirm al navegar y cambiar marca; cancelar conserva Señal sin guardar Norte. Aceptar abre Sur con Equipos Sur y campo limpio.

Evidencia: UI /audience; confirm Hay cambios sin guardar; selección de marca.

### 14. FAIL · Settings: cerrar fuente modificada con Escape

Esperado: Nombre editado sin guardar pide descartar o conserva borrador.

Observado: Escape cierra instantáneamente sin confirmación; reabrir Añadir fuente muestra campo vacío.

Evidencia: docs/adversarial/evidence/navigation-settings-before.png; docs/adversarial/evidence/navigation-settings-after.png.

### 15. PASS · Búsqueda de referencias y contenido; restauración al limpiar

Esperado: En Norte hay 3 referencias totales (2 disponibles y 1 descartada), 1 pieza ALFA. ALFA filtra una; texto inexistente vacía; limpiar restaura. No debe aparecer GAMMA de Sur.

Observado: Referencias Todas: 3; ALFA: 1 Operación ALFA Norte; ZZZ: 0; limpiar restaura ALFA+BETA+Descartada. Contenido ZZZ: vacío; limpiar restaura única pieza Guion ALFA Norte. GAMMA Sur ausente.

Evidencia: UI /inbox y /studio; API fixtures.

### 16. PASS · Volver y avanzar en navegación primaria

Esperado: Contenido→Resultados, Atrás restaura Contenido con Norte y pieza propia; Adelante restaura Resultados 123/12/3.

Observado: history.back/forward respeta /studio y /results, Norte activa y datos correctos.

Evidencia: UI historial /studio ↔ /results.

### 17. PASS · Móvil 390: Inicio, CTA, menú y teclado

Esperado: Sin overflow a 390×844; CTA principal accesible y navega. Menú enfoca primer control, Shift+Tab/Tab ciclan dentro; Escape cierra y restaura foco.

Observado: Inicio doc/body width=390, ningún elemento fuera del ancho; CTA Explorar oportunidades visible (37,424,210×44) abre /opportunities. Menú enfoca Cerrar menú; Shift+Tab→Cerrar sesión; Tab→Cerrar menú; Escape cierra, aria-expanded=false y foco Abrir menú.

Evidencia: docs/adversarial/evidence/navigation-mobile-home.png; UI y medición DOM 390×844.

### 18. FAIL · Móvil: navegación secundaria y acceso a búsqueda

Esperado: Menú→Más herramientas→Referencias abre /inbox y cierra menú. La búsqueda de la sección debe seguir disponible a 390px.

Observado: Navegación secundaria correcta, menú cerrado y ancho 390 sin overflow; búsqueda totalmente oculta (display:none, width=0), sin control alternativo. A 1440 el mismo campo vuelve a verse (235px).

Evidencia: docs/adversarial/evidence/navigation-mobile-search.png; docs/adversarial/evidence/navigation-desktop-search.png.


## Datos contrastados

Inicio se contrastó secuencialmente con los siguientes estados, comprobando el destino mediante UI: sin contexto→Empresa; contexto sin audiencia→Audiencia; audiencia sin referencias→Explorar fuentes; referencias sin piezas→Oportunidades; borrador→id exacto en Estudio; revisión→mismo id con acción Aprobar; aprobada→Calendario con pieza elegible; programada sin outcomes→Calendario; publicada sin outcomes→Resultados; con outcome→Oportunidades.

Estado final de Norte: un perfil Equipos Norte, 3 referencias totales (ALFA new, BETA saved y una dismissed), 2 disponibles, una pieza Guion ALFA Norte publicada, un registro manual con **123 visualizaciones / 12 interacciones / 3 contactos**, 4 fuentes totales y 3 activas. Inicio mostró 6 de 6 etapas al cierre. Sur mantuvo su perfil Equipos Sur, una referencia GAMMA, ninguna pieza/outcome y 5 fuentes/4 activas. El cambio de marca no mostró registros de la otra marca en las rutas probadas.

El historial Atrás/Adelante recuperó /studio y /results con marca y cifras correctas. La búsqueda ALFA→ZZZ→vacío pasó en Referencias/Contenido a 1440px. A 390px, Inicio, Oportunidades y Referencias conservaron ancho de documento 390; el CTA de Inicio navegó correctamente. Menú: foco inicial Cerrar menú; Shift+Tab→Cerrar sesión; Tab→Cerrar menú; Escape→cierre y foco Abrir menú; elegir Referencias cerró el menú.

## Límites

- Pruebas con datos sintéticos en base temporal propia; no prueban resultados reales ni proveedores.
- Rol revisor, fallos de red inducidos y recuperación de errores no cubiertos en esta sesión.
- Búsqueda comprobada con datos en Referencias y Contenido; no se verificó filtrado con corpus propio en Explorar fuentes o Archivos.
- Móvil comprobado en Inicio, Oportunidades, Referencias y navegación; no se afirma ausencia de overflow en todas las pantallas ni dispositivos.
- Guardias: Empresa navegación y cambio de marca; importación navegación y recarga; Estudio navegación/cambio de marca/recarga; señales navegación/cambio de marca; audiencia Escape/recarga; Settings Escape. No se agotó cada combinación.
- El estado published sin outcome se preparó explícitamente por SQLite para comprobar el enlace de recuperación de Inicio; los demás estados y registros se prepararon por API. No se publicó nada externamente.
- Las acciones que abren diálogos nativos a veces devolvieron timeout del controlador; se inspeccionó preview_status y se resolvió el diálogo con preview_dialog antes de verificar estado. El control importación/Studio sí detectó beforeunload con la misma recarga usada en audiencia.
- El resumen de cobertura muestra 3 referencias totales frente a 2 disponibles en la etapa de Inicio; la tercera está descartada. Se registró como diferencia de alcance de los conteos, sin clasificar como defecto por sí sola.

Captura de funcionamiento móvil: [navigation-mobile-home.png](../evidence/navigation-mobile-home.png). Los datos temporales se conservan para reproducción.

