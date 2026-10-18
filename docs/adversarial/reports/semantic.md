# Auditoría independiente: análisis semántico de oportunidades

Resultado **PARTIAL**. 21 casos PASS, 0 FAIL y 1 BLOCKED. **0 hallazgos confirmados** (P1=0, P2=0, P3=0). La falta de una prueba de IA real impide aprobar la capacidad completa.

## Entorno y alcance

- Fecha: 2026-10-18 UTC; pruebas aproximadamente 02:04–02:10.
- Aplicación compilada existente: `http://127.0.0.20:4110`. HEAD observado: `2549e0bbf5b5858eb79bf069d847daee269ad344e`.
- Base exclusiva: `/tmp/30x-adversarial-semantic/radar.sqlite`. Cuenta ficticia `qa-semantic@example.com`; marca sintética `6392949b-efea-4c72-a348-2eaf4880b8e6`.
- Oportunidad `opportunity-1a027b2e28db490fefdbc5a0`, segmento `sem-segment`, referencia `c69ab6ce-2176-4112-8657-9f3bc57107f5`. Contenido marcado como demostración.
- Navegador T3 propio `tab_3v_07e54779-9ab2-4979-8a15-674c4eff160a`, perfil incognito, 1280×800. Se usaron snapshots antes de actuar, controles visibles, recarga y apoyo API/SQLite.
- Primer servidor normal: PID 3861126, sesión 37949. Después se reemplazó por runtime sintético exclusivo: PID 3863722, sesión 15355. Variables de claves reales eliminadas, `DISCOVERY_ENABLED=false`.
- **Cierre comprobado:** pestaña propia cerrada por `t3_preview_close`; ambos procesos propios terminaron con exit 0; puerto 4110 libre (`fuser` exit 1). Datos temporales conservados.

## Separación entre prueba real y simulada

El gate sin credenciales se verificó con el servidor normal. Para cubrir aceptación/rechazo y concurrencia sin gastos se arrancó el mismo host de producción y se sustituyó **en memoria** el `fetcher` del router devuelto por `createOpportunityAnalysisRouter` por una función propia que devuelve `Response` locales. El código de validación, permisos, fingerprint y persistencia del servidor, el build de interfaz y SQLite permanecieron intactos. El runtime impide otros destinos de proveedor. No se envió ninguna solicitud de IA real.

La captura de éxito incluye expresamente «Hipótesis sintética del proveedor controlado» y un límite de respuesta sintética. Demuestra comportamiento de UI, validación y guardado ante esa respuesta controlada; **no** demuestra exactitud, disponibilidad ni calidad de IA real. No se usaron credenciales reales ni unit tests como prueba funcional.

## Casos: esperado antes de observado

### 1. Sin proveedor: gate visible y ausencia de análisis inventado — PASS

**Esperado:** Mostrar lectura local, deshabilitar Analizar con IA y ofrecer configuración; no guardar un análisis semántico.

**Observado:** En UI: Analizar con IA deshabilitado, texto de reglas de texto y Configurar IA. POST adicional devolvió 409 y los insights carecían de analysis.

Evidencia: `docs/adversarial/evidence/semantic-provider-gate.png`.

### 2. Recuperación: configuración desde la oportunidad — PASS

**Esperado:** Configurar IA debe llevar a un formulario utilizable; guardar configuración no debe presentarse como validación real del proveedor.

**Observado:** El botón abrió /settings. Se guardaron por UI un marcador sintético y el modelo qa-synthetic-model; integrations.ai.configured pasó a true. El transporte ya estaba sustituido por un proveedor local antes de configurar.

Evidencia: `docs/adversarial/evidence/semantic-runtime.mjs`, `docs/adversarial/evidence/semantic-synthetic-success.png`.

### 3. Camino UI exitoso con proveedor SINTÉTICO: necesidad y segmento — PASS

**Esperado:** Una respuesta estructurada válida debe aparecer en el detalle con su necesidad; los segmentIds deben pertenecer a la audiencia y alimentar la selección.

