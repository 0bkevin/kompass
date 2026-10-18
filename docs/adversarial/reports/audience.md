# Perfiles de audiencia y necesidades — revisión adversarial

**Resultado: FAIL.** 12 casos: **11 PASS, 1 FAIL, 0 BLOCKED**. Un hallazgo confirmado **P2**, ningún P1/P3. Auditoría independiente del build existente el 18-10-2026, sin cambios de implementación ni lectura de informes ajenos.

## Entorno y método

- URL: http://127.0.0.14:4104/audience.
- Base exclusiva: `/tmp/30x-adversarial-audience`; empresa principal `0a10f572-0221-4ec1-8256-ebe625201875`.
- Arranque sin las cuatro claves indicadas en BRIEF, `DISCOVERY_ENABLED=false`, sin `.env`, build ni format. Sesión de proceso **22978**, PID **3833238**. Se verificó su DATA_DIR y puerto antes de detenerlo.
- T3: pestaña propia `tab_3p_07e54779-9ab2-4979-8a15-674c4eff160a`, perfil incognito, snapshots antes de acciones y estados después; pestaña cerrada al finalizar.
- Cuentas ficticias `qa-audience@example.com` y `qa-audience-reviewer@example.com`. Cambio secuencial mediante cerrar sesión. Fixtures API: cuentas, empresa vacía, invitación reviewer y empresa auxiliar con 30 segmentos. La creación/edición/borrado auditada ocurrió por UI.
- Proceso detenido y datos conservados. No se accedió a claves, bases ni pestañas ajenas.

## Hallazgo confirmado

### audience-1 · P2 · Se guardan rol y necesidades vacíos al introducir espacios

**Esperado:** los campos marcados obligatorios deben contener texto tras recortar espacios. Un perfil sin necesidad no aporta la necesidad concreta requerida por el recorrido editorial.

**Pasos reproducidos dos veces:**

1. Como propietario, abrir Audiencia → Nueva audiencia.
2. Introducir nombre válido y **tres espacios** en Rol o responsabilidad y Necesidades e intereses.
3. Guardar perfil y recargar.

**Observado:** el navegador considera satisfecho `required`; el guardado devuelve **PATCH 200**. El servidor recorta ambos campos y persiste `role: ""`, `needs: ""`. La tarjeta queda sin rol ni necesidad tras recargar. La segunda reproducción queda en la base: perfil `8e128450-3d77-4a32-8e7a-b6c8037c8249`, **Blancos — reproducción sintética**. La primera reproducción (`724b6082-8f5f-442c-8a50-9f429ccaf66b`) se eliminó mediante UI para comprobar el borrado sin uso.

**Evidencia:** [captura del perfil vacío](../evidence/audience-whitespace.png), [estado final exacto](../evidence/audience-final-state.json); red T3: PATCH200 a `/api/brands/0a10f572-0221-4ec1-8256-ebe625201875` a las 01:57:39.075Z.

