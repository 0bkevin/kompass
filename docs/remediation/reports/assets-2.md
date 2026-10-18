# assets-2 · TXT válido de 11 MiB

Estado: **corregido, pendiente de integración del coordinador**. Agente: `fix_assets_2`. Evidencia propia del 18 de octubre de 2026 UTC; cuenta, marca y archivos sintéticos aislados.

## Causa y cambio

`detectFile` sólo reconocía texto hasta 10 MiB y revisaba el primer 1 KiB. El parser permitía 50 MiB y la UI anunciaba 25 MiB. Un TXT ASCII de 11.534.336 bytes llegaba a disco, pero devolvía **400 Formato no admitido**.

El máximo real de assets ahora es **25 MiB inclusivos (26.214.400 bytes)** en el parser y en la UI. La ruta convierte su error de tamaño a **413** con el mensaje «El archivo supera el máximo de 25 MiB. Selecciona uno más pequeño». No se cambió el límite de otros servicios.

TXT, Markdown y CSV se inspeccionan completos como UTF-8 estricto, sin controles binarios, con un buffer fijo de 64 KiB y decodificación streaming. Un carácter multibyte dividido entre lecturas se conserva y una secuencia incompleta al final se rechaza. Un MIME de texto no sustituye la comprobación de contenido. El error de texto inválido indica el problema y pide volver a guardarlo en UTF-8; la ayuda anuncia esa codificación. CSV aparece en el selector y las tarjetas muestran MiB.

Se conserva `filenameAwareUpload`, sus reglas de charset y nombre, los headers de descarga y la subida individual. No se reemplazó el middleware por el multer anterior.

CaptureModal también usa esta ruta. Sus dos ayudas todavía anunciaban 50 MB y la guardia local permitía 50 MiB. Se unificaron esas ayudas, la guardia y el error a 25 MiB, con UTF-8 en el hint y CSV en el selector. El cambio quedó limitado a CaptureModal y coordinado con references-3; no modifica ReferenceDetail. [Comprobación local](../evidence/assets-2-capture-copy.txt).

## Reproducción roja y verde

Comando ejecutado **antes de corregir**:

```bash
node --test --test-name-pattern='original 11 MiB' tests/remediation-assets-2.test.mjs
```

Falló dos veces de forma determinista: **400 != 201**, cuerpo «Formato no admitido…». [Salida roja](../evidence/assets-2-red.txt). La UI propia reproduce el mismo fallo y mantiene la promesa de 25 MB: [captura roja](../evidence/assets-2-red-ui.png).

El mismo test y la misma fixture física `15-texto-11MiB.txt` pasan con el arreglo. UI: **201**, «Guardado», una entrada en biblioteca. Descarga HTTP: **200**, 11.534.336 bytes idénticos. SHA-256 de entrada y descarga:

```text
1309fb8522d7deec22b712f936fddc4cf81fd13588c6fa2f1554972741e2674c
```

[Captura verde](../evidence/assets-2-green-ui.png), [observaciones del navegador](../evidence/assets-2-browser.json), [manifest de fixtures](../evidence/assets-2-fixtures.json).

## Límites y casos de contenido

Todos los casos HTTP atraviesan el parser multipart real, autenticación, persistencia y ruta de descarga; no se llama directamente a `detectFile`.

| Caso                                                                               |          Bytes | Resultado                                           |
| ---------------------------------------------------------------------------------- | -------------: | --------------------------------------------------- |
| TXT ASCII 10 MiB                                                                   |     10.485.760 | 201; descarga exacta                                |
| TXT ASCII original 11 MiB                                                          |     11.534.336 | 201; descarga exacta                                |
| TXT ASCII 25 MiB                                                                   |     26.214.400 | 201; descarga exacta                                |
| TXT y firma PNG, 25 MiB + 1                                                        |     26.214.401 | 413 de tamaño; sin registros ni archivos huérfanos  |
| UTF-8 multibyte entre bloques y emoji al EOF                                       |     11.534.336 | 201; descarga exacta                                |
| Binario después del primer 1 KiB, UTF-8 malformado/incompleto, controles y Latin-1 |         varios | 400 específico de texto/UTF-8; sin archivo huérfano |
| PNG/JPG/GIF/WebP/PDF/WAV/Ogg/MP3/MP4/WebM y texto seguro                           | firmas mínimas | comportamiento y descarga preservados               |
| PNG declarado como text/plain y renombrado .txt                                    |      firma PNG | reconocido como image/png; no se confía en el MIME  |

## Recuperación del lote y UI

Desde el input real se cargó un lote con un TXT de 25 MiB + 1, un binario renombrado y texto válido. El exceso se detiene localmente; el binario recibe 400; el válido se guarda con 201. El resultado mantiene cada nombre y su causa, y continúa tras los fallos.

Para comprobar recuperación se simuló **sólo un GET /state con 503 en window.fetch de la pestaña propia**, manteniendo las cargas HTTP reales. La UI ofrece «Reintentar actualización» y bloquea nuevas cargas hasta actualizar. Al pulsarlo realiza sólo GET /state con 200: no repite POST y queda exactamente una entrada del archivo válido. Se restauró el fetch original. [Antes del retry](../evidence/assets-2-batch-retry-ui.png), [biblioteca recuperada](../evidence/assets-2-batch-recovered-ui.png).

En 390×844, documentWidth=390 y el resultado ocupa 358px: sin scroll horizontal, ayuda y errores legibles, `aria-describedby` en el botón de subida. [Captura móvil](../evidence/assets-2-mobile-ui.png).

## Verificación y límites de evidencia

- `node --test tests/remediation-assets-1.test.mjs tests/remediation-assets-2.test.mjs tests/workflow-recovery.test.mjs`: **16/16 PASS**, incluidas las pruebas de nombres, aborto, límites y backpressure de assets-1. [Salida](../evidence/assets-2-green-tests.txt).
- `node --test tests/core.test.mjs`: **14/14 PASS**, incluidas carga privada, formatos, aislamiento y roles. [Salida](../evidence/assets-2-core-tests.txt).
- CaptureModal: comprobación local de los dos hints, límite y error de 25 MiB, UTF-8/CSV, y transpilación TSX sin errores. No se reabrió el runtime para este ajuste final de copy/guardia; queda el recorrido nativo del modal al coordinador.
- Los medios de preservación son firmas mínimas de transporte, sin prueba de reproducción o validación integral de contenedores.
- Igualdad de descarga acreditada por HTTP real en Node y fetch del navegador. Un click de descarga nativa coincidió con el reinicio de desarrollo al ajustar formato del core; falló el proxy. No se presenta una descarga del SO como evidencia.
- No se ejecutaron build ni formato global; sin dependencias, claves o proveedores reales, publicaciones, datos principales ni subagentes. El coordinador conserva la comprobación integrada final.

Pestaña propia `tab_4l_07e54779-9ab2-4979-8a15-674c4eff160a` cerrada. Runtime propio `127.0.1.26:5516`, API 4516, sesión 4696 y DATA_DIR `/tmp/30x-remediation-assets-2`; procesos detenidos y puertos sin listeners. Node 24 --watch imprimió una aserción al cerrar por SIGTERM, después de las comprobaciones; no quedó listener. Se conservaron fixtures y base propia.
