# company-1 — Mercado e idioma del perfil

Corregido; pendiente de la comprobación integrada del coordinador. Responsable: `fix_company_1`.

El perfil usaba listas cerradas para valores que la propuesta y la API admiten como texto libre. El navegador seleccionaba la primera opción al no encontrar `Costa Rica`, y el guardado de un cambio de nombre enviaba también ese mercado involuntario.

La corrección se limita a `BrandFields`, sus sugerencias y la conversión de idioma en `brandInput`, dentro de [Brand.tsx](../../../src/features/Brand.tsx). Mercado e idioma son ahora campos de texto con sugerencias. Un valor personalizado se puede ver y editar directamente. Español, Inglés y Portugués aparecen con sus nombres y se convierten a `es`, `en` y `pt` al enviar; los demás idiomas conservan su texto. La API mantiene su contrato libre.

## Reproducción roja y verificación verde

Base propia: `/tmp/30x-remediation-company-1`; interfaz `http://127.0.1.11:5501/brand`, API `4501`, fecha `2026-10-18`. Cuenta, empresa y contenido sintéticos. Cuenta y empresa iniciales preparadas por API; importación, propuesta y guardados ejercidos desde T3.

1. Importar texto aportado y abrir **Revisar propuesta de contexto**.
2. Establecer nombre `Nexo QA · revisado` y mercado `Costa Rica`; aplicar.
3. Consultar API, recargar y abrir **Perfil de empresa**.
4. Cambiar sólo el nombre a `Nexo QA · nombre corregido`; **Guardar contexto**.
5. Recargar completamente y comparar todos los campos de `/api/session` con la línea base aplicada.

| Comprobación | Antes | Después |
| --- | --- | --- |
| Costa Rica confirmado → cambiar sólo nombre | Campo Latinoamérica frente a tarjeta/API Costa Rica. PATCH `{name, market:"Latinoamérica"}`; API pierde Costa Rica. | Campo/API Costa Rica tras recarga. PATCH sólo `{name}`. Único campo cambiado: nombre. |
| Mercado e idioma personalizados por API → cambiar sólo nombre | Caso adicional ejecutado tras corregir la causa confirmada. | `África francófona y Québec (QA sintético)` y `Français (Canada)` se muestran y conservan tras guardar/recargar; PATCH sólo nombre. |
| Editar ambos campos con valores libres | Perfil limitado a opciones cerradas. | `Centroamérica · Panamá y Costa Rica` y `日本語` se guardan y reaparecen exactos tras recarga. |
| Nombre de idioma estándar | — | Escribir `Inglés` envía `en`; API conserva `en` y el formulario vuelve a mostrar `Inglés` tras recarga. |
| Teclado y tamaños | — | Tab de mercado a idioma, contorno de foco de 3px. Sin desbordamiento horizontal en 1280×800 ni en viewport 390×844. |

En los guardados de nombre permanecen idénticos sector, descripción, tono, idioma, web, colores, objetivos, pilares, meta semanal y audiencia. [Observaciones completas sin credenciales](../evidence/company-1-api-observations.json) contienen línea base, resultado, diferencias y cuerpos de PATCH.

`node --test tests/company-context.test.mjs tests/core.test.mjs`: **26/26 aprobados**. El prefijo que contiene los hunks asignados también pasa Prettier. El check de `Brand.tsx` completo señaló un ternario en el hunk ajeno de Audiencia; se comunicó al coordinador sin modificarlo.

No se añadió un test de constante o JSX: el fallo depende de la representación de un valor externo en el control nativo y del envío del formulario real. La comprobación de regresión fue el mismo recorrido de navegador, rojo antes y verde después, con lectura API posterior a la recarga.

## Evidencia y límites

- [Antes: desacuerdo campo/tarjeta](../evidence/company-1-before-mismatch.png).
- [Antes: sobrescritura guardada](../evidence/company-1-before-saved.png).
- [Después: Costa Rica tras recarga](../evidence/company-1-after-costa-rica.png).
- [Después: valores personalizados por API](../evidence/company-1-after-custom-api.png).
- [Interfaz final en escritorio](../evidence/company-1-final-desktop.png) y [viewport móvil](../evidence/company-1-final-mobile.png).

Comprobación acotada a `/brand` después del alta, en desarrollo propio y SQLite aislado. Viewport móvil emulado en T3; no Safari ni dispositivo físico. Inspección `heuristic` sobre texto aportado, sin llamadas a proveedores reales. Sin build global, cambios de dependencias, commits ni cambios en Audiencia/guards. Informes adversariales históricos conservados.

Informe estructurado: [company-1.json](company-1.json). Pestaña y sesión propias cerradas; `ss` confirmó los puertos 4501/5501 liberados. La base sintética se conserva para reproducción. Durante el cierre deliberado con SIGTERM, Node `--watch` emitió una aserción interna en `FSWatcher.close`; ocurrió después de las verificaciones y no dejó procesos escuchando.
