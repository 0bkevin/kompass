# Integraciones, credenciales, presupuestos y publicación opcional

**Resultado: FAIL.** 22 PASS, 1 FAIL y 4 BLOCKED. Un hallazgo confirmado P2; ningún P1 confirmado.

Revisión independiente del build existente el 18 de octubre de 2026 en `http://127.0.0.28:4118`. Cuenta ficticia `qa-providers@example.com`, marcas QA Providers A/B y base exclusiva `/tmp/30x-adversarial-providers`. No se leyeron informes de otros revisores ni se modificó implementación.

## Hallazgo confirmado

### providers-1 · P2 · Los conectores de publicación se configuran, pero no se pueden usar desde la interfaz

La promesa de Settings de publicar texto aprobado mediante Telegram/webhook debe ser accesible mediante una acción explícita con aprobación, separada de programar, o una explicación operable del uso de la integración.

El usuario puede guardar ambas conexiones pero la pieza approved/scheduled carece de acción Publicar. Planificar sólo cambia status/scheduledFor; el calendario remite a publicar manualmente desde canales. El endpoint de backend existe, pero ninguna alternativa UI lo expone o explica. No se validó entrega real.

Reproducción:

1. En Fuentes y equipo, configurar Telegram con un token/chat sintéticos de formato válido; configured=true.
2. En Publicación guardar endpoint HTTPS sintético y secreto; webhook.configured=true. Guardar sólo valida configuración.
3. Crear la pieza QA publicación sintética en canal Telegram y enviarla a revisión/aprobarla por UI.
4. Recargar Studio: sólo aparecen Exportar y Planificar publicación. Abrir Planificar y guardar una fecha futura.
5. La pieza queda Programado; sólo se ofrece Ver en la grilla. En Calendario no existe envío por Telegram/webhook ni instrucciones para usar esas integraciones. No enviar al endpoint por API.

El defecto es de accesibilidad funcional del flujo de publicación opcional; no se infiere ningún resultado de entrega real. El flujo manual exportación→publicación externa→registro de resultados sigue explicado.

Evidencia: [providers-configured-telegram](../evidence/providers-configured-telegram.png), [providers-configured-webhook](../evidence/providers-configured-webhook.png), [providers-approved-no-publish](../evidence/providers-approved-no-publish.png), [providers-schedule-dialog](../evidence/providers-schedule-dialog.png), [providers-scheduled-no-publish](../evidence/providers-scheduled-no-publish.png), [providers-calendar-manual](../evidence/providers-calendar-manual.png).

Apoyo de código: `src/features/Settings.tsx:975`, `src/features/Settings.tsx:1049`, `src/features/Studio.tsx:952`, `src/features/Studio.tsx:1005`, `src/features/Calendar.tsx:670`, `server/intelligence.mjs:2077`.

## Casos y comparación

### 1. PASS · Estado inicial sin credenciales

**Esperado:** Todos los proveedores ausentes deben indicarlo; no presentar conexión real.

**Observado:** UI muestra Sin configurar/Motor editorial local. GET social/settings: youtube/apify/gemini configured=false; integrations: ai/telegram/webhook=false.

Evidencia: `docs/adversarial/evidence/providers-initial.png`.

### 2. PASS · Fuente YouTube antes de conectar

**Esperado:** Guardar referencia de fuente pausada y explicar cómo habilitar el proveedor.

**Observado:** Desde Añadir fuente se crea QA YouTube sintético; aviso de credencial ausente y enabled=false en API. Activar queda deshabilitado al desconectar.

Evidencia: `GET /api/brands/:A/sources → fuente youtube enabled=false`.

### 3. PASS · YouTube guardar, reemplazar y desconectar

**Esperado:** Credencial sintética guardada debe activar sólo flag, vaciar el campo y persistir; quitarla debe volver a ausente.

**Observado:** UI guarda dos valores sintéticos secuenciales; configured=true y campo vacío tras guardar; recarga conserva estado. Desconectar devuelve configured=false. No se consultó YouTube.

Evidencia: `GET social/settings → youtube.configured true y después false`.

### 4. PASS · Apify guardar, desconectar y recuperar

**Esperado:** Guardar no debe iniciar un actor; desconectar debe impedir búsqueda; reconectar sólo restaura configuración.

**Observado:** UI guarda token sintético, presupuesto inicialmente0; desconexión hace fallar búsqueda UI con Apify no está configurado. Reconexión recupera flag sin ejecutar actor.

Evidencia: `docs/adversarial/evidence/providers-missing-provider.png`; `SQLite provider_spend: 0 filas antes de sondas de reserva`.

