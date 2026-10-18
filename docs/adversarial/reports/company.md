# Auditoría independiente — Empresa y contenido

Resultado: **FAIL**. 13 casos: **10 PASS, 2 FAIL, 1 BLOCKED**. Dos hallazgos P2; sin P1 observados. Revisión acotada a `/brand` después del alta, mediante navegador T3 y API/servidor reales.

## Entorno y reproducción

- URL: http://127.0.0.13:4103/brand.
- Build existente, commit `549e0bbf5b5858eb79bf069d847daee269ad344e`. No se ejecutó build ni format ni se modificó aplicación.
- Base propia conservada: `/tmp/30x-adversarial-company`. Sesión de proceso `47170`, PID `3827362`; puerto `4103`.
- Pestaña propia: `tab_3o_07e54779-9ab2-4979-8a15-674c4eff160a`; perfil incognito, host exclusivo en todas las llamadas.
- Cuentas sintéticas: `qa-company@example.com` y `qa-company-reviewer@example.com`. Marca `2a941489-80b7-4afa-ad3e-28f6ec32d386`.
- Sin claves OpenAI, Gemini, YouTube o Apify; descubrimiento desactivado. Inspección observada por reglas (`heuristic`).
- Fixtures iniciales preparadas por API; la funcionalidad revisada se ejerció desde la UI. No se usó la demo para demostrar exactitud ni datos reales de personas.

## Hallazgos confirmados

### company-1 · P2 · Un cambio de nombre sobrescribe el mercado confirmado

**Esperado:** el mercado confirmado desde la propuesta debe conservarse cuando sólo se edita el nombre.

**Secuencia:** importar web/texto → revisar propuesta → escribir mercado **Costa Rica** y nombre **Nexo QA · revisado** → aplicar → comprobar API/recargar → abrir **Perfil de empresa** → cambiar únicamente el nombre a **Nexo QA · nombre corregido** → **Guardar contexto**.

**Observado:** aplicar guarda exactamente `market=Costa Rica`. El perfil muestra Latinoamérica en el select, mientras la vista lateral y API conservan Costa Rica. Guardar el cambio de nombre envía y persiste también Latinoamérica sin pedir confirmación del cambio de mercado. Es pérdida parcial de un criterio editorial confirmado.

