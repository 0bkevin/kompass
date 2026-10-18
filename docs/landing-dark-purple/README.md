# Nueva landing pública de kompass

La [revisión de contenido de kompass](../kompass-copy.md) recoge el texto y las capturas actuales de la landing, acceso y aplicación. La [revisión de copy y navbar](copy-navbar-refinement.md) documenta la aplicación inicial de la skill de Peter Yang y del titular elegido por el usuario, «Le damos dirección a tu contenido». La evidencia siguiente documenta la entrega inicial.

Implementada en `design/landing-dark-purple`, desde `9fd8e9a92a389540d4e8fd04d00a03fab6790bd7`. El checkout estaba limpio y no incluía `docs/deployment-evaluation-20261018.md`. No se copiaron `.env`, tokens ni datos del checkout anterior. Servidor propio: [landing local](http://localhost:5188/), API 3038; los servidores 3026 y 5450 se conservaron.

## Resultado

Nueva ruta pública `/`, renderizada con TanStack Start. Identidad oscura/morada autorizada exclusivamente para la landing; estilos locales `lp-*`, fuentes locales con OFL y geometría SVG propia. El workspace y Auth mantienen sus pantallas e identidad. La portada abre con el problema editorial y muestra una necesidad propuesta, una fuente pública contrastable, un enfoque y un guion. Todos los ejemplos están identificados.

Se estudiaron las páginas reales de [Resend](https://resend.com/) y [Exa](https://exa.ai/) en el navegador colaborativo de T3. [La dirección visual](visual-direction.md) detalla capturas, tipografía, imágenes, composición y movimiento observados y qué se tradujo al diseño propio. La [investigación delegada](research-messaging.md) cita fuentes primarias y distingue evidencia de hipótesis de copy. La slide adjunta se abrió con `view_image`: problema en sus palabras, resultado editorial antes que herramientas y depuración del recorrido de titulares/CTA.

La única fuente externa del ejemplo es la [guía de alfabetización en IA de la Comisión Europea](https://digital-strategy.ec.europa.eu/en/faqs/ai-literacy-questions-answers), consultada el 18-10-2026. Se usa como contexto, sin convertirla en señal demostrada de demanda ni asesoramiento legal. Los recursos de Resend y Exa no forman parte del bundle.

## Recorridos verificados en T3

| Acción | Comprobación |
| --- | --- |
| Crear mi cuenta / Crear cuenta | `/home?auth=signup`, nombre/correo/contraseña. Registro sintético local → configuración de empresa. |
| Iniciar sesión | `/home?auth=login`, sin campo de nombre. Acceso con la misma cuenta → mismo espacio; sesión persistente. |
| Explorar la demo | Clic explícito → consulta de sesión → `POST /api/auth/demo` sólo si no existe sesión → `/home` con espacio de ejemplo. |
| Volver con sesión | El mismo usuario y empresa se mantienen. El CTA de demo no ejecuta ningún POST de demo ni reemplaza la cuenta. |
| Fallo y reintento de demo | Respuesta 503 simulada en el transporte de una pestaña aislada → alerta y botón habilitado; restaurar transporte → demo real. Guardia contra solicitudes concurrentes. |
| Invitación antigua | `/?invite=…&ref=keep` → `/home` conservando invitación y query. No acepta invitaciones desde la landing. |
| Callback de Google | `/?authError=google_cancelled&ref=keep` → Auth con error y query conservada. El acceso elimina el intent `auth`; Google no lo recibe en `returnTo`. |
| Enlace heredado | Carga completa de `/?ref=legacy#studio` → `/studio?ref=legacy`. Anclas de la landing llegan a secciones existentes. |
| Ejemplo | Clic en cuatro etapas; teclado ←/→, Home/End; un único tab en el orden de tabulación, panel asociado. |
| Preguntas | Apertura/cierre con botón y teclado, `aria-expanded`, paneles ocultos excluidos del recorrido. |

Las sesiones y datos sintéticos usados son de esta instancia local. No se solicitó conexión a proveedores ni generación de contenido real para comprobar la landing.

## Validación

- `npm ci`: instalación limpia, sin vulnerabilidades reportadas.
- `npm test`: **586/586**, sin fallos, cancelados ni omitidos; 44,0 s. Incluye un nuevo roundtrip OAuth para ambos intents con invitación preservada. La base tenía 585 tests.
- `npm run build`: cliente + servidor + `tsc -b` correctos, ejecutado tras las correcciones finales.
- Prettier y `git diff --check`: correctos.
- Dos pasadas visuales acotadas: escritorio **1280×800** y móvil **390×844**. Comprobaciones adicionales de reflow a **320, 768 y 1440 px**, sin desbordamiento horizontal y CTA de 48px.
- Contraste computado sobre 99 elementos de texto visibles: mínimo **5,4:1**, sin fallos contra 4,5:1 para texto normal o 3:1 para texto grande. Comprobación con fondos compuestos, no certificación de auditoría externa.
- Fuentes locales cargadas, foco de 2px con separación de 5px y transición inmediata al usar teclado. Contenido y CTA visibles desde el HTML inicial, sin depender de animaciones de entrada.
- Consola instrumentada durante la interacción: sin errores ni promesas rechazadas. Recursos del documento final sin respuestas HTTP de error. La salida compacta de T3 omite el historial completo de consola; no se afirma una auditoría de todas las entradas históricas.
- Reduced motion: revisión de reglas CSS y activación de las mismas ramas CSSOM en el navegador; cero animaciones activas, geometría estática y cambios inmediatos. T3 no ofrece emulación nativa de la preferencia del sistema; no se afirma prueba en un teléfono físico ni medición de GPU/fps.

## Revisión y skills

Impeccable se cargó una sola vez; se siguieron new-work, contrato de dirección, craft-floor, detector único y revisión acotada. El detector encontró diferencias con la documentación verde anterior y el aviso de Geist como fuente común; Hedvig es la voz de display propia y Geist se limita a texto y controles. DESIGN.md y su sidecar se documentaron al terminar, con ámbitos separados y tokens operativos anteriores preservados.

La instalación solicitada de `emilkowalski/skill` se realizó en el proyecto. Se leyeron y aplicaron `animate`, `review-animations`, `animation-performance` y `emil-design-eng`; `skills-lock.json` conserva origen/hashes. La [revisión de movimiento](motion-review.md) registra los cuatro hallazgos iniciales y su resolución, con veredicto **Approve**. La [revisión final de Impeccable](finish-review.md) registra el veredicto **ship** de la confirmación: los cinco ajustes señalados quedaron resueltos; el veredicto se limita a esa lista. Se usaron los agentes de finish reviewer y documenter suministrados por Impeccable, en contexto nuevo.

## Evidencia

- [Escritorio completo](../../.impeccable/review/landing/desktop.png) y [móvil completo](../../.impeccable/review/landing/mobile.png).
- [Primera pantalla de escritorio](../../.impeccable/review/landing/desktop-hero.png) y [móvil](../../.impeccable/review/landing/mobile-hero.png).
- [Detector único](../../.impeccable/review/landing/detector.json) y [resultados estructurados](../../.impeccable/review/landing/validation.json).
- Grabación de las etapas y teclado en T3: `/home/ubuntu/.t3/userdata/attachments/mcp-c6054db5-cad0-4f5b-ac30-dcfc662a838d-2a77c9cf-dd2f-446f-a9a1-805402314279-mp4.mp4`.

Las capturas completas unen dos capturas T3 con solapamiento recortado porque el navegador limita la altura a 3840px. No alteran contenido, proporciones ni color. Las capturas de primera pantalla se conservan directamente; las originales y la grabación permanecen en artefactos T3.

## Límites

No se desplegó ni se publicó esta rama. El copy es una hipótesis informada; no se midió conversión ni ahorro. La landing explica el estado real: calendario sin publicación automática; YouTube con contadores acumulados oficiales y actualización horaria mientras el servidor está activo; sin conexiones oficiales de Instagram, LinkedIn o TikTok; MP4 ilustrados y subtitulados sin audio ni metraje generado cuando el servicio está habilitado. La prueba local no configura esos proveedores.
