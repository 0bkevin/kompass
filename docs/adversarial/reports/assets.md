# Archivos · revisión adversarial independiente

Resultado **FAIL**. **20 casos: 18 PASS, 2 FAIL, 0 BLOCKED. Hallazgos: 0 P1, 2 P2, 0 P3.** Revisión realizada el 18 de octubre de 2026 UTC sobre el build existente, sin modificar implementación, estilos o datos ajenos y sin leer otros informes.

Instancia propia: `http://127.0.0.26:4116`; `DATA_DIR=/tmp/30x-adversarial-assets`. Cuenta principal ficticia `qa-assets@example.com`; cuenta secundaria sintética `qa-assets-other@example.com`. Empresas A/B/C, piezas y archivos exclusivamente propios. Cuenta y piezas preparadas por API; membresía reviewer preparada por SQLite sólo en la base propia. Las cargas, filtros, búsqueda, detalles, descargas, asociación, guardado y borrados revisados se realizaron mediante herramientas nativas T3 con el tabId propio.

## assets-1 · P2 · Los nombres UTF-8 se corrompen al subir y dejan de encontrarse por su nombre original

1. Entrar en /assets con la cuenta sintética qa-assets@example.com y la empresa QA Archivos Sintética.
2. Subir desde UI /tmp/30x-adversarial-assets/fixtures/03-ñandú & "prueba" #100%.txt.
3. Comparar Resultado de la carga con la tarjeta guardada; recargar y buscar ñandú.
4. Abrir el detalle y pulsar Descargar original.

**Esperado:** Mantener el nombre Unicode original en almacenamiento, biblioteca, búsqueda, detalle y cabecera de descarga.

**Observado:** El resultado local dice ñandú pero el registro y la tarjeta dicen Ã±andÃº. Buscar ñandú no encuentra el archivo. La descarga nativa recibe 03-Ã±andÃº & _prueba_ #100%.txt. La sustitución de comillas por guiones bajos es saneamiento del navegador; el mojibake ya existe en el servidor. El contenido conserva sus 57 bytes exactos.

**Evidencia:** [assets-1-unicode.png](../evidence/assets-1-unicode.png), [assets-1-search.png](../evidence/assets-1-search.png), [assets-observations.json](../evidence/assets-observations.json), [assets-byte-verification.json](../evidence/assets-byte-verification.json).

**Apoyo de código:** `server/core.mjs:775`, `server/core.mjs:1244`, `server/core.mjs:1283`, `src/features/Assets.tsx:32`. La configuración de multer no especifica un charset de parámetros y persiste originalname directamente. Es una explicación compatible con el mojibake observado; la decodificación interna de la dependencia no se instrumentó.

## assets-2 · P2 · Un TXT válido de 11 MiB falla pese al límite anunciado de 25 MB

1. Crear un TXT ASCII propio de 11*1024*1024 bytes; la fixture conservada se llama 15-texto-11MiB.txt.
2. Subirlo desde /assets con propietario. Opcional: buscar 15-texto para ver simultáneamente la ayuda Hasta 25 MB por archivo.
3. Observar el resultado individual; repetir la carga para confirmar que el fallo es estable.
4. Subir la fixture equivalente de 10*1024*1024 bytes, 16-texto-10MiB.txt.

**Esperado:** Aceptar el TXT dentro del límite anunciado o informar del límite específico antes de subir y explicar el rechazo por tamaño.

**Observado:** El TXT de 11 MiB recibe 400 Formato no admitido y no se guarda; el de 10 MiB recibe 201 y sí queda en la biblioteca. La UI sólo valida 25 MiB y no informa el límite de 10 MiB para texto.

**Evidencia:** [assets-2-text-limit.png](../evidence/assets-2-text-limit.png), [assets-observations.json](../evidence/assets-observations.json), [assets-byte-verification.json](../evidence/assets-byte-verification.json).

**Apoyo de código:** `server/core.mjs:824`, `server/core.mjs:826`, `server/core.mjs:829`, `src/features/Assets.tsx:41`, `src/features/Assets.tsx:265`. La condición de detección limita texto a 10 MiB y comparte el error de formato. La UI valida únicamente 25 MiB.

## Casos y comparación