**Observado:** Analizar con IA mostró la necesidad Mantener continuidad de las conversaciones comerciales al cambiar el responsable y rationale. API/SQLite guardaron segmentIds=[sem-segment], perteneciente a la marca; ¿Para quién? seleccionó Equipos de educación. No demuestra calidad semántica de IA real.

Evidencia: `docs/adversarial/evidence/semantic-synthetic-success.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 4. Cita literal propia y límites visibles con proveedor SINTÉTICO — PASS

**Esperado:** Mostrar soporte presente en title/text de una referencia suministrada, con procedencia, modelo y límites explícitos.

**Observado:** Ver citas y límites mostró literalmente Registrar cada conversación permite retomar el contacto al cambiar de responsable., atribuida a Memoria compartida del pipeline (fixture sintética). El id corresponde a la referencia suministrada. Incluye límites de hipótesis editorial, material de demostración y respuesta sintética, más qa-synthetic-model.

Evidencia: `docs/adversarial/evidence/semantic-synthetic-success.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 5. Persistencia tras recarga — PASS

**Esperado:** Recargar debe conservar el análisis vigente y no disparar automáticamente una consulta de proveedor.

**Observado:** Se recargó /opportunities y se abrió Entender y crear: el análisis persistía con id 67f19052-9e29-49c2-bdde-856bb76c76e7 y selección sem-segment; el log no añadió una consulta por la lectura.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 6. Cita inventada — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Rechazar una cita cuyo texto no esté en la referencia y conservar el análisis válido.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: Una cita de la IA no aparece en el material suministrado. No se guardó el análisis. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`, `docs/adversarial/evidence/semantic-invalid-citation.png`.

### 7. Segmento ajeno — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Rechazar un segmentId fuera de audience y conservar el análisis válido.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: La IA citó un segmento que no pertenece a esta empresa. No se guardó el análisis. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 8. Referencia ajena — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Rechazar un referenceId fuera de las referencias suministradas y conservar el análisis válido.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: La IA citó una referencia ajena, excluida o repetida. No se guardó el análisis. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 9. Necesidad vacía — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Rechazar need vacío; no fabricar un texto de respaldo.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: La IA devolvió texto inválido o instrucciones ajenas al análisis. No se guardó el resultado; vuelve a intentarlo. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 10. Esquema con campo inesperado — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Rechazar una respuesta con campos fuera del esquema.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: La IA devolvió campos o tipos inesperados. No se guardó el análisis. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 11. JSON malformado — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Mostrar fallo recuperable sin guardar el resultado inválido.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: No se pudo completar el análisis con IA. Revisa la clave, el modelo y la cuota en Integraciones y vuelve a intentarlo; no se guardó ningún resultado. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 12. Proveedor HTTP 429 sintético — acción UI y respuesta SINTÉTICA — PASS

**Esperado:** Mostrar fallo recuperable de cuota/proveedor sin reemplazar el análisis válido.

**Observado:** Al pulsar Actualizar análisis con IA, la UI mostró: No se pudo completar el análisis con IA. Revisa la clave, el modelo y la cuota en Integraciones y vuelve a intentarlo; no se guardó ningún resultado. El id y analyzedAt siguieron siendo 67f19052-9e29-49c2-bdde-856bb76c76e7 / 2026-10-18T02:06:49.625Z.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 13. Reintento válido y actualización sin duplicar — PASS

**Esperado:** Después de errores debe poder reintentarse; actualizar debe reemplazar el análisis de la oportunidad, sin duplicados.

**Observado:** Se restauró mode=valid y Actualizar análisis con IA volvió a guardar. Se conservó el mismo id con analyzedAt nuevo. La inspección final de SQLite contó exactamente 1 registro opportunityAnalyses.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 14. Invalidación por cambios de referencia — PASS

**Esperado:** Una cita/análisis anterior debe dejar de ofrecerse como vigente cuando cambia el texto de su referencia.

**Observado:** Se cambió text por API en la BD propia y se pulsó Actualizar en la UI: desapareció la lectura contextual y analysis fue omitido por insights. Una nueva solicitud aceptada usó el texto Cada traspaso debe conservar el acuerdo siguiente y la fecha comprometida. La comprobación final repitió la invalidación y mostró de nuevo la lectura local.

Evidencia: `docs/adversarial/evidence/semantic-provider-gate.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 15. Concurrencia: segundo análisis de la misma empresa — PASS

