# Uso de producción visual y datos oficiales

Revisión interactiva del 18 de octubre de 2026 sobre `http://localhost:3026`, en una pestaña propia del navegador de T3. Se conservaron la identidad verde, los controles compartidos y las protecciones editoriales existentes. Esta revisión no es un estudio con participantes externos.

## Recorrido disponible

1. Abre una pieza y elige **Crear imagen o video**. El acceso lleva a Recursos y mueve allí el foco del teclado.
2. Ajusta la dirección visual y el formato. La creación queda registrada; sus archivos se pueden revisar, descargar y añadir explícitamente a la pieza. Guardar conserva las protecciones de aprobación. Si el video reutiliza una imagen asociada, la interfaz lo explica y oculta las instrucciones que no se aplicarían.
3. En **Explorar fuentes**, busca videos recientes de YouTube. La interfaz muestra la consulta, las cifras públicas, su fecha y la atribución. No presenta estas cifras acumuladas como crecimiento ni las envía al análisis editorial con IA.
4. En **Resultados**, vincula una pieza de YouTube aprobada con su URL pública. Solo pide la pieza y el enlace; después se consultan los contadores. No exige introducir ceros ni resultados de negocio.

El video disponible es un montaje animado de una ilustración con subtítulos del guion, sin audio. No se presenta como generación de escenas filmadas ni como una integración de Sora.

## Comprobaciones interactivas

| Superficie       | Resultado observado                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuentes y equipo | Se verificaron tanto la consulta pública de YouTube como la conexión real del canal de la cuenta autorizada, con acceso de lectura. Esto no verifica propiedad sobre 30X. Instagram, LinkedIn y TikTok aparecen con su disponibilidad real. No se solicita una clave de proveedor al usuario. |
| Estudio          | Acceso directo a Recursos, foco correcto, PNG cargado y MP4 reproducible. La generación queda deshabilitada mientras hay cambios locales sin guardar; restaurarlos elimina ese estado sin enviar un guardado.                                                                                 |
| Descubrimiento   | La búsqueda `30X AI for Executives` devolvió cero videos. `Andrés Bilbao 30X` devolvió siete videos con contadores de la API oficial. No se rellenó el resultado vacío con ejemplos.                                                                                                          |
| Resultados       | Una pieza aprobada de YouTube habilitó exactamente dos campos: pieza y URL pública. El foco pasó al selector. Una pieza en borrador mostró el requisito de aprobación. No se modificó la pieza anterior de Instagram.                                                                         |
| Vista adaptable  | Comprobación en 1280 × 800 y 390 × 844 píxeles CSS. Las cuatro superficies nuevas permanecieron dentro del ancho del documento.                                                                                                                                                               |

Se corrigieron durante la revisión la explicación del rango de siete días, la recuperación de búsquedas vacías, las instrucciones ignoradas al reutilizar imágenes, la proporción al cambiar a video, la jerarquía de acciones al vincular una publicación y los mensajes de cifras ya consultadas. También se añadieron los estados de autorización sin canal, permiso de lectura ausente y error de actualización automática. Un error conserva la fecha de las últimas observaciones válidas y se muestra en Fuentes y equipo y Resultados.

La creación real del PNG y del MP4 la ejecutó el recorrido principal. Esta revisión visual no consumió otra generación de IA ni publicó contenido en una red externa. Los enlaces y las cifras públicas no verifican que el usuario sea propietario del canal.

## Verificación técnica y diseño

TypeScript y la comprobación de diferencias pasaron para los cambios de interfaz. La compilación integrada y las pruebas de servidor se coordinan desde el recorrido principal.

Se ejecutó una sola pasada del detector de Impeccable sobre los seis archivos de interfaz afectados. No encontró errores obligatorios; sus siete avisos son tamaños de texto de 12/16 píxeles que ya contempla la explicación de DESIGN.md y un color previo de Settings fuera de las líneas modificadas. No se cambió el sistema visual ni se reparó deriva ajena a este trabajo.

La última compilación se confirmó en las cuatro superficies, en escritorio y móvil: documento de 1280/390 píxeles respectivamente, sin desbordamiento horizontal. El cambio de imagen a video conservó 16:9 y ocultó el campo de dirección visual al reutilizar la imagen asociada. El PNG observado mide 1672 × 941; la reproducción del MP4 existente cargó sus metadatos correctamente. La verificación del nuevo montaje y su aislamiento del sistema corresponde al recorrido principal.

Para la rama de error automático se sustituyó **solo la respuesta de lectura GET de conexiones en esta pestaña**, con un mensaje que empieza por **[QA simulada]**. Fuentes y equipo mostró el estado ámbar y ambas superficies mostraron el error y la fecha anterior. No se cambió el servidor, no se revocaron claves y no se sustituyeron llamadas al proveedor. Se restauró fetch y se hizo una navegación completa antes de las capturas normales. Las dos capturas de esa rama llevan `simulated` en el nombre; la prueba de error real del programador está en las pruebas de servidor.

La consola conserva un 404 de una dirección escrita incorrectamente durante la prueba (`/discovery`, 12:55:24 UTC); se corrigió a la ruta existente `/radar`. Ese registro histórico no es un fallo nuevo de las superficies confirmadas.

Las [observaciones estructuradas](ui-validation.json) distinguen los datos reales de la rama simulada. Capturas finales:

- Fuentes y equipo: [escritorio](ui-evidence/settings-desktop.png), [móvil](ui-evidence/settings-mobile.png).
- Descubrimiento: [escritorio](ui-evidence/discovery-desktop.png), [móvil](ui-evidence/discovery-mobile.png).
- Creación visual: [escritorio](ui-evidence/studio-desktop.png), [móvil](ui-evidence/studio-mobile.png).
- Resultados: [escritorio](ui-evidence/results-desktop.png), [móvil](ui-evidence/results-mobile.png).
- Error simulado: [Fuentes y equipo](ui-evidence/settings-error-simulated.png), [Resultados](ui-evidence/results-error-simulated.png).
