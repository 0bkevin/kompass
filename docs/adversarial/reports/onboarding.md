# Alta guiada de empresa — revisión adversarial

**Resultado: PASS.** 8 casos aprobados, 0 fallos confirmados y 0 bloqueados dentro del alcance indicado. No se identificaron hallazgos P1/P2/P3 reproducidos.

Revisión independiente del build existente el 18 de octubre de 2026. Se leyeron PRODUCT.md y docs/TRANSCRIPT-TO-PRODUCT.md como requisitos; README.md y docs/IMPLEMENTATION.md sólo como límites. No se modificó la aplicación ni se leyeron otros informes. Las acciones del alta se ejecutaron mediante las herramientas nativas T3, con snapshot previo, en una pestaña propia.

## Entorno y reproducción

- URL: `http://127.0.0.12:4102`
- Datos aislados conservados: `/tmp/30x-adversarial-onboarding`.
- Cuenta ficticia: `qa-onboarding@example.com`. Contraseña y sesión excluidas del informe.
- PID propio: `3826864`; sesión de ejecución: `76056`. Finalizado con SIGTERM al concluir; puerto 4102 cerrado. Pestaña propia cerrada.
- Pestaña propia: `tab_3n_07e54779-9ab2-4979-8a15-674c4eff160a`; perfil incognito; 1280×800.
- Inicio: `env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN DATA_DIR=/tmp/30x-adversarial-onboarding PORT=4102 DISCOVERY_ENABLED=false node server/start-host.mjs`.
- No se ejecutaron build, format ni pruebas automáticas durante la auditoría.

## Casos

| Caso | Esperado | Observado | Veredicto |
| --- | --- | --- | --- |
| Contenido vacío | Preparación bloqueada sin ninguna fuente. | Preparar mi empresa aparece deshabilitado con web, enlaces y texto vacíos. | PASS |
| URL inválida y privada en web | Rechazar entradas inválidas y loopback sin avanzar ni crear marca. | esto-no-es-una-url y http://127.0.0.1:4102 reciben HTTP 400 y alerta Solo se permiten URLs públicas HTTP/HTTPS sin credenciales ni direcciones privadas.; permanece en paso 1. | PASS |
| Texto propio sin proveedor | Aceptar texto, identificar origen aportado y presentar hipótesis editable sin consumidores observados. | Paso 2 con descripción propia, industria/temas heurísticos editables; evidencia Contenido aportado por tu equipo y aviso explícito hipótesis/no consumidores observados. | PASS |
| Campos obligatorios vacíos | No avanzar ni crear marca sin nombre o sin primera audiencia/necesidad. | Nombre de empresa vacío bloquea paso 2; audiencia y necesidad vacías bloquean Abrir mi espacio por validación nativa. | PASS |
| Edición y atrás/avanzar | Conservar correcciones al volver del paso 3 al 2 y avanzar. | Los seis campos corregidos de empresa se conservaron y la audiencia/necesidad editadas reaparecieron al regresar al paso 3. | PASS |
| Confirmación, doble clic y persistencia | Crear una sola marca con sólo la audiencia revisada, campos editados y evidencia; persistir tras recarga. | Doble clic en Abrir mi espacio produjo un POST /brands y un commit. SQLite: una marca, una audiencia editada, dos sugerencias sólo en historial. Recarga conservó empresa y audiencia visibles. | PASS |
| Enlace social aislado y reintento | Guardar referencia social como linked sin inferir contenido/audiencia, permitir completar manualmente; URL privada rechazada y reintento válido recuperable. | URL social privada 192.168.1.5 devolvió 400; corrección a instagram.com/qa_lumbre_cooperativa con doble clic produjo una inspección válida. Propuesta vacía sin audiencias; evidencia linked, excerpt vacío, aviso contenido sin leer. Marca Lumbre Social QA guardó sólo campos/audiencia manuales y la referencia linked. | PASS |
| Web pública real y normalización | example.com sin esquema debe leerse realmente, exponerse como read y conservar texto/URL/procedencia después de confirmar y recargar. | UI preparó Example Domain y descripción pública de example.com; evidencia Página leída. Se editó nombre/sector/temas/mercado, se definió primera audiencia y guardó; tras recarga la nueva marca permanece. | PASS |

## Comprobación de exactitud

La primera inspección de texto propuso **dos** grupos: Responsables de formación y Equipos de marketing. En el paso 3 sólo se revisó el primero, se sustituyó por **Comunicadores de cooperativas cafeteras** y se escribió la necesidad **Explicar la trazabilidad del café con pruebas verificables y lenguaje claro.** Tras el doble clic de confirmación y una recarga, Audiencia muestra ese único perfil. SQLite contiene una audiencia en la marca; las dos sugerencias originales permanecen exclusivamente en el historial de inspección.

Los seis campos de empresa editados se conservaron: **Lumbre Cooperativa QA**, Comunicación cooperativa, la descripción breve revisada, los temas Trazabilidad del café y Comercio justo, Colombia y la voz Concreto, respetuoso y cercano. Se contrastaron con el estado persistido, no sólo con la notificación de éxito.

La segunda marca, **Lumbre Social QA**, contiene la audiencia manual Comunicadores rurales y la necesidad Preparar historias públicas verificables. La URL social quedó en una evidencia `status: linked`, sin extracto; su propuesta de contenido y audiencia está vacía. La interfaz dice que el perfil y su audiencia no se leyeron, que esos enlaces no se usaron para inferir y que se requiere contenido propio.

En **Control Web Pública QA**, `example.com` se normalizó a `https://example.com/`. El inspector leyó realmente **Example Domain** y su texto de documentación, con evidencia `status: read`, `platform: website` y extracto correspondiente. La marca y la audiencia manual Autores de documentación técnica permanecieron después de recargar. No se presenta este control como una empresa real.

El [volcado acotado de datos](../evidence/onboarding-data.json) contiene únicamente las tres marcas ficticias propias y sus tres inspecciones: una fuente `provided`, una `linked` y una `read`. No contiene tablas de autenticación, cookies, claves o contraseñas. Las marcas finales tienen una audiencia cada una.

## Evidencias

- [Rechazo de URL privada](../evidence/onboarding-url-privada.png).
- [Edición de empresa y procedencia del texto](../evidence/onboarding-texto-procedencia.png).
- [Primera audiencia editada antes de confirmar](../evidence/onboarding-confirmacion-audiencia.png).
- [Audiencia persistida después de recargar](../evidence/onboarding-audiencia-persistida.png).
- [Enlace social sin lectura ni inferencia](../evidence/onboarding-social-enlace.png).
- [Lectura real de web pública](../evidence/onboarding-web-publica.png).

## Límites

- Alcance: tres altas en navegador de escritorio 1280×800, con texto ficticio propio, un control público real example.com y una URL social guardada. No es cobertura universal.
- Sin OPENAI_API_KEY, GEMINI_API_KEY, YOUTUBE_API_KEY ni APIFY_API_TOKEN; se verificó fallback heurístico y honestidad de etiquetas. No se probó IA ni extracción mediante proveedores sociales reales.
- La persistencia cubierta es después de confirmar el alta; no se verificó recuperación de un borrador del asistente tras recargar antes de guardar.
- El reintento cubierto es corregir entradas rechazadas y volver a preparar; no se indujeron errores de red en el intervalo entre crear marca y confirmar fuentes.

El fallback heurístico funcionó sin credenciales; esto no acredita la exactitud de una integración real de IA. No se emplearon mocks como prueba de lectura pública. La base temporal se conserva para reproducir la revisión.