**Esperado:** Mientras el análisis iniciado por UI está pendiente, una segunda petición debe rechazarse sin segunda consulta al proveedor.

**Observado:** Con retraso sintético de 6 s, se inició Actualizar análisis con IA desde UI. Una segunda petición adicional devolvió 409: Ya hay un análisis con IA en curso para esta empresa. Espera a que termine antes de iniciar otro.

Evidencia: `docs/adversarial/evidence/semantic-context-changed.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 16. Audiencia cambia durante la consulta — PASS

**Esperado:** El resultado en vuelo debe rechazarse si la audiencia cambia; no guardar una respuesta desactualizada.

**Observado:** Durante el análisis UI retrasado se añadió Cambio concurrente sintético a needs mediante API propia. La UI mostró El contexto, la audiencia, las referencias o la integración cambiaron durante el análisis. Actualiza y vuelve a analizar; no se guardó una respuesta desactualizada. Insights omitió analysis para el nuevo contexto.

Evidencia: `docs/adversarial/evidence/semantic-context-changed.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 17. Permisos de revisor — PASS

**Esperado:** El revisor debe poder leer un análisis vigente, pero carecer de acción para iniciar/actualizarlo.

**Observado:** Fixture de membership=reviewer, recarga y detalle UI: se pudo leer el análisis con sus citas, sin botones de análisis/configuración. Una petición adicional devolvió 403 Necesitas permisos de edición.

Evidencia: `docs/adversarial/evidence/semantic-reviewer.png`.

### 18. Revocación de edición en vuelo — PASS

**Esperado:** La autorización debe verificarse otra vez antes de guardar una consulta ya iniciada.

**Observado:** Se inició una consulta por UI con retraso de 6 s y se cambió el membership propio a reviewer en SQLite. La UI mostró Ya no tienes permisos de edición. No se guardó el análisis. El resultado en vuelo no reemplazó el válido.

Evidencia: `docs/adversarial/evidence/semantic-permission-changed.png`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 19. Editor puede analizar — PASS

**Esperado:** Un editor autorizado debe poder solicitar el análisis opcional configurado.

**Observado:** Con membership=editor, recarga y Actualizar análisis con IA, la UI completó el camino sintético y se guardó analyzedAt=2026-10-18T02:09:11.980Z. Se restauró owner al terminar.

Evidencia: `docs/adversarial/evidence/semantic-provider-log.jsonl`.

### 20. Regreso al motor local — PASS

**Esperado:** Usar motor local debe deshabilitar nuevas consultas y conservar una recuperación visible.

**Observado:** Se pulsó Usar motor local en settings. ai.configured pasó a false; la UI deshabilitó la acción IA y ofreció Configurar IA. Tras invalidar el texto de referencia, el panel volvió a mostrar reglas de texto sin análisis inventado.

Evidencia: `docs/adversarial/evidence/semantic-provider-gate.png`.

### 21. Apoyo API: sesión y payload — PASS

**Esperado:** La API debe exigir sesión y evitar aceptar campos de análisis enviados por el cliente.

**Observado:** Sin cookies, POST devolvió 401 Inicia sesión para continuar. Con sesión y body no vacío devolvió 400 Envía un objeto vacío para solicitar el análisis de la oportunidad actual. Son comprobaciones API complementarias, no sustituyen los casos UI.

Evidencia: `Respuesta T3 preview_evaluate de 2026-10-18; valores resumidos en este caso`.

### 22. Exactitud e integración de IA REAL — BLOCKED

