# references-3 · Acceso al original adjunto

**Corregido; pendiente de integración conjunta.** Responsable independiente: `fix_references_3`.

El detalle ahora muestra **Archivo adjunto**, nombre, tipo y tamaño, con **Descargar original adjunto**. La descarga usa la ruta autenticada de la empresa; el enlace público **Ver original** permanece separado. No se cambió la política de citas públicas ni el servidor.

## Causa y reproducción roja

`ReferenceDetail` sólo renderizaba imágenes y enlaces públicos. Ignoraba los documentos asociados por `assetId`, aunque sus metadatos y bytes ya estaban disponibles.

En una empresa ficticia aislada se creó desde **Agregar referencia** el TXT `references-3-original-ñandú.txt`, sin título, enlace ni contexto. El archivo tenía199 bytes y GET 200; el modal tenía **cero enlaces**. La comprobación del síntoma original falló antes de editar código: `expectedOriginalLinkPresent=false`. Véanse [rojo](../evidence/references-3-red-ui.png) y [observaciones](../evidence/references-3-browser-checks.json).

## Corrección y resistencia a fallos

- El enlace se construye con los identificadores de empresa/asset sobre el mismo origen, sin convertir un archivo autenticado en cita pública ni usar URLs arbitrarias de metadatos.
- HEAD comprueba disponibilidad antes de ofrecer la descarga. La petición se aborta al cerrar/cambiar el detalle, tiene un límite de 10 segundos y descarta respuestas obsoletas.
- Un 404/410 explica que el archivo no está disponible. Un 401/403 explica el problema de acceso. Fallos temporales ofrecen **Volver a comprobar**, conservando el detalle y sus datos.
- Si falta el asset o una referencia documental perdió su adjunto, aparece una explicación sin enlace roto. Las imágenes conservan su previsualización; la lectura audiovisual no se modifica.
- La sección usa el estilo existente, se apila en móvil, admite nombres largos y mantiene nombre y encabezado a 16 px. El enlace tiene foco visible y funciona con teclado.

## Verificación

| Comprobación | Resultado observado |
| --- | --- |
| Misma referencia roja, tras el cambio | Enlace inequívoco al original; clic nativo descarga el nombre correcto y 199 bytes. SHA-256 idéntico al fixture: `c7868aaed8a502ce7560125f651343d09d25b89d432fdc1b35c585359d31854a`. |
| Recarga y procedencia | El enlace persiste; **Ver original** conserva la URL pública de ejemplo y **Descargar original adjunto** conserva su ruta autenticada. No se visitó el destino externo. |
| Móvil390 × 844 | Documento 390 px; modal 370 px y scrollWidth 370 px, sin desborde. Nombre a 16 px. |
| Teclado | Tab llega al enlace; foco visible con outline verde de 3 px. Enter descarga. |
| Revisor | GET y descarga200,199 bytes; Analizar referencia y Crear guion permanecen deshabilitados. Rol ficticio restaurado al terminar. |
| Archivo físicamente ausente | Renombrado temporal del archivo propio produce HEAD 404 real; se muestra ausencia y ningún enlace de descarga. Restaurarlo y reintentar habilita el mismo original. |
| Metadata ausente | DELETE autenticado de un segundo adjunto elimina assetId y deja el contexto de referencia; el detalle explica cómo reponerlo, sin enlace. |
| 503 y 401 controlados | Mensajes distintos, ningún enlace inválido y reintento exitoso al restaurar el transporte local. |
| HEAD retenido | Cerrar aborta la petición; reabrir con transporte normal funciona sin resultado obsoleto. |
| Pruebas HTTP cercanas | `node --test tests/remediation-references-3.test.mjs tests/remediation-assets-1.test.mjs tests/remediation-references-2.test.mjs`:17/17, 0 fallos, 0 canceladas. Tres tests nuevos comprueban bytes/nombre/HEAD, roles/empresas y ausencias. |
| TypeScript | `npx tsc --noEmit`: exit 0. |

Los tests HTTP nuevos afirman las garantías existentes del endpoint del que depende la UI; la regresión roja corresponde al recorrido nativo del navegador, no a una prueba superficial de markup. Una expectativa inicial del test nuevo confundía el 404 con el que `requireBrand` oculta marcas ajenas y403; se corrigió al contrato existente. No se cambió ninguna prueba previa.

## Archivos y evidencia

Cambios en `src/features/Discovery.tsx` exclusivamente en import y `ReferenceDetail`, reglas específicas `.reference-attachment` en `src/styles.css`, y `tests/remediation-references-3.test.mjs`. [Escritorio](../evidence/references-3-desktop-final.png), [móvil](../evidence/references-3-mobile-final.png), [revisor](../evidence/references-3-reviewer-ui.png), [ausencia física](../evidence/references-3-physical-missing-ui.png), [ausencia de metadatos](../evidence/references-3-metadata-missing-ui.png), [fallo temporal](../evidence/references-3-service-error-ui.png), [log de tests](../evidence/references-3-http-tests.txt).

## Límites

Se usaron contenido y cuentas ficticios, sin claves ni proveedores de pago. El viewport móvil es emulado en Chromium. HEAD prueba disponibilidad en ese momento y no bloquea cambios posteriores en archivo o permisos.503/401 y la petición retenida son simulaciones locales explícitas; el 404 físico, la eliminación, los roles y los bytes se probaron contra servidor real aislado. El build global y el recorrido compilado corresponden al coordinador.

Pestaña propia cerrada; sesión de desarrollo terminada y puertos4510/5510 libres. Datos ficticios conservados. Durante SIGINT, Node `--watch` emitió la aserción FSEventWrap/FSWatcher ya observada en este entorno; el cierre acabó. Las pruebas HTTP sin watch aprobaron sin ese problema.