El resultado esperado se establece antes de contrastarlo con el observado en cada fila. Los registros técnicos completos y los SHA-256 se conservan en [assets-observations.json](../evidence/assets-observations.json) y [assets-byte-verification.json](../evidence/assets-byte-verification.json).

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| 1. Biblioteca vacía | La empresa nueva muestra una biblioteca vacía y una acción para cargar archivos. | La empresa sintética A empezó sin archivos; mostró el estado vacío y el selector múltiple. | PASS |
| 2. Carga única de imagen | Un PNG válido se guarda una sola vez y se visualiza. | 01-imagen.png se guardó (201), 68 bytes, miniatura naturalWidth=1 y una única fila. | PASS |
| 3. Carga múltiple con fallos parciales | Cada archivo obtiene resultado propio; se conservan los válidos aunque otros fallen. | De ocho archivos: PDF, TXT y PNG de 25 MiB guardados; EXE, PNG falso, HTML, SVG y PNG de 25 MiB+1 rechazados con resultado individual. | PASS |
| 4. MIME/extension de imagen falsos | Texto con extensión .png y MIME image/png no debe aceptarse como imagen. | 05-mime-falso.png recibió 400 Formato no admitido; no quedó registro ni archivo huérfano. | PASS |
| 5. Límite de imagen de 25 MiB | 25*1024*1024 bytes se admiten; un byte adicional se rechaza desde la UI. | 08-limite-exacto.png se guardó y devolvió 26214400 bytes con SHA-256 idéntico. 09-supera-limite.png fue rechazado antes de POST por superar 25 MB. | PASS |
| 6. Documento TXT de 11 MiB | Un TXT válido menor de los 25 MB anunciados se guarda o la UI explica previamente su límite específico. | Un TXT ASCII de 11534336 bytes fue rechazado repetidamente como Formato no admitido; TXT idéntico de 10485760 bytes sí se guardó. | FAIL |
| 7. Nombre con Unicode y caracteres especiales | ñandú, &, comillas, # y % se conservan en nombre, búsqueda y descarga salvo saneamiento del sistema al guardar localmente. | El nombre original 03-ñandú & "prueba" #100%.txt se guardó como 03-Ã±andÃº & "prueba" #100%.txt. Buscar ñandú no devuelve resultados, incluso tras recarga. La descarga conserva el texto dañado del nombre; los bytes del contenido sí coinciden. | FAIL |
| 8. Filtros de imagen y documento | Imágenes muestra sólo PNG y Documentos muestra sólo PDF/TXT. | Con cuatro archivos iniciales, Imágenes mostró 01 y 08; Documentos mostró 02 y 03. Todos restauró la lista completa. | PASS |
| 9. Búsqueda por nombre ASCII | Buscar un fragmento limita la lista al archivo correspondiente y borrar la consulta restaura la lista. | 03- encontró sólo el TXT; 02-documento encontró sólo el PDF; limpiar la consulta restauró los archivos del filtro activo. | PASS |
| 10. Detalle de imagen y documento | Al abrir una tarjeta, el detalle corresponde a ese archivo y permite descargarlo. | Los detalles de 01-imagen.png y del TXT mostraron sus títulos y el enlace Descargar original al ID correcto; el documento usa un icono y la imagen se visualiza. | PASS |
| 11. Descarga con bytes exactos | Las descargas UI de PNG, PDF y TXT conservan cada byte original. | Tres descargas nativas del navegador comparadas byte a byte con las fixtures: 68/73/57 bytes; igualdad exacta true en los tres casos. La respuesta del PNG de 25 MiB también tiene SHA-256 idéntico. | PASS |
| 12. Reintento tras fallo de actualización | Si la carga se guarda y falla actualizar la biblioteca, el reintento sólo recupera la lista sin volver a subir. | Con un fallo sintético de una sola llamada GET /state, 10-reintento.md quedó Guardado, Subir archivos se deshabilitó y Reintentar actualización recuperó la lista. El total pasó de cuatro a cinco, con una sola fila de 10-reintento.md. | PASS |
| 13. Persistencia de archivos tras recarga | Recargar conserva los mismos registros, tamaños y contenido. | La biblioteca persistió entre varias recargas y sesiones; los hashes leídos desde respuesta y almacenamiento coincidieron. Al final hubo ocho registros y ocho archivos físicos, sin restos de cargas rechazadas. | PASS |
| 14. Asociar recurso y recargar pieza | Seleccionar un archivo en Recursos y Guardar cambios persiste la asociación. | Desde la UI se seleccionó 01-imagen.png, se guardó y se recargó la pieza 6fccb1d4-bc0d-4a32-a5e9-feec8a309bd8. El checkbox permaneció marcado y assetIds contuvo su ID. | PASS |
| 15. Eliminar archivo sin uso | Confirmar el borrado elimina la tarjeta y hace inaccesible el archivo. | 12-sin-uso.txt fue eliminado desde UI (200); desapareció de la biblioteca y su URL devolvió 404. | PASS |
| 16. Proteger archivo asociado a pieza aprobada | El borrado responde 409 y conserva archivo y asociación. | La pieza asociada se envió a revisión y aprobó desde UI; intentar borrar 01-imagen.png devolvió 409 con explicación. El archivo y assetIds permanecieron. | PASS |
| 17. Eliminar archivo de borrador sin referencias colgantes | El borrado limpia assetIds y scenes[].assetId del borrador. | Fixture de borrador con ambas referencias a 11-borrador.txt; el borrado UI dio 200 y luego assetIds=[], escena sin assetId y URL 404. | PASS |
| 18. Autenticación de descarga | La URL directa de un archivo requiere sesión. | Tras Cerrar sesión desde UI, navegar a la URL original del PNG devolvió 401 Inicia sesión para continuar. | PASS |
| 19. Aislamiento de empresa y cuenta | Cambiar a una empresa vacía no muestra archivos ajenos; otra cuenta sin membresía no puede abrir una URL conocida. | Empresa B mostró biblioteca vacía y el ID de A consultado bajo B devolvió 404. Otra cuenta sintética, sin membresía en A, recibió 404 No se encontró la marca al navegar al archivo de A. | PASS |
| 20. Controles de revisor y lectura autorizada | Un revisor de la empresa puede leer, pero no tiene acciones UI para cargar o borrar. | Segunda cuenta añadida por fixture propia como reviewer: Subir archivos y los siete Eliminar archivo estaban disabled; GET del PNG devolvió 200 y 68 bytes. | PASS |