El formulario de propuesta permite mercado libre ([Journey.tsx:1707](../../../src/features/Journey.tsx#L1707)); el perfil usa opciones fijas sin Costa Rica ([Brand.tsx:50](../../../src/features/Brand.tsx#L50)). La comparación con la línea base incorpora la selección involuntaria al PATCH ([Brand.tsx:197](../../../src/features/Brand.tsx#L197), [guardado:356](../../../src/features/Brand.tsx#L356)). Esta lectura de código apoya el fallo ya reproducido.

Evidencias: [propuesta aplicada](../evidence/company-applied-costa-rica.png), [perfil antes de guardar](../evidence/company-market-before-save.png), [después de guardar](../evidence/company-market-after-save.png), [estados API antes/después](../evidence/company-api-observations.json).

### company-2 · P2 · Dirección de contacto inline sin redactar

**Esperado:** el contrato de contexto exige redactar contactos en los extractos ([IMPLEMENTATION.md](../../IMPLEMENTATION.md)). Una dirección expresamente marcada como domicilio de contacto debe omitirse aunque vaya dentro del párrafo.

**Secuencia:** desplegar texto propio y pegar un único párrafo: «PRUEBA SINTÉTICA: Nexo ofrece formación de procesos. Contacto ficticio Persona QA; el siguiente dato es su domicilio particular, no una sede de empresa. Dirección: Calle Inventada 456, Ciudad Sintética. Correo: persona.qa@example.com.» → importar → revisar historial/API → recargar.

**Observado:** se omite el correo, pero `Dirección: Calle Inventada 456, Ciudad Sintética` queda en `evidence.excerpt`, `draft.description` y pantalla. También se reprodujo con otra dirección de contacto dentro de un párrafo. La regla sólo coincide al principio del texto o de una línea ([company-context.mjs:153](../../../server/company-context.mjs#L153)); la importación guarda su resultado ([588](../../../server/company-context.mjs#L588), [608](../../../server/company-context.mjs#L608)).

La severidad corresponde al incumplimiento parcial de redacción. **Todos los contactos y domicilios eran ficticios**; no se observó filtración de datos personales reales ni ruptura de permisos entre espacios. El revisor autorizado también pudo ver el primer domicilio sintético guardado.

Evidencias: [domicilio individual explícito sintético](../evidence/company-inline-contact-address.png), [respuesta persistida](../evidence/company-api-observations.json).

## Casos ejecutados

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| Importación vacía | Rechazar sin crear una importación y explicar cómo continuar. | UI: «Agrega una web, un enlace o un texto para empezar». Historial sigue vacío. | PASS |
| URL inválida y corrección | Mostrar error recuperable, permitir corregir y reintentar. | «nota una web» produce «Usa una URL pública válida». Corregir a https://example.com y completar texto/enlaces permite guardar la importación. | PASS |
| Estados read/linked/failed/provided y procedencia | example.com leído, LinkedIn sólo enlazado, URL inexistente fallida y texto aportado sin verificación externa. | API conserva cuatro evidencias con estados exactos read,linked,failed,provided. UI muestra Contenido leído, Solo enlace, No se pudo leer y Texto aportado; resumen 2 con contenido,1 enlazada,1 sin lectura. Error HTTP404 visible. | PASS |
| Redacción de correo y teléfono | Omitir los contactos sintéticos del texto aportado y la descripción propuesta. | contacto.qa@example.com y +57 300 123 4567 se sustituyen por [correo omitido] y [teléfono omitido] en excerpt y draft.description. | PASS |
| No sobrescribir el perfil al importar | Guardar fuentes/propuesta sin modificar nombre, mercado, tono, pilares ni audiencia confirmados. | Tras importar, API /session mantiene Nexo QA · confirmado, México, Rigurosa y concreta, pilares ventas B2B/operaciones y audiencia segment-qa. | PASS |
| Revisar, editar y aplicar explícitamente | Guardar exactamente nombre, sector, descripción, tono, pilares, mercado y web revisados; no aplicar audiencia inferida automáticamente. | La propuesta advierte que reemplazará el contexto. Aplicar persiste Nexo QA · revisado, Operaciones y formación, descripción QA, Costa Rica, tono Sobrio/directo/basado en evidencia, dos pilares elegidos y web vacía; conserva audiencia segment-qa. | PASS |
| Recargar después de aplicar | Mantener contexto aplicado y el historial original con su procedencia. | Navegación completa a /brand conserva nombre revisado y API confirma Costa Rica; el historial sigue mostrando la importación mixta original. | PASS |
| Editar sólo el nombre en Perfil de empresa | Conservar el mercado Costa Rica confirmado desde la propuesta. | El select muestra Latinoamérica mientras la vista lateral y API dicen Costa Rica. Cambiar únicamente Nombre de la marca y Guardar contexto guarda también Latinoamérica, sin confirmación de cambio de mercado. | FAIL |
| Recuperar fuente fallida con texto aportado | Poder continuar pegando texto, identificándolo como aportado y conservando la lectura fallida anterior. | Nueva importación sólo de texto produce provided. Hasta su eliminación explícita, la importación previa conserva su failed HTTP404. No cambia el perfil. | PASS |
| Redacción de domicilio inline sintético | Omitir un domicilio de contacto expresamente etiquetado Dirección aunque aparezca en el párrafo, según el contrato de redacción. | Dos textos sintéticos mantienen la dirección en excerpt/draft.description y UI, incluso al recargar. Uno identifica explícitamente el dato como domicilio particular de Persona QA. Los correos sí se omiten. No se usaron datos personales reales. | FAIL |
| Eliminar importación: cancelar, confirmar y recargar | Cancelar conserva la importación; confirmar elimina sólo esa fuente y conserva el contexto ya aplicado. | Confirm muestra advertencia correcta. Cancelar conserva ambas importaciones; confirmar elimina la original mixta. Tras recargar queda la importación de recuperación y el perfil conserva nombre/sector/tono/pilares/audiencia; mercado sigue en el valor ya sobrescrito del hallazgo company-1. | PASS |
| Revisor consulta pero no modifica | Historial/perfil legibles; importar, eliminar y modificar perfil reservados al propietario. | Cuenta reviewer sintética sin formulario de importación ni controles de eliminar/revisar propuesta; fieldset y Guardar contexto deshabilitados. POST import, DELETE import y PATCH perfil responden403 con «Solo el propietario puede realizar esta acción». | PASS |
| Lectura real de contenido social | Sólo afirmar lectura cuando exista acceso/proveedor comprobado. | Sin credenciales, LinkedIn permanece linked y avisa que no se leyó perfil ni audiencia. La lectura social real no puede comprobarse en este entorno; su ausencia no se cuenta como integración aprobada. | BLOCKED |

La importación combinó `https://example.com`, `https://www.linkedin.com/company/qa-company-synthetic`, `https://example.com/qa-company-missing` y contenido propio. El historial conservó las cuatro procedencias: leído, sólo enlace, HTTP404 y aportado. El texto describía educación tecnológica/operaciones con contactos ficticios. La propuesta se identificó como interpretación y las audiencias como hipótesis por revisar; aplicar el contexto no sustituyó la audiencia confirmada.

Antes de aplicar, el perfil se mantuvo en **Nexo QA · confirmado / México / Rigurosa y concreta / ventas B2B, operaciones**. Después de aplicar explícitamente, API confirmó **Nexo QA · revisado / Costa Rica / Sobrio, directo y basado en evidencia / automatización responsable, métricas de procesos**, con la descripción QA, web vacía y audiencia original. El fallo aparece en el posterior guardado del perfil.

Cancelar la eliminación mantuvo las fuentes. Confirmarla eliminó sólo la importación seleccionada y recargar no revirtió el contexto aplicado. Se conservó una copia de la respuesta previa a eliminar para reproducir la procedencia. La cuenta reviewer tuvo campos y botón de guardado deshabilitados; POST import, DELETE import y PATCH perfil devolvieron 403.

## Límites y artefactos

- Alcance: /brand después del alta. Cuenta y marca iniciales creadas por API como fixtures sintéticas; importaciones, aplicación, guardado y eliminación probados mediante UI.
- Build existente y servidor real. Sin build, format ni cambios de aplicación. Fuentes públicas: example.com, URL404 de ese mismo dominio y enlace social sintético sin lectura.
- No se validó contenido social real ni IA de proveedor; las claves OPENAI/GEMINI/YOUTUBE/APIFY se retiraron del proceso. Inspección observada=heuristic.
- No cubre onboarding, edición de audiencias, otros navegadores/tamaños, concurrencia entre editores ni aislamiento completo entre marcas.
- El segundo fallo usa domicilio ficticio expresamente marcado; no hubo contactos personales reales ni envío de datos a terceros.
- La importación mixta fue eliminada desde UI al probar eliminación. Sus evidencias y respuesta previa están conservadas en company-api-observations.json.

Informe estructurado: [company.json](company.json). Evidencia de estados y respuestas, sin secretos: [company-api-observations.json](../evidence/company-api-observations.json). Capturas adicionales: [estados/procedencia](../evidence/company-import-statuses.png), [revisor](../evidence/company-reviewer-readonly.png).

El proceso propio se detuvo al terminar; base conservada para reproducción.

