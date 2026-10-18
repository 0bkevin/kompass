# Admisión de texto al corpus editorial público

Área 6, base `30c3868`. El módulo `server/content-privacy.mjs` está listo para integrar. **Este commit no instala las guardas en las rutas ni en el envío a proveedores.** La integración corresponde al agente principal; un helper sin llamadas en esos límites no impide la ingesta ni la transmisión de datos personales.

## Contrato exportado

```js
import {
  assertPublicContentText,
  inspectPublicContentText,
  PUBLIC_CONTENT_ISSUE_CODES,
} from "../server/content-privacy.mjs";

inspectPublicContentText("Contenido editorial público");
// { allowed: true, issues: [] }

inspectPublicContentText("Correo: persona@example.test");
// { allowed: false, issues: ["contact_email"] }

assertPublicContentText(textoValidado, "Referencia");
// Devuelve exactamente el string recibido, sin normalizarlo ni redactarlo.
// Si hay hallazgos: Error con status=400, code="PUBLIC_CONTENT_PRIVACY",
// issues=[...]. El mensaje y los códigos no incluyen valores detectados.
```

`PUBLIC_CONTENT_ISSUE_CODES` es una lista congelada en orden estable: `invalid_text`, `contact_email`, `contact_phone`, `personal_identifier`, `individual_record`, `possible_credential`. Cada informe contiene su propia lista, sin duplicados. Los tipos distintos de string, incluidos `null`, objetos y `Buffer`, producen `invalid_text`; el llamador debe resolver sus campos opcionales antes de invocar la guarda. `label` debe ser una etiqueta fija del código, nunca contenido del usuario.

La inspección es local, sin credenciales, dependencias nuevas, red, almacenamiento ni registro de contenido. Reutiliza la detección de fichas de `aggregate-privacy.mjs` y la inspección de contactos en URL de `url-privacy.mjs`; evita aplicar al texto libre la regla numérica general de contactos de audiencia, que confunde fechas y cifras largas.

Detecta correos, teléfonos con contexto o formato reconocible, ciertos documentos de identidad, campos explícitos de persona y fichas en texto etiquetado/JSON/tablas sencillas. También reconoce asignaciones de credenciales, cabeceras Bearer/Basic con valores concretos, algunos prefijos de claves, JWT y cabeceras de clave privada. Normaliza variantes Unicode comunes para inspeccionar, examina escapes porcentuales en URLs y valores string de JSON válido. Preserva atribuciones como `Autor: Ada Lovelace`, nombres de empresas, fechas, IDs de artículos, cifras empresariales con contexto y marcadores explícitos como `<TOKEN>` o `YOUR_TOKEN_HERE`.

## Puntos de integración para el agente principal

Las referencias a funciones corresponden a la base indicada. Aplicar las guardas a los valores originales **antes de truncar, redactar, guardar, deduplicar o transmitir**. No inspeccionar objetos completos de solicitud, usuarios, sesiones o configuración de integraciones: las credenciales y cuentas de operadores pertenecen a otro límite.

1. **CRUD de contenido, `server/core.mjs`.** En `referenceInput`, revisar los campos aportados `title`, `text`, `source`, `tags` y `url` tras validar su tipo y antes de devolver el registro. Revisar también el conjunto de textos para detectar estructuras repartidas entre campos. En `brandInput`, revisar contexto editorial y campos de audiencia; en `ideaInput` y `pieceInput`, revisar título, enfoque, guion, escenas, caption, CTA y notas editables. En `sourceInput`, revisar nombres, consulta y URLs antes de su uso. No aplicar la guarda a IDs de aplicación, responsables, resultados numéricos, OAuth, registro/login, invitaciones ni claves de integraciones. Validar campos nuevos o realmente editados; no rechazar una edición administrativa solo por un cuerpo histórico intacto. No vaciar ni reescribir registros existentes.

2. **Archivos, `server/core.mjs`, `POST /brands/:brandId/assets`.** Dentro del `try`, justo después de `detectFile(req.file)` y antes de `saveRecord`, revisar el nombre limpio y el contenido completo de `text/plain`, `text/markdown` y `text/csv`. `detectFile` ya comprueba UTF-8 y el límite es 25 MiB; leer únicamente esos archivos temporales del upload actual. La excepción debe pasar al `catch` existente, que elimina `req.file.path`. No analizar bloques independientes sin conservar continuidad: un dato puede atravesar el límite del bloque. No convertir un PDF/imagen/audio/video a UTF-8 ni marcarlo como revisado por esta guarda. Mantener esos adjuntos fuera del texto para IA salvo un flujo de extracción autorizado con su propia comprobación.

3. **Contexto de empresa, `server/company-context.mjs`.** En `validateInput`, revisar texto y URLs aportados antes del bucle de red de `inspectCompany`. En `inspectUrl`, revisar título, descripción y texto extraídos antes de construir evidencia o borrador, y antes de que `redact`/los cortes oculten parte del contenido. `readHtml` ya limita sus campos: la integración debe efectuar la comprobación del texto extraído antes de esos cortes si quiere rechazar la página completa. Una página con hallazgos debe producir evidencia fallida con un aviso fijo, sin excerpt, cuerpo ni valores personales. Revalidar las entradas editables de `/context/commit`, que pueden evitar el paso de inspección.