La descarga nativa de imagen, PDF y TXT se comparó directamente con las fixtures: 68, 73 y 57 bytes, respectivamente; las tres comparaciones byte a byte son iguales. El PNG de 25 MiB devolvió `e1982588bcfd4cfade1f939152e954885316b2b83ad8c89dcb6f0a08f0a07b25`, idéntico al original. La protección de borrado se verificó tanto en la respuesta 409 como en la conservación del archivo y assetIds. El borrado de borrador se verificó en assetIds y scenes[].assetId y mediante 404 posterior de la URL.

Las pruebas de aislamiento produjeron **401 sin sesión**, **404 para cuenta sin membresía** y **404 para un ID de archivo A bajo la ruta de empresa B**. La biblioteca de B quedó vacía al cambiar de empresa. Tras añadir explícitamente la cuenta secundaria como reviewer de A, el archivo devolvió 200 y los controles de carga y borrado aparecieron deshabilitados.

## Evidencia visual

- [Nombre persistido con Unicode dañado](../evidence/assets-1-unicode.png).
- [Búsqueda por el nombre original sin resultados](../evidence/assets-1-search.png).
- [TXT de 11 MiB rechazado junto al límite anunciado de 25 MB](../evidence/assets-2-text-limit.png).
- [Carga múltiple con resultados individuales](../evidence/assets-partial-upload.png).
- [Recuperación de actualización sin volver a subir](../evidence/assets-retry.png).
- [Borrado de recurso aprobado protegido](../evidence/assets-delete-approved.png).

## Límites

- Auditoría independiente del build existente, escritorio 1280x800, T3 incognito, 2026-10-18 UTC. No build, format, cambios de aplicación, claves, pagos, publicación ni datos de otros agentes.
- Todas las cuentas, empresas, piezas y archivos son sintéticos propios. PDF de 73 bytes es un marcador mínimo para transporte; no se validó un visor PDF ni documentación compleja. TXT y PNG válidos cubren descarga y visualización básicas.
- El fallo GET /state se instrumentó una vez en window.fetch de la pestaña propia y se restauró después. Verifica recuperación UI; no representa una caída real de red o almacenamiento.
- La comprobación de HTML/SVG usa marcadores inertes propios, sin scripts ni conexiones externas: rechazo de .html/.svg y descarga segura de los mismos tipos de bytes como .txt. No se intentó exfiltración ni ejecución activa.
- Los controles de reviewer se comprobaron en UI y su lectura autorizada mediante GET; no se enviaron peticiones mutantes forjadas para eludir esos controles. Tampoco se intentó eludir por API el límite UI de 25 MiB.
- No se validó reproducción de audio/video, todos los formatos de archivo, navegadores adicionales, concurrencia entre editores ni recuperación ante pérdida física del almacenamiento.

## Reproducción y cierre

Se conservan la SQLite, uploads y las 16 fixtures originales en `/tmp/30x-adversarial-assets`; el manifiesto incluye tamaños y SHA-256. Quedaron ocho registros de archivos y ocho archivos físicos, sin restos de los rechazos ni de los dos borrados. Pieza aprobada protegida: `6fccb1d4-bc0d-4a32-a5e9-feec8a309bd8`; borrador cuya referencia se limpió: `797367bb-762d-427d-9be6-92de81e20c2f`.

Proceso propio: sesión exec `6335`, PID `3896050`; pestaña propia `tab_42_07e54779-9ab2-4979-8a15-674c4eff160a`. Al finalizar se cerraron únicamente esa pestaña y ese proceso. Para reproducir, iniciar el build existente con el mismo DATA_DIR y puerto, sin las claves de proveedores, siguiendo BRIEF.md. No se ejecutaron build ni format.

