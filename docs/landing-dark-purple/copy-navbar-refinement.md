# Copy y navbar: revisión solicitada

El usuario pidió aplicar la skill exacta de [Peter Yang](https://github.com/petergyang/no-ai-slop), bajar la altura del navbar y usar dos tipografías. Después eligió el titular **«Le damos dirección a tu contenido»**, que se conserva.

Se instaló `skills/no-ai-slop` con el helper `skill-installer` en `.agents/skills/no-ai-slop`. Se leyeron `SKILL.md` y `eval.md`; el origen, commit y hashes están en [ORIGIN.json](../../.agents/skills/no-ai-slop/ORIGIN.json). La instalación queda disponible para siguientes turnos en este proyecto. El texto completo editado está en [LandingPage.tsx](../../src/features/landing/LandingPage.tsx) y se puede leer en la landing.

## Qué cambió

- Se retiraron «un hilo conductor», «Tu conocimiento. Su próxima buena respuesta» y el cierre «puede empezar con un porqué».
- Los bloques explican tareas concretas: consultar las fuentes de un tema, escribir y revisar el guion, asignar fechas y registrar resultados.
- Se eliminó el contraste «No necesitas… Necesitas…» y otros cierres en frases cortas repetidas. Se conservaron las limitaciones reales de calendario, redes, video y demo.
- El navbar pasó de 88 a 64px de contenido en escritorio, de 76 a 60px en tablet y de 72 a 56px en móvil. El borde suma 1px. Los CTA principales conservan 48px de altura.
- La landing usa exactamente dos familias: **Hedvig Letters Serif** en titulares y **Geist** en texto, navegación y controles. Ambas se sirven localmente. Se actualizaron el título de la pestaña, la descripción y la documentación de diseño.

## Comprobaciones de esta revisión

Build de cliente/servidor y TypeScript correctos. Prettier y `git diff --check` correctos. No se añadieron tests de texto/CSS ni se repitió la suite de 586 tests de la entrega inicial.

T3 confirmó alturas, fuentes cargadas y ausencia de desbordamiento a 320, 390, 640, 768, 1280 y 1440px. Se revisaron escritorio y móvil, navegación por teclado en las etapas, foco visible, preguntas desplegables y destinos de los enlaces. No hubo errores durante las interacciones instrumentadas ni recursos con respuestas HTTP de error. Los handlers de sesión, demo y registro no cambiaron.

La revisión independiente de copy contra `eval.md` pasó los apartados aplicables: conservación del significado, voz, claridad, concreción y patrones. La frase elegida por el usuario se conserva por su instrucción, sin sustituirla por otro slogan. El resultado no pretende detectar autoría ni medir conversión.

Capturas de esta revisión: [escritorio](../../.impeccable/review/landing/copy-navbar/desktop.png), [móvil](../../.impeccable/review/landing/copy-navbar/mobile.png), [cabecera de escritorio](../../.impeccable/review/landing/copy-navbar/desktop-hero.png) y [cabecera móvil](../../.impeccable/review/landing/copy-navbar/mobile-hero.png). Las capturas de la entrega inicial se conservan como historial.

La revisión final de Impeccable devolvió **ship** para este alcance: copy, navbar y las dos tipografías. No señaló correcciones materiales. Las cuatro capturas fueron válidas; el veredicto no reabre la revisión del producto autenticado.