4. **Descubrimiento, `server/intelligence.mjs`.** En `syncSources`, dentro del bucle `for (const fetchedItem of result.value)`, revisar título, texto, etiquetas, atribución textual y URLs antes de `findDuplicate`, cualquier promoción de evidencia y `saveRecord`. Omitir el elemento rechazado con diagnóstico fijo y conservar los demás resultados. HN/GDELT/Trends no son redes sociales y siguen sujetos a sus límites existentes. No cambiar permisos, proveedores ni procedencia. En `extractMetadata`, revisar los campos extraídos antes del `return` enriquecido; revisar también el material original cuando se omite la lectura por tener suficiente texto.

5. **Antes de usar IA.** En `analyzeReference`, `createDraft` y `opportunity-analysis.mjs::inputFor`, comprobar cada texto original de referencia, contexto, segmentos, señales, instrucciones aportadas por el editor y borradores antes de serializar o cortar. En `connectors.mjs::generateStructured`, añadir una segunda comprobación de `input` antes de `String(input).slice(0, 60000)` y antes del primer `fetcher`; un JSON válido también expone sus strings escapados a la inspección. Esa segunda guarda no sustituye comprobar campos y material originales antes de truncarlos. No escanear la cabecera de autorización construida con `config.apiKey`, el objeto `config`, el esquema técnico ni el prompt fijo del sistema como si fueran corpus. Los rechazos no deben convertirse en una respuesta de proveedor ni en un análisis completado. Conservar el flujo local sin IA cuando no hay proveedor.

6. **Otros textos que llegan al corpus.** En `audience-insights.mjs::audienceSignalInput`, perfiles/notas y preguntas/opciones de `community.mjs::editorialText`, combinar la admisión de texto público con las restricciones agregadas actuales; no sustituir la política de agregados ni el umbral comunitario. En `media-generation.mjs::create`, validar `body.prompt` antes de guardar/encolar y comprobar contexto/guion originales al construir el prompt en `runJob`, antes de usar el trabajador. Mantener OAuth y los datos oficiales de YouTube en `social-sync.mjs`, separados del análisis editorial y de los derivados conforme a la política vigente.

Para material histórico, comprobar la admisibilidad en memoria antes de utilizarlo como evidencia o enviarlo a IA. Un hallazgo debe impedir ese uso y permitir corregir el material; no autoriza borrar datos históricos, reescribirlos, leer datos de clientes para una auditoría ni alterar permisos de origen. La comprobación de privacidad tampoco concede derechos sobre el material ni sustituye las guardas de acceso existentes.

## Comprobaciones de integración que siguen pendientes

- POST/PATCH de referencia con contacto devuelve 400 sin persistir el cambio; una atribución pública, una fecha y una cifra empresarial se guardan intactas. Un cambio administrativo de un registro antiguo conserva sus datos.
- Upload UTF-8 con una ficha o credencial se rechaza antes de guardar asset y elimina el temporal, incluso si el hallazgo está al final. Un CSV de cifras empresariales pasa. Los formatos binarios no reciben una certificación de privacidad.
- Contexto aportado con datos identificables se rechaza antes de la primera lectura; una página de origen rechazada no deja excerpt ni borrador con esos datos.
- Un elemento de fuente rechazado no participa en deduplicación, evidencia ni IA; los demás resultados de esa fuente se conservan.
- Una referencia/contexto histórico insertado directamente por una prueba no alcanza al proveedor: el contador de llamadas simulado permanece en cero. Probar texto dentro de JSON y hallazgos después de los cortes habituales.
- Un input limpio sigue llegando a un proveedor simulado con la cabecera de operador correspondiente; login, OAuth y configuración de claves siguen funcionando. Los mensajes y logs de rechazo no repiten valores detectados.

## Límites

No es DLP total. `allowed: true` significa únicamente que no apareció uno de los patrones implementados. No clasifica nombres libres, rostros, voces, direcciones sin contexto, todos los identificadores locales, secretos de formato desconocido, texto cifrado/base64 general, contactos escritos con palabras, HTML arbitrariamente ofuscado ni todos los idiomas. Una cadena de dígitos sin contexto puede ser un total empresarial: no se presenta como teléfono automáticamente. No determina si un contacto es personal o corporativo; los contactos explícitos se rechazan en ambos casos para este corpus.

La detección de tablas es heurística, no un parser completo de CSV con celdas multilínea o formatos de hoja de cálculo. No abre archivos ni hace OCR/transcripción, análisis facial o extracción de PDF. Los datos pueden aparecer repartidos en varios documentos, con errores ortográficos o con un formato no reconocido. El enmascaramiento de placeholders permite documentación habitual, no demuestra anonimización. Las asignaciones ambiguas pueden requerir corrección humana. La revisión editorial y la separación entre corpus público, adjuntos y autenticación siguen siendo necesarias.

## Validación del módulo

`node --test tests/content-privacy.test.mjs` usa exclusivamente material sintético e incluye contactos, documentos, fichas, credenciales, URLs codificadas, JSON con escapes, atribución pública, copy legítimo, fechas, cifras, errores sin valores y texto largo con hallazgos al final. No prueba las rutas ni la prevención de envíos de producción; esas llamadas quedan expresamente pendientes arriba.