**Causa localizada tras reproducir:** [Brand.tsx](../../../src/features/Brand.tsx#L575) envía el texto sin validación semántica; los campos usan `required` en líneas606/630. [core.mjs](../../../server/core.mjs#L100) recorta espacios, pero rol y necesidades se validan sin `required=true` en líneas307/309. No se modificó código.

## Resultados por caso

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| Formulario vacío | No crear y señalar obligatorios | Nombre, rol y necesidades inválidos con “Please fill out this field.”; API audience=[] | PASS |
| Crear perfil y procedencia | Valores exactos, hipótesis editorial explícita | Ventas conserva nombre, rol Directora comercial, etapa Implementando y necesidad completa. Aviso: una inscripción no demuestra consumo | PASS |
| Segunda audiencia y edición independiente | Añadir sin sobrescribir y conservar IDs | EdTech añadido; se editó a EdTech validación, Directora de formación, Escalando y nueva necesidad. Ventas íntegro | PASS |
| Recarga | Conservar ambos perfiles editados | UI y GET state coinciden; no reaparecen datos anteriores de EdTech | PASS |
| Cancelar cambios | Rechazar descarte conserva formulario; aceptar no guarda | Confirm nativo; al rechazar seguía “Cambio que debe cancelarse”; al aceptar desapareció y API conservó necesidad anterior | PASS |
| Sólo espacios | Rechazar rol/necesidad vacíos al recortar | PATCH200; role="" y needs="" persistidos; dos reproducciones | **FAIL** |
| Borrar sin uso | Eliminar sólo objetivo y persistir | Perfil Blancos inicial desapareció tras recargar; Ventas y EdTech íntegros | PASS |
| Límites y corrección | Rechazar 151/301/3001, aceptar 150/300/3000 | Alertas exactas de máximo150/300/3000; al corregir API guardó longitudes exactas150,300,3000. Perfil temporal borrado por UI | PASS |
| Uso posterior | Guion usa EdTech seleccionado y su necesidad | Pieza d524f10d-8c3d-41de-b718-bcd3bd18ef01 con segmentId eca9f7d6-041b-4fe2-9260-8db9b87621d8; guion incorpora necesidad de aprendizaje, canal linkedin y formato post | PASS |
| Borrar perfil vinculado | Bloquear pérdida de vínculo | 409: “No puedes eliminar la audiencia: 1 pieza todavía tienen vínculos. Reasigna esas piezas e ideas a otra audiencia antes de eliminarla.”; perfil y pieza siguen | PASS |
| Límite30 | Perfil31 rechazado; originales íntegros | “La marca admite hasta 30 segmentos.”; API count30; comparación de todos los IDs, nombres, roles, etapas y necesidades originales=true | PASS |
| Reviewer | Consulta permitida; mutaciones bloqueadas | Nueva audiencia y ambos Editar perfil desactivados; PATCH audience=[] devuelve403 “Solo el propietario puede realizar esta acción.”; array idéntico antes/después | PASS |

Los valores y respuestas completos de cada caso constan en [audience.json](audience.json). Las expectativas se declararon antes de cada comparación durante las pruebas.

## Identidad exacta de los segmentos comprobados

| ID | Nombre final | Rol | Etapa | Necesidad |
| --- | --- | --- | --- | --- |
| 06fe6beb-fdef-4854-ba33-f397ff898ee5 | Ventas IA — prueba sintética | Directora comercial | Implementando | Automatizar seguimiento de ventas con IA sin perder el criterio humano. |
| eca9f7d6-041b-4fe2-9260-8db9b87621d8 | EdTech validación — prueba sintética | Directora de formación | Escalando | Medir aprendizaje y retroalimentación con IA en cursos EdTech. |

La UI contó **Ventas=0 piezas** y **EdTech=1 pieza** después de crear el guion. Se comprobó por estado persistido, no sólo mediante mensajes de éxito.

## Evidencias

- [Creación](../evidence/audience-created.png).
- [Perfiles tras edición/recarga](../evidence/audience-two-profiles.png).
- [Rol y necesidades vacíos persistidos](../evidence/audience-whitespace.png).
- [Límite de longitud](../evidence/audience-limits.png).
- [Guion con EdTech seleccionado](../evidence/audience-correct-segment-draft.png).
- [Bloqueo de borrado por vínculo](../evidence/audience-delete-in-use.png).
- [Restricción reviewer](../evidence/audience-reviewer.png).
- [Estado final sanitizado](../evidence/audience-final-state.json).

## Límites

Datos sintéticos; esta revisión no acredita audiencia real ni exactitud de hipótesis con consumidores. El guion usa estructura local sin IA conectada. Señales, comunidad, importación inicial del inspector y conflictos entre clientes quedan fuera de este perfil de auditoría. El borrado sin uso es inmediato; los requisitos no exigen un confirm adicional y no se cuenta como defecto. No se afirma cobertura universal.

