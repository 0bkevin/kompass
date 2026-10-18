# company-2 — Direcciones de contacto inline

Estado: **fixed**, pendiente de comprobación integrada del coordinador. Agente: `fix_company_2`. Fecha: 2026-10-18. Datos exclusivamente sintéticos.

## Causa y corrección

La regla compartida `redact` sólo reconocía `Dirección:`, `Address:` o `Domicilio:` al inicio del texto o de una línea. Por ello el domicilio dentro de un párrafo llegaba tanto a `evidence.excerpt` como a `draft.description`. Cuando sí coincidía, consumía toda la línea y podía eliminar campos o prosa empresarial adyacentes.

`redactContactAddresses` reconoce esas etiquetas como palabras completas en cualquier posición, con mayúsculas, `Dirección`/`Direccion`, dos puntos normales o de ancho completo y calificadores postal, particular, fiscal o de contacto. Omite el campo hasta un límite de frase, línea, separador o siguiente campo conocido. Conserva abreviaturas habituales de calles/unidades y una continuación de dirección separada por coma y salto de línea. La redacción se realiza antes de truncar o colapsar espacios, compartida por contenido aportado, metadatos HTML, párrafos HTML y respuestas de texto.

La proyección `publicInspection` también vuelve a redactar la descripción, los títulos, extractos, motivos, errores textuales y avisos de importaciones anteriores. Mantiene identificadores, URL, fecha, método, estado, plataforma y demás claves. No borra ni modifica la evidencia histórica almacenada. Las importaciones nuevas sí se guardan ya redactadas. No cambia automáticamente el contexto empresarial confirmado.

## Reproducción roja y comprobación verde

El comando inicial, ejecutado dos veces antes de modificar la implementación, fue:

```bash
node --test tests/remediation-company-2.test.mjs
```

Resultado inicial: **0/1 PASS**, `AssertionError` porque el POST real a `/api/brands/:brandId/context/import` conservaba `Calle Inventada 456` y `Ciudad Sintética`. Después de ampliar la cobertura, también se observó el mismo defecto en variantes, caché y extracción; el caso de límite de 2.000 caracteres mostró `Dirección: Calle Simulad` sin redactar. No se alteró la implementación para fabricar estos fallos.

El extracto y la descripción originales del informe producían:

```text
PRUEBA SINTÉTICA: Nexo ofrece formación de procesos. Contacto ficticio Persona QA; el siguiente dato es su domicilio particular, no una sede de empresa. Dirección: Calle Inventada 456, Ciudad Sintética. Correo: [correo omitido].
```

Ahora ambos campos coinciden exactamente con:

```text
PRUEBA SINTÉTICA: Nexo ofrece formación de procesos. Contacto ficticio Persona QA; el siguiente dato es su domicilio particular, no una sede de empresa. [domicilio omitido]. Correo: [correo omitido].
```

También se creó una importación histórica sintética con los campos sin sanear: su GET falló antes de corregir `publicInspection` y pasa después. La prueba compara el registro SQLite antes y después del GET para demostrar que la redacción de lectura no altera el original.

Comprobaciones finales:

- `node --test tests/remediation-company-2.test.mjs`: **25/25 PASS**, incluida la comprobación original sin debilitarla.
- `node --test tests/remediation-company-2.test.mjs tests/company-context.test.mjs`: **37/37 PASS**; autenticación, permisos, aislamiento, recuperación, caché y conservación del perfil siguen pasando.
- `./node_modules/.bin/prettier --check server/company-context.mjs tests/remediation-company-2.test.mjs`: formato local correcto.

El recorrido es HTTP real sobre Express, autenticación y SQLite temporal: importar → comprobar respuesta → leer historial → comprobar registro persistido; e inspeccionar → recuperar caché → confirmar → recargar historial. No es una prueba de regex aislada. Cubre texto y extracción HTML/texto simulada, campos consecutivos, domicilios repetidos, abreviaturas, prosa anterior/posterior, CRLF, fin de entrada, párrafos y truncación. El servidor, las conexiones, SQLite y los directorios temporales se cierran y eliminan al terminar cada ejecución.

## Archivos y límites

- `server/company-context.mjs`: redacción compartida y proyección segura de historial.
- `tests/remediation-company-2.test.mjs`: regresiones y recorrido completo del inspector.
- Este informe y `company-2.json`.

No se ejecutó navegador ni build; no cambió la UI. Las fuentes externas son fixtures sintéticas con transporte simulado, sin claves, gasto, solicitudes a proveedores ni validación de IA real. Los tests sólo hacen solicitudes HTTP al servidor local aislado.

Es una regla acotada para campos de dirección explícitamente etiquetados y delimitados. No es un detector universal de datos personales: no garantiza identificar domicilios sin etiqueta, ofuscaciones o todos los formatos postales/abreviaturas internacionales. Los originales históricos permanecen almacenados para conservar evidencia; esta corrección los sanea al devolverlos y no supone un borrado físico retroactivo.
