# Dirección escrita de kompass

El usuario eligió «Le damos dirección a tu contenido» como promesa y pidió revisar el resto del contenido en esa dirección. La redacción explica decisiones que el equipo puede tomar: a quién dirigirse, qué pregunta responder, qué fuentes contrastar, qué enfoque escribir y qué revisar después de publicar.

## Cambios

La landing abre con el problema de elegir qué publicar y conecta las preguntas de audiencia con las fuentes y el guion. Acceso, alta de empresa, Inicio, Contexto, Audiencia, Oportunidades, exploración, Estudio, Calendario, Resultados y Archivos mantienen ese recorrido. Los metadatos y la introducción del README usan el mismo posicionamiento.

| Antes                                             | Ahora                                  |
| ------------------------------------------------- | -------------------------------------- |
| «El mundo se mueve. Encuentra tu próximo ángulo.» | «Decide qué merece contar tu empresa.» |
| «Buscar tendencias»                               | «Buscar en mis fuentes»                |
| «El ADN de tu marca.»                             | «El contexto de tu marca.»             |
| «Tu contenido, en su momento.»                    | «Pon fecha a las piezas aprobadas.»    |

Se revisaron también Comunidad, generación multimedia, Configuración, conexiones sociales, publicación, presupuestos y componentes compartidos. Sus instrucciones, errores y límites ya eran concretos y se conservaron. El lema queda en las superficies de marca; las instrucciones explican la tarea, sin repetir metáforas de brújula.

## Criterio y verificación

- Aplicadas no-ai-slop, su evaluación final y las referencias clarify/craft-floor/polish de Impeccable. Revisión editorial independiente sin bloqueos. Se mantienen hipótesis, atribuciones y límites reales de conectores, video y publicación.
- Una pasada conjunta de escritorio y móvil. Landing y acceso a 1280 × 800 y 390 × 844; nueve rutas de trabajo a ambos anchos, sin desbordamiento de títulos ni párrafos. El pie de marca sigue visible en móvil tras retirar su segunda frase.
- Se probó el acceso explícito a la demo. La consola instrumentada durante la entrada no capturó errores. La captura final de diagnósticos no mostró errores ni avisos en sus entradas disponibles; T3 omite entradas históricas, por lo que no se afirma una auditoría de todo el historial.
- `npm test`: **591/591**. `npm run build`: cliente, servidor y TypeScript correctos. `git diff --check`: correcto. No se añadieron tests que sólo repitan el texto de la interfaz.
- No se cambian capacidades, lógica, rutas ni identidad visual. Los únicos ajustes CSS conservan visible la única frase del pie en móvil.

[Resultados por ruta](../.impeccable/review/kompass-copy/validation.json). Capturas directas de T3: [landing de escritorio](../.impeccable/review/kompass-copy/desktop.png), [móvil](../.impeccable/review/kompass-copy/mobile.png), [acceso](../.impeccable/review/kompass-copy/auth-desktop.png), [acceso móvil](../.impeccable/review/kompass-copy/auth-mobile.png), [Inicio](../.impeccable/review/kompass-copy/home-desktop.png), [Inicio móvil](../.impeccable/review/kompass-copy/home-mobile.png), [exploración](../.impeccable/review/kompass-copy/discovery-desktop.png) y [exploración móvil](../.impeccable/review/kompass-copy/discovery-mobile.png).
