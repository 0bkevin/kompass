# Texto estructurado administrado con Codex

Este módulo usa el ejecutable normal de Codex y la sesión de ChatGPT del operador. No necesita claves de los clientes, no extrae tokens ni convierte créditos de ChatGPT en saldo de API. La autenticación real de producción queda a cargo del operador; estas pruebas no inician sesión ni consumen cuota.

La documentación oficial describe `codex login status`, el almacenamiento normal de la sesión y las diferencias con la facturación por API. También documenta `codex exec`, el uso de autenticación guardada y `--output-schema` para respuestas estructuradas. OpenAI recomienda claves para la automatización general y restringe la exposición de ejecución de Codex en entornos públicos o no confiables: este worker no debe exponerse como una ruta de ejecución arbitraria. La habilitación de un uso centralizado debe revisarse con las condiciones y controles de la cuenta del operador; esta implementación no constituye esa aprobación. [Autenticación](https://learn.chatgpt.com/docs/auth), [modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode).

## API y activación

`server/managed-text.mjs` exporta:

```js
generateManagedText({ name, schema, instructions, input, signal? })
managedTextStatus()     // Promise<{enabled, ready, provider, inFlight, pending, limits, code?, reason?}>
managedTextReadiness()  // mismo contrato; comprueba login, no inferencia
stopManagedText()      // aborta trabajo en curso y rechaza pendientes
createManagedTextService({ environment?, transport?, readiness?, maxPending?, timeoutMs?, queueTimeoutMs? })
MANAGED_TEXT_LIMITS
```

La función devuelve directamente el objeto definido por el esquema del invocante. Devuelve `null` solamente si `PLATFORM_TEXT_PROVIDER` no es exactamente `codex-chatgpt`. Habilitada, rechaza con `code`, `status` y un mensaje fijo si falla: autenticación, aislamiento, cuota, tiempo, cola o formato. Nunca devuelve texto inventado ni diagnósticos del proceso como resultado.

Mantener la variable sin configurar hasta completar el login real y revisar el estado del servicio. El módulo no cambia ninguna variable ni inicia login. `ready: true` prueba acceso al CLI, login mediante ChatGPT y ejecución aislada de `login status`; no verifica cuota, disponibilidad del modelo o calidad. No contiene claves ni identidad de la cuenta.

El servicio debe correr como su usuario dedicado, con su `HOME` real, por ejemplo `/var/lib/30x-radar`, y su `.codex` normal. `CODEX_HOME`, si el operador lo define, selecciona el almacenamiento normal de ese mismo servicio. No copiar autenticación de Ubuntu u otros checkouts. `RADAR_CODEX_BINARY` es una opción exclusiva del operador. No se admiten rutas, entorno, modelo, comandos ni opciones de transporte del cliente en la solicitud.

## Puntos exactos para integrar en root

1. **`server/connectors.mjs`, `generateStructured`:** importar `generateManagedText`. Resolver primero si la empresa hereda el servicio administrado o eligió explícitamente su proveedor. Solamente para la opción administrada y con `PLATFORM_TEXT_PROVIDER=codex-chatgpt`, invocar este módulo antes del retorno temprano por ausencia de clave. Conservar `{name, schema, instructions, input}` y pasar la señal de cancelación si existe. Esta ruta admite solamente texto: no pasar `image`, URLs audiovisuales o resultados del conector oficial de YouTube.
2. **`server/integration-config.mjs` y `server/db.mjs`, resolver/publicIntegrations:** root puede representar el proveedor administrado sin exigir `apiKey`, consultando `managedTextStatus`. No usar el nombre, clave o baseURL del proveedor por empresa para configurar el CLI. La selección de una empresa no altera el servicio central ni otras empresas. Un proveedor propio continúa su ruta existente.
3. **Fallback y fallos:** proveedor desactivado permite conservar el flujo local identificado como preliminar. Si está activado, propagar el error o presentar ese flujo local con su aviso explícito. Ante cuota o sesión vencida, no seleccionar otro proveedor automáticamente, no activar facturación por API y no presentar el fallback como análisis de ChatGPT.
4. **Apagado del servidor:** llamar a `stopManagedText()` junto al cierre del worker visual. El servicio tiene una única cola por proceso. No crear una instancia por petición o empresa.
5. **Revisión de proveedor y datos:** mantener los controles vigentes sobre material público, consentimiento y finalidad; el flag no modifica `SOURCE_ACCESS_POLICY_FILE` ni autoriza redes bloqueadas. El CLI no navega: discovery continúa exclusivamente por fuentes permitidas. Citas y afirmaciones necesitan la verificación del módulo editorial invocante.

Estos puntos se documentan para integración: no se han editado esos archivos ni el router principal, UI, resolvers o políticas.

## Límites y aislamiento

Una ejecución, cuatro solicitudes pendientes, espera máxima en cola de 15 segundos y ejecución máxima de 60 segundos, incluyendo el chequeo de login. Sin reintentos del módulo ni del transporte OpenAI configurado en el CLI. La cola conserva su exclusión hasta que el transporte termina tras un aborto; no libera un segundo trabajo mientras el anterior sigue activo.

Límites en bytes UTF-8: entrada 60.000, instrucciones 12.000, esquema 32.000, respuesta JSON 256.000 y stdout/stderr combinados 1.024.000. No se trunca la entrada. Son límites de trabajos, tiempo y volumen; no equivalen a un precio ni garantizan un número concreto de créditos o tokens. No hay presupuestos monetarios simulados ni reintentos automáticos. Varias réplicas necesitan coordinación compartida antes de habilitarlas.

El subconjunto de JSON Schema acepta objetos con `additionalProperties: false`, `properties` y `required`; arrays con `items`, `minItems/maxItems`; strings con `minLength/maxLength`; números e integers con `minimum/maximum`; boolean, null y enums escalares. Acepta `description`, `title` y `$schema` como anotaciones. Rechaza referencias, composiciones, formatos, patrones y palabras clave desconocidas; no descarga esquemas. Profundidad máxima 16, máximo 512 nodos. Las formas actuales de los borradores editoriales encajan en este subconjunto. La validación local comprueba campos, tipos, enums y límites; no verifica hechos o citas.

`scripts/text-worker.mjs` reutiliza `createMediaSandbox` y `runBoundedProcess` de `scripts/media*.mjs`. El directorio temporal es privado por trabajo, el esquema se escribe con permisos 0600 y se elimina todo al terminar. La entrada viaja por stdin. El montaje de autenticación normal es de sólo lectura y el JavaScript no lee su contenido. El aislamiento no ve SQLite, archivos de empresas, configuración del operador o del host, ni sesiones previas. No hereda API keys, credenciales de workload identity, tokens de acceso, cookies, apps o variables T3. La renovación que necesite escribir la sesión puede fallar; el operador deberá resolverla mediante el CLI normal fuera del worker.

Se ignoran configuración de usuario y reglas, y se desactivan shell, modo de código, apps, plugins, hooks, agentes, imágenes, navegador, búsqueda y memoria. Se rechaza una salida que registre ejecución de herramientas o no finalice correctamente. La red queda disponible para el transporte autenticado normal del CLI; el aislamiento reutilizado no es un proxy de destinos. No promete búsqueda general, conectores sociales o datos en tiempo real.

Se rechazan formas habituales de credenciales y etiquetas explícitas de confidencialidad; esto no es un detector exhaustivo de información personal o confidencial. El invocante debe seleccionar material público y no personal antes de llamar. Los errores y estados no incluyen entrada, valores JSON rechazados, rutas privadas ni stdout/stderr. No hay caché de respuestas entre empresas.

## Verificación aislada

```bash
node --test tests/text-worker.test.mjs tests/managed-text.test.mjs
```

Transporte y login simulados, sin autenticación real ni solicitud a modelos. Se comprueban forma del esquema, secretos fuera del entorno hijo, fallos sin reflejar valores confidenciales, autenticación por ChatGPT frente a API key, herramientas desactivadas, ausencia de reintentos, cola acotada, serialización, límites, interrupción y apagado. Los límites y abortos también usan subprocesos reales de Node con el transporte compartido, sin ejecutar Codex ni acceder a la cuenta del operador.

Validación conjunta con `tests/media-sandbox.test.mjs` y `tests/media-generation.test.mjs`: **39 pruebas pasaron, 0 fallaron, 0 omitidas**. La autenticación y generación de texto reales de producción siguen pendientes del operador.
