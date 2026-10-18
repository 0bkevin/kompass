# Revisión adversarial interactiva

Cada funcionalidad recibe un agente nuevo y un informe independiente. Se revisa la versión compilada existente: no modificar código, estilos, base de otro agente, credenciales reales ni la aplicación anterior. No leer los informes de otros revisores antes de entregar el propio.

## Contrato común

Aplicación en `/home/ubuntu/.t3/projects/30x-trackt-2`. Leer PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md como requisitos. README y docs/IMPLEMENTATION.md aclaran límites, pero no son prueba de que una función sea correcta. Revisar código sólo como apoyo y para localizar causas; es obligatorio probar interactivamente en navegador el comportamiento asignado.

Cada agente recibe un slug, puerto y host de loopback exclusivos. Arrancar el build existente con una base temporal propia:

```bash
env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN \
  DATA_DIR=/tmp/30x-adversarial-SLUG PORT=PUERTO DISCOVERY_ENABLED=false \
  node server/start-host.mjs
```

No ejecutar build ni format durante la revisión. No usar `.env` ni claves reales. No utilizar puertos 3001, 3025, 3026, 5173–5175. Registrar sesión/PID propio y terminar sólo ese proceso cuando acabe la revisión, conservando sus datos para reproducción.

## Navegador

Usar herramientas nativas T3 `preview_*`: `preview_status` primero y después `preview_open({reuseExistingTab:false,profileId:'incognito',url:URL_ASIGNADA,open:false})`. Cada agente usa su propio tabId en TODAS las llamadas. No operar ni cerrar pestañas de otros agentes o del usuario. No cambiar de host a localhost: los hosts exclusivos aíslan las cookies aun dentro del perfil compartido. Si se necesitan dos usuarios, cerrar sesión y volver a entrar secuencialmente en el mismo host.

Usar snapshot antes de interactuar, con locators visibles; comprobar estado después de la acción, no sólo el mensaje de éxito. Recargar para comprobar persistencia y consultar API/SQLite de la propia base cuando sea útil. Las fixtures se pueden preparar por API o SQLite exclusivamente en la base propia, identificándolas como sintéticas; la acción revisada debe probarse mediante la UI. Puede usarse `/api/auth/demo` para fixtures ilustrativas, pero no para demostrar exactitud con datos reales.

Guardar al menos una captura del comportamiento observado (`preview_snapshot` con `save:true`) y evidencias adicionales para fallos. Copiar sólo capturas relevantes a `docs/adversarial/evidence/SLUG-*.png`. No copiar tokens, cookies o contraseñas a los informes. Usar cuentas ficticias `qa-SLUG@example.com`. Al terminar, cerrar la propia pestaña con `t3_preview_close({tabId})` para liberar capacidad global; nunca cerrar otra pestaña.

## Pruebas

- Expresar el resultado esperado antes de compararlo con lo observado.
- Probar el camino normal y casos adversariales pertinentes: vacío/inválido, repetición/corrección, recarga, restricciones/ausencia de proveedor, cambio de contexto o conflicto cuando corresponda.
- Verificar exactitud de datos, no sólo ausencia de errores: audiencia seleccionada, fuente, canal, formato, cifras, versión aprobada y procedencia.
- Distinguir PASS, FAIL y BLOCKED. Una dependencia ausente o una limitación documentada no es una prueba aprobada del resultado de esa dependencia. No presentar mocks como integración real.
- Sólo fuentes públicas; no eludir login, pagar, gastar créditos ni enviar publicaciones/mensajes a terceros. Publicación e IA opcional sin credenciales: comprobar gates y recuperación; anotar falta de prueba real.
- No instalar habilidades ni delegar nuevos agentes. No corregir errores: esta entrega es una auditoría independiente.

## Informe

Escribir `docs/adversarial/reports/SLUG.md` y `SLUG.json`. JSON:

```json
{
  "feature": "Nombre",
  "slug": "SLUG",
  "url": "URL_ASIGNADA",
  "status": "PASS | FAIL | PARTIAL | BLOCKED",
  "cases": [{"name":"Caso", "expected":"...", "actual":"...", "verdict":"PASS | FAIL | BLOCKED", "evidence":["ruta o respuesta"]}],
  "findings": [{"id":"SLUG-1", "severity":"P1 | P2 | P3", "title":"...", "steps":["..."], "expected":"...", "actual":"...", "evidence":["..."], "source":["archivo:línea"]}],
  "limitations": ["..."],
  "artifacts": ["..."]
}
```

P1: seguridad/aislamiento, pérdida de datos o resultado central incorrecto que bloquea el flujo. P2: fallo funcional o resultado incorrecto parcial. P3: fricción de UX/accesibilidad sin pérdida central. No inventar gravedad ni hallazgos por cubrir una cuota. Los defectos estáticos no reproducidos se distinguen de fallos observados. Informe final breve con conteos, hallazgos confirmados y rutas; no afirmar cobertura universal.