### 5. PASS · Gemini modelo inválido y corrección

**Esperado:** Modelo inválido debe producir error sin filtrar clave; modelo corregido debe conservar credencial vacía y permitir desconectar.

**Observado:** UI rechaza bad model whitespace con regla de caracteres. Corrección a modelo sintético válido devuelve configured=true/modelo actualizado; campo vacío. Desconectar vuelve false. No análisis audiovisual.

Evidencia: `HTTP400: gemini.model solo admite letras, números, punto, guion y guion bajo (máximo100).`.

### 6. PASS · IA guardar y volver al motor local

**Esperado:** Una credencial sintética sólo cambia configuración; usar motor local debe apagar el proveedor.

**Observado:** UI Guardar IA produce ai.configured=true/modelo; después Usar motor local devuelve false y no devuelve API key. No consulta de inferencia.

Evidencia: `GET integrations → ai.configured=true; después false`.

### 7. PASS · Telegram inválido, corregir, actualizar y desconectar

**Esperado:** Validar token/chat; no enviar mensajes al guardar; actualizar chat sin volver a mostrar token; desconectar revoca flag.

**Observado:** UI rechaza formato inválido; guarda formato sintético válido, actualiza chat con token vacío, desconecta y reconecta. Estado/configuración persisten al recargar. Nunca se invocó envío a Telegram.

Evidencia: `docs/adversarial/evidence/providers-configured-telegram.png`; `HTTP400: Introduce un token de bot y un chatId de Telegram válidos.`.

### 8. PASS · Webhook privado, corregir, actualizar y desconectar

**Esperado:** Bloquear URL privada; admitir configuración HTTPS pública sin enviar publicación; conservar secreto al actualizar URL.

**Observado:** UI bloquea https://127.0.0.1/private. Corregir a endpoint sintético de example.com permite guardar y actualizar con campo de secreto vacío. Desconectar vuelve false; reconfiguración final true. Sólo validación DNS al guardar, ningún POST al destino.

Evidencia: `docs/adversarial/evidence/providers-configured-webhook.png`; `HTTP400: No se permite acceder a direcciones privadas o reservadas.`.

### 9. PASS · Secretos en respuestas, errores y persistencia

**Esperado:** Claves API, bot token y secreto webhook no deben aparecer en estado ni en errores; formularios deben quedar vacíos.

**Observado:** GET state/social/settings/integrations devuelve flags/modelos/chat/url sin esos secretos. Tras recarga todos los campos password vacíos. Errores de Gemini/Telegram/URL no reproducen las claves. Valores de tabla secrets están en contenedores cifrados, sin cadena sintética en claro. El endpoint owner integrations entrega además su URL de inbox; no se copia a este informe.

Evidencia: `GET state: unexpectedSecretFields=[]`; `SQLite: todos los valores examinados sin texto de las claves sintéticas`.

### 10. PASS · Restricción al revisor

**Esperado:** Una cuenta con rol revisor debe ver configuración protegida y no poder cambiar credenciales.

**Observado:** Fixture temporal cambió sólo la membresía A de la propia cuenta a reviewer: UI deshabilita4 password inputs y explica propietario. PUT social/settings e integrations devuelve403 Solo el propietario puede realizar esta acción. Se restauró owner.

Evidencia: `UI disabled=true en4 campos password; ambas APIs403`.

### 11. PASS · Aislamiento de configuración entre2 marcas

**Esperado:** Conectar A no debe configurar B; sólo se comparte el gasto cuando explícitamente se usa la misma credencial.

**Observado:** B conserva ai/telegram/webhook/youtube/gemini=false y0 piezas. Apify se configuró explícitamente en B con la misma credencial sintética que A; las credenciales de los otros proveedores no se propagaron.

Evidencia: `GET state de B: piezas=[]; ai/telegram/webhook configured=false`.

### 12. PASS · Presupuesto sin proveedor

**Esperado:** Ausencia de token debe producir budget=null y una ruta de conexión sin prometer gasto.

**Observado:** UI explica Apify no está conectado y que guardar no inicia búsqueda. GET budget configured=false,budget=null.

Evidencia: `docs/adversarial/evidence/providers-initial.png`.

### 13. PASS · Presupuesto pausado en UI y búsqueda

**Esperado:** Con APIFY_DAILY_BUDGET_USD=0 debe impedir el actor antes de reservar y explicar recuperación de servidor.

**Observado:** Runtime propio reiniciado con0: UI Apify pausado y0/0diario; Buscar tendencias devuelve cobertura parcial con mensaje USD0 y nombres de variables a revisar. SQLite conserva0 reservas.

