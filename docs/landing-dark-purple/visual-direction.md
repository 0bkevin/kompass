# Dirección visual de la landing

Estudio: 18-10-2026. Alcance autorizado: sustituir por completo la identidad de la landing pública. La identidad verde anterior no limita esta página; los flujos de autenticación y trabajo siguen operativos. Worktree limpio inicialmente en `9fd8e9a92a389540d4e8fd04d00a03fab6790bd7`; sin el documento ajeno de deployment, .env, credenciales ni datos de otros checkouts. Desarrollo propio: web 5188 / API 3038.

## Referencias inspeccionadas de verdad

Se abrieron las páginas reales en el navegador colaborativo T3, se tomaron capturas y se inspeccionaron fuentes, tamaños, imágenes, videos y animaciones mediante DOM y estilos computados. No se copiaron activos ajenos.

[Resend](https://resend.com/): negro profundo, título Domaine de 96px/96px y peso 400 en la captura de 1280px, texto secundario gris, navegación contenida, controles de 48px, separación amplia. El cubo es un MP4, con luz y plano de fondo raster; más abajo combina tipografía de 56px con demostraciones específicas, bordes finos y estados de entrega. Aprendizajes: contraste de escala y densidad, negros diferenciados por superficie, una demostración más útil que una lista de iconos, movimiento al servicio del mecanismo. No adoptamos su cubo, sus imágenes, textos, logos, tipografía comercial ni bucles continuos.

[Exa](https://exa.ai/): composición central con título Arizona de 63.2px en 1280px; módulos cuadrados que encuadran un playground funcional; esquinas discretas y secciones divididas de proporciones distintas. Las imágenes incluyen textura acuosa azul/verde y cubos de grafos, con escenas canvas; más abajo, gráficos amplios y demostraciones de extracción. Aprendizajes: un vocabulario modular reconocible, evidencia en la propia composición y alternancia entre amplitud y detalle. No adoptamos su azul corporativo, marca, texturas, métricas ni activos.

Capturas originales (fuera del bundle; se conservan en artefactos T3):
- Resend hero: `/home/ubuntu/.t3/userdata/browser-artifacts/browser-screenshot-resend-com-mvdui5ny-18894ec7.png`.
- Resend demostraciones: `/home/ubuntu/.t3/userdata/browser-artifacts/browser-screenshot-resend-com-mvduilaa-217cc82a.png`.
- Exa hero: `/home/ubuntu/.t3/userdata/browser-artifacts/browser-screenshot-exa-ai-mvduiedl-511534c4.png`.
- Exa demostraciones: `/home/ubuntu/.t3/userdata/browser-artifacts/browser-screenshot-exa-ai-mvduj5zy-ddcde13e.png`.

## Traducción propia

Una apertura editorial en negro tinta, lavanda para actuar y violeta para reunir señales. Tipografía editorial Hedvig Letters Serif y controles Geist, servidos localmente con licencia. Una geometría modular original encuadra un ejemplo de necesidad → evidencia → enfoque → guion, identificado como ilustrativo. Los estados del ejemplo cambian por acción del visitante; no reproducimos una pantalla autenticada ni hacemos pasar el ejemplo por datos reales.

La slide se estudió con `view_image`: el titular empieza por la pregunta de trabajo del equipo; los bloques venden criterio, revisión compartida y continuidad, y el texto se depura leyendo titulares/CTA como recorrido separado. La investigación delegada y sus límites constan en [research-messaging.md](research-messaging.md). No se inventan métricas de conversión ni se atribuye a la investigación una validación de este copy.

## Skills y movimiento

Impeccable: SKILL.md, carga única de contexto, new-work, concept-seed `seed:55bd02fe74e613f1`, contrato de superficie, craft-floor y revisión acotada. Las rondas de aprobación de conceptos no se abren porque el usuario pide decisiones autónomas y aporta la dirección explícita; se construye en código con gráficos geométricos nativos, sin comps raster.

Instalación solicitada ejecutada: `npx --yes skills add emilkowalski/skill --agent codex --yes`. Se examinó primero `--help` y `--list`; se retiraron las once skills ajenas al encargo. Quedan `animate`, `review-animations`, `animation-performance` y `emil-design-eng`, sus instrucciones y referencias. Ámbito: este proyecto; `skills-lock.json` registra origen y hashes. Disponibles en el siguiente turno, leídas directamente y aplicadas en este.

Movimiento planificado: una entrada breve de la geometría explicativa, cambios de estado de opacidad/transform, feedback de pulsación 160ms y hovers sólo con puntero fino. Curva UI `cubic-bezier(0.23,1,0.32,1)` de Emil. Contenido visible desde SSR; sin biblioteca añadida, parallax, animación por fotograma React ni desplazamiento obligado. Teclado instantáneo y reduced-motion con estado estático.
