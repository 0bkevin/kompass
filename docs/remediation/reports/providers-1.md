# providers-1 · Flujo explícito de envío mediante conectores

**Corregido; pendiente de la comprobación integrada del coordinador.** Una pieza aprobada o programada ofrece **Enviar ahora** en Studio. El diálogo explica el destino, muestra el mensaje exacto de Telegram y exige una confirmación concreta. El calendario sigue sin enviar automáticamente.

## Causa y cambios

Existían Settings, `publishPiece` y su endpoint, pero faltaban el punto de entrada y los estados de publicación en la interfaz. El diario de envío tampoco estaba disponible para que la UI evitara reintentos tras una respuesta incierta.

`PublishPiece.tsx` completa la acción, confirmación, progreso, errores, consulta y recibo. Los cambios locales sin guardar o una versión distinta bloquean el envío. Un rechazo explícito permite un reintento confirmado por el operador. `sending` y `uncertain` sólo permiten consultar el estado; recargar no habilita otro envío. Si el navegador pierde la respuesta de un envío ya aceptado, un GET recupera el recibo sin repetir el POST.

El nuevo GET `/api/brands/:brandId/pieces/:id/publish` expone una proyección segura del diario y destino, la versión vigente y una huella opaca del conector. Oculta parámetros de URL en la proyección del destino. POST conserva `requireEditor` y ahora requiere `expectedApprovalVersion` y `expectedDestinationKey`. La confirmación queda invalidada si cambia la versión aprobada, el destino o su configuración. `publishPiece` conserva su firma interna, locks, idempotencia y journal; `assertPieceMutable` no se modificó.

Se reprodujeron y corrigieron dos defectos de integración al completar los reintentos: un webhook con HTTP500/408 podía quedar como `failed`, y una respuesta Telegram sin identificador de mensaje podía marcar la pieza como enviada. Ambos casos quedan ahora `uncertain`, sin nuevo envío automático ni posibilidad de duplicarlo por esta acción.

Studio, Home, Calendario, Resultados y el CSV usan **Aceptado por webhook** para esos recibos. El contador agregado dice **envíos registrados**. Un HTTP2xx acredita la aceptación del endpoint; la interfaz pide comprobar la publicación final en el servicio del operador. No se alteran status persistidos, elegibilidad ni métricas.

## Verificación

- Rojo original en navegador: pieza Telegram aprobada, ambos conectores configurados, sólo Exportar y Planificar. La misma comprobación quedó verde con Enviar ahora habilitado, también después de programar por UI.
- Rojo previo a implementación: `node --test tests/remediation-providers-1.test.mjs` devolvía ocho fallos por GET404. Las sondas de HTTP500 y Telegram sin recibo también se ejecutaron en rojo antes de corregirse.
- Verde final: `node --test tests/remediation-providers-1.test.mjs tests/intelligence.test.mjs tests/core.test.mjs` → **45 PASS, 0 fallos**, incluidas diez pruebas específicas con SQLite temporal. Cubren autenticación, aislamiento, roles, aprobación vigente, cambio/desconexión del destino entre confirmación y POST, rechazo/reintento explícito, idempotencia, concurrencia, HTTP500/408, incertidumbre y edición/eliminación bloqueadas.
- `./node_modules/.bin/tsc --noEmit --pretty false` → sin diagnósticos.
- T3 preview, pestaña propia en `http://127.0.1.29:5519`: confirmación desktop1280×800 y viewport móvil390×844; sin desbordamiento; Tab atrapado, Escape cancela y devuelve foco; durante envío los controles de confirmación/cancelación se bloquean. Cambiar caption local bloquea el envío y revertirlo lo habilita.
- Transporte aislado y **SIMULADO**: Telegram pendiente→recibo; webhook403→reintento explícito→aceptación202; fallo incierto→recarga/consulta sin reenvío; pérdida de respuesta del navegador tras aceptación→recibo recuperado por GET. El registro contiene exactamente cinco solicitudes simuladas, ninguna externa.
- Etiquetas de aceptación verificadas en Home, selector de Resultados, evento/agenda de Calendario y CSV exportado por UI. Sólo al fixture ficticio del webhook se le añadió una fecha de planificación para esta comprobación de etiquetas.

La evidencia está en [providers-1](../evidence/providers-1/), con capturas, [comprobaciones de navegador](../evidence/providers-1/browser-checks.json), [salida de tests](../evidence/providers-1/tests-final.txt) y el [runtime aislado de simulación](../evidence/providers-1/simulated-runtime.mjs). Ningún artefacto contiene credenciales reales, cookies o tokens de sesión.

## Contrato y límites

Los clientes HTTP que antes enviaban `body:{}` a POST deben obtener primero versión/huella por GET; de lo contrario reciben409. Las llamadas internas y los tests existentes de `publishPiece` siguen funcionando. El GET no envía ni muta registros.

No se verificaron entrega real de Telegram, publicación final del webhook ni cobertura de redes. Las cuentas, destinos, credenciales, datos y recibos son ficticios. Telegram mantiene el envío de texto de hasta4096 caracteres: el diálogo muestra exactamente el recorte y lo explica; no envía adjuntos. Un envío incierto requiere comprobar el destino y no se desbloquea automáticamente.

No se ejecutaron build global, detector, dependencias, commits ni subagentes. La pestaña propia y los procesos de4519/5519 están cerrados. La base QA exclusiva permanece en `/tmp/30x-remediation-providers-1`; no se usaron datos principales.