Evidencia: `docs/adversarial/evidence/providers-budget-paused.png`; `docs/adversarial/evidence/providers-paused-gate.png`.

### 14. PASS · Reserva concurrente por credencial — sonda local

**Esperado:** Tres procesos simultáneos con tope de2 deben admitir exactamente2 y rechazar el tercero sin exceder el ledger.

**Observado:** Sonda local importa el mismo módulo y base propia. Resultado2 éxitos de USD1,1 rechazo429 por2 ejecuciones pendientes; activeRuns=2, reserved=USD2. No transporte de proveedor ni datos remotos.

Evidencia: `/tmp/30x-adversarial-providers/budget-probe.mjs`; `/tmp/30x-adversarial-providers/budget-probe.json`.

### 15. PASS · Fallo conserva reserva y lease — sonda local

**Esperado:** Finalizar un intento fallido no debe devolver presupuesto ni liberar inmediatamente el slot incierto.

**Observado:** Tras finish de1 éxito y1 fallo, USD2 siguen reservados; activeRuns baja de2 a 1. Ledger del fallo released_at=NULL y state=failed. Sonda sin proveedor.

Evidencia: `/tmp/30x-adversarial-providers/budget-probe.json`.

### 16. PASS · Presupuesto diario agotado: UI y gate

**Esperado:** Agotar3USD debe impedir una cuarta reserva y la búsqueda, con causa visible.

**Observado:** Se crean3 reservas sintéticas sin ejecutar actor. UI3/3 y Buscar tendencias indica presupuesto diario USD3 compartido; sonda reserve devuelve402 y ledger no agrega otra fila.

Evidencia: `docs/adversarial/evidence/providers-budget-shared-a.png`; `docs/adversarial/evidence/providers-budget-exhausted.png`.

### 17. PASS · Tope mensual — sonda local

**Esperado:** Con diario9/mensual3 y3 consumidos debe bloquear por límite mensual.

**Observado:** createProviderBudget sobre la base propia con env inyectado rechaza402 por presupuesto mensual USD3; ninguna llamada de proveedor. No se afirma cobertura UI del mensaje mensual.

Evidencia: `/tmp/30x-adversarial-providers/budget-probe.json`.

### 18. PASS · Misma credencial compartida entre marcas: UI

**Esperado:** Dos marcas con el mismo token deben ver la misma reserva total, sin duplicar el presupuesto.

**Observado:** Sonda confirma igualdad de credencial sin imprimirla. Cambiar entre A yB y Actualizar límites muestra USD3/3 hoy yUSD3/30 mes en ambas.

Evidencia: `docs/adversarial/evidence/providers-budget-shared-a.png`; `docs/adversarial/evidence/providers-budget-shared-b.png`.

### 19. PASS · Recuperación al aumentar el límite

**Esperado:** Tras cambiar límite de3 a 4 se debe ver1 USD disponible y el módulo debe permitir una reserva adicional.

**Observado:** Reinicio propio con APIFY_DAILY_BUDGET_USD=4: UI3/4. La sonda local admite una cuarta reserva USD1 y queda4/4; sin ejecutar actor ni confirmar facturación.

Evidencia: `docs/adversarial/evidence/providers-budget-recovery.png`; `/tmp/30x-adversarial-providers/recovery-probe.json`.

### 20. PASS · Recuperación de período — reloj controlado

**Esperado:** Un período UTC nuevo debe limpiar contadores diarios/mensuales y leases caducados.

**Observado:** Mismo ledger, createProviderBudget con reloj 1 de noviembre de 2026 y sin mutar reloj servidor: reserved diario 0/mensual 0 y activeRuns 0. Límite3/30 restablecido. Es una sonda de módulo, no espera real.

Evidencia: `/tmp/30x-adversarial-providers/recovery-probe.json`.

### 21. PASS · Gates de publicación: comprobación API auxiliar

**Esperado:** El backend debe rechazar sin aprobación y después sin credencial sin cambiar la pieza ni enviar nada.

**Observado:** POST publish con borrador devuelve409 Aprueba la pieza antes de publicarla. Tras enviar/aprobar por UI, aún sin conectores devuelve409 Conecta Telegram… Puedes exportar…; status sigue approved. La UI carece de acción de publicación y se reporta aparte.

Evidencia: `POST /api/brands/:A/pieces/:piece/publish →409 en ambos estados`.

### 22. PASS · Programación permanece local

**Esperado:** Guardar calendario con conectores configurados debe programar sin publicar automáticamente.

