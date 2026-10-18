# signals-1 · Corrección implementada

Responsable: `fix_signals_1`. Fecha: 2026-10-18. Estado: `fixed`, pendiente de la comprobación integrada del coordinador.

El POST HTTP real de la UI ya rechaza con 400 la ficha sintética del informe: «FICHA INDIVIDUAL SINTÉTICA. Nombre: Ana Sintética Ejemplo. Cargo: directora comercial. Necesidad individual: preparar propuestas más rápido.». La lectura posterior no la devuelve. Antes de cambiar la implementación, la prueba devolvía 201 y fallaba con `201 !== 400`.

La causa estaba en `audienceSignalInput`: sólo buscaba emails y teléfonos en tema/observación. Una ficha con nombre, cargo y necesidad individual carece de esos contactos y superaba la validación. Además, `admissibleSignal` aceptaba incondicionalmente las señales editoriales y públicas ya guardadas.

Los cambios son:

- `server/aggregate-privacy.mjs`: validación compartida de contactos y estructuras de registros individuales, incluidos campos etiquetados, fichas explícitas y tablas/CSV. No clasifica cualquier nombre propio como dato de audiencia.
- `server/audience-insights.mjs`: usa esa validación al guardar tema/observación y al admitir señales antiguas. GET de señales y el corpus de `buildInsights` excluyen los registros detectados; ese corpus también es la entrada de señales del análisis de oportunidades. No se altera `publicLink`, `growthFor` ni el registro de resultados.
- `tests/remediation-signals-1.test.mjs`: peticiones HTTP contra `createApp`, registro y marca sintéticos, SQLite temporal y host `127.0.1.14` con puerto efímero. Reproduce la carga exacta de la UI, fichas sin cabecera, tablas, contactos, lecturas antiguas y controles agregados válidos.

El módulo compartido exporta `assertAggregateAudienceText(value, label = "Texto")`, que devuelve el valor original o lanza un error con `status: 400` sin reflejar el dato; y los booleanos `containsAudienceContactDetails(value)` y `containsIndividualAudienceRecord(value)`. El llamador sigue siendo responsable de validar el tipo y longitud del campo.

Verificación ejecutada:

| Comando | Antes | Después |
| --- | --- | --- |
| `node --test tests/remediation-signals-1.test.mjs` | Primera prueba: 1 fallo, POST original devuelve 201 en vez de 400. Segundo ciclo: ficha sin cabecera devuelve 201. Tercer ciclo: GET devuelve una ficha antigua. | Las cinco pruebas específicas pasan. La ficha original y las variantes devuelven 400; ocho observaciones agregadas con empresas, cohortes o autores públicos se guardan y recargan; email/teléfono siguen rechazados; fichas antiguas quedan fuera de ambos GET y el DELETE por ID sigue disponible. |
| `node --test tests/remediation-signals-1.test.mjs tests/audience-insights.test.mjs tests/opportunity-analysis.test.mjs tests/community.test.mjs` | No se usó como señal roja; la reproducción específica se ejecutó primero. | 39 pruebas, 39 PASS, 0 FAIL; salida final `duration_ms 839.191576`. Incluye permisos, aislamiento, señales comunitarias y análisis de oportunidades con transporte simulado. |
| `node --check server/aggregate-privacy.mjs && node --check server/audience-insights.mjs && node --check tests/remediation-signals-1.test.mjs` | No aplica. | Salida 0. |

Límites reales:

- Es un detector de estructuras explícitas y contactos, no identificación universal de personas. Puede omitir nombres en prosa libre, identidades ofuscadas o formatos no contemplados. Un `Nombre:` ambiguo sin atributos personales se permite para preservar empresas y cohortes.
- El reconocimiento de teléfonos conserva la regla previa de secuencias de nueve o más dígitos; también puede rechazar cifras largas ambiguas dentro del texto. No se promete ausencia de falsos positivos.
- Los registros históricos detectados permanecen en SQLite y pueden borrarse por el DELETE existente si se conoce su ID. No se hizo una migración ni se reescribieron actividades históricas o artefactos derivados anteriores. El filtrado cubre las lecturas de señales y el corpus de insights.
- No se abrió navegador ni se probó un proveedor de IA real. Las verificaciones específicas recorren la API real usada por la UI; los tests cercanos del proveedor usan simulación. Sin claves reales, gasto, publicación o llamadas externas reales.
- Los informes adversariales originales permanecen intactos. No se ejecutó build/formato global, commit o push. El servidor HTTP propio se cierra y SQLite temporal se elimina al finalizar las pruebas.