**Esperado:** Probar con un proveedor real autorizado que su análisis conecta correctamente la necesidad con evidencia, sin pagar ni usar credenciales no autorizadas.

**Observado:** No hay credenciales reales ni autorización de gasto. Todas las respuestas exitosas/adversariales posteriores al gate provinieron de un fetcher local controlado; no se probó exactitud ni disponibilidad de un modelo real.

Evidencia: `docs/adversarial/evidence/semantic-runtime.mjs`, `docs/adversarial/evidence/semantic-provider-log.jsonl`.

## Hallazgos

Ningún defecto confirmado en los casos ejecutados. Esto no equivale a cobertura universal ni a una aprobación de IA real. Los errores sintéticos de proveedor fueron casos adversariales esperados y correctamente contenidos.

## Límites

- IA real, autenticación/cuota real y calidad semántica del modelo: BLOCKED. Ningún mock se considera integración real.
- El proveedor sintético sustituye exclusivamente el fetcher del router de análisis en memoria. No valida DNS, TLS, HTTP remoto, el contrato real del proveedor ni sus costos. El formulario sí guardó una configuración sintética a través de la UI.
- Las fixtures de marca, necesidad, referencia y cambios de rol son propias y sintéticas. Los cambios de datos/permisos se prepararon por API/SQLite; las acciones de análisis y la observación del resultado se hicieron por UI T3.
- No se probó en esta revisión aislamiento entre dos empresas/cuentas, exclusión YouTube, las cotas de 8 referencias/señales, todas las mutaciones posibles del fingerprint, todos los tipos malformados ni todas las formas de inyección. No se auditó el motor general de oportunidades.
- No se ejecutaron ni se usaron unit tests como sustituto de la UI. No se modificó implementación, no se recompiló y no se leyeron informes de otros agentes.
- La UI que ya está abierta puede conservar el análisis previo hasta Actualizar después de una edición externa; se comprobó que insights omite el análisis obsoleto y que la UI actualizada lo retira. El mensaje de conflicto indica expresamente actualizar.

## Evidencias y reproducción

Capturas T3: `semantic-provider-gate.png`, `semantic-synthetic-success.png`, `semantic-invalid-citation.png`, `semantic-context-changed.png`, `semantic-permission-changed.png` y `semantic-reviewer.png`, todas bajo `docs/adversarial/evidence/`.

`semantic-provider-log.jsonl` conserva exclusivamente entradas sintéticas saneadas y el modo de transporte usado; no contiene cabeceras de autorización, cookies ni claves. `semantic-runtime.mjs` conserva la inyección propia para reproducir los modos `valid`, `bad-quote`, `bad-segment`, `foreign-reference`, `empty-need`, `extra-field`, `malformed` y `provider-error`; `control.json` en DATA_DIR selecciona el modo y `delayMs` (6000 para concurrencia). Las solicitudes directas que ayudaron a preparar/verificar datos se distinguen de los disparos UI.

La BD queda con rol owner, IA deshabilitada, un solo análisis histórico y una referencia cambiada que invalida ese análisis. Al arrancar se debe observar el gate local. Para repetir éxito, arrancar el runtime y configurar en UI exclusivamente un marcador sintético y el modelo `qa-synthetic-model`; el transporte local intercepta el endpoint antes de cualquier solicitud de IA. No usar el runtime para una integración real.

```bash
env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN \
  DATA_DIR=/tmp/30x-adversarial-semantic PORT=4110 HOST=127.0.0.20 \
  DISCOVERY_ENABLED=false node docs/adversarial/evidence/semantic-runtime.mjs
```

Requisitos leídos: `PRODUCT.md`, `docs/TRANSCRIPT-TO-PRODUCT.md`, `docs/adversarial/BRIEF.md`; código de apoyo: `src/features/Journey.tsx` (panel y acciones), `server/opportunity-analysis.mjs` (validación y autorización), `server/opportunity-fingerprint.mjs` y `server/audience-insights.mjs` (vigencia). No se atribuyen pruebas UI a la sola lectura de esos archivos.