**Observado:** UI Planificar publicación→Guardar en la grilla deja scheduled ypublicationReceipt ausente. Texto explica que calendario no publica automáticamente. No se invoca publish ni transporte.

Evidencia: `docs/adversarial/evidence/providers-schedule-dialog.png`; `docs/adversarial/evidence/providers-scheduled-no-publish.png`; `docs/adversarial/evidence/providers-calendar-manual.png`.

### 23. FAIL · Usar publicación opcional desde la interfaz

**Esperado:** Una pieza aprobada con Telegram/webhook configurados debe ofrecer una acción explícita para usar el conector, o explicar cómo hacerlo.

**Observado:** Settings promete publicar texto aprobado/enviar endpoint HTTPS. Con ambas flags true y pieza Telegram approved, Studio sólo Exportar/Planificar; tras programar sólo Ver en la grilla. Calendario propone publicar desde el canal y no ofrece el conector guardado ni una alternativa explicada para usarlo. Función inaccesible en UI.

Evidencia: `docs/adversarial/evidence/providers-configured-telegram.png`; `docs/adversarial/evidence/providers-configured-webhook.png`; `docs/adversarial/evidence/providers-approved-no-publish.png`; `docs/adversarial/evidence/providers-scheduled-no-publish.png`; `docs/adversarial/evidence/providers-calendar-manual.png`.

### 24. BLOCKED · YouTube real: acceso y cuota

**Esperado:** Verificar acceso autorizado y cuota con credencial real y datos oficiales.

**Observado:** No se suministraron credenciales reales; no se hizo consulta a YouTube. Guardar una cadena sintética no acredita acceso.

### 25. BLOCKED · Apify real: actores y facturación

**Esperado:** Verificar actor real, contenido obtenido y cargos/cuotas del operador.

**Observado:** No hay token real ni autorización de gasto. Todas las reservas fueron sondas locales; no se ejecutó un actor ni se verificó factura.

### 26. BLOCKED · IA/Gemini reales: aceptación de credenciales

**Esperado:** Verificar aceptación del proveedor y cuota/costos reales.

**Observado:** Sólo se auditó configuración con valores sintéticos. Sin claves reales, ninguna llamada a modelos. Exactitud semántica/audiovisual fuera de este alcance.

### 27. BLOCKED · Entrega real Telegram/webhook

**Esperado:** Verificar recepción/entrega confirmada en los destinos autorizados.

**Observado:** No hay bot/destino real autorizado; no se enviaron mensajes ni publicaciones. Los flags de configuración y gates no acreditan entrega.

## Método y límites

Las acciones de configuración, validación, corrección, desconexión, cambio de marca, búsqueda, revisión y planificación se ejercitaron con herramientas T3 sobre el tab propio 44. API/SQLite sólo apoyaron el estado y prepararon fixtures. En las sondas locales de presupuesto, tres procesos Node independientes llamaron el mismo módulo a la vez; no se inyectó ni llamó transporte de proveedor.

Runtimes propios: inicial PID 3910756/sesión 42121; pausa PID 3919499/sesión 64710; vuelta a 3 USD PID 3920475/sesión 25446; límite 4 USD PID 3922002/sesión 91060. `DISCOVERY_ENABLED=false` y las4 variables de claves fueron eliminadas del entorno en cada inicio. Sólo estos runtimes se terminaron.

- Compilación existente; no build/format, cambios de implementación, claves reales, gastos, publicación externa ni lectura de datos de otro entorno.
- Las cuentas/marcas/fuentes/pieza y credenciales son sintéticas; las sondas de presupuesto invocan el módulo real contra SQLite propio sin transporte. No son pruebas de integración o factura.
- Casos mensuales, concurrencia ypaso de período están comprobados en el módulo de presupuesto; UI comprobada para vacío, pausa, agotamiento diario, reserva compartida yrecuperación al subir límite.
- POST publish se usó sólo para gates en estados sin aprobación/sin credencial. No se ejecutó éxito de publicación ni transporte sintético de entrega.
- Aislamiento se comprobó entre2 marcas de una cuenta propia; la verificación general de autenticación/cuentas está fuera de este alcance.
- No se evaluó calidad de análisis semántico/audiovisual; los otros revisores cubren esas ramas.
- Datos de reproducción conservados en /tmp/30x-adversarial-providers; runtime final PID 3922002 cerrado ytab 44 cerrado al terminar. No se guardan tokens/cookies/contraseñas en este informe.

Las respuestas mínimas y las sondas sin secretos están detalladas en `providers.json`. Las capturas relevantes se conservaron en `../evidence/providers-*.png`.
