# Parallax y respuesta de la landing

El usuario pidió animaciones suaves y atractivas con parallax, manteniendo una composición moderna y limpia. Se aplicaron las skills instaladas de Emil (`animate`, `animation-performance`, `emil-design-eng` y `review-animations`) y las referencias animate, craft-floor y polish de Impeccable. El contexto de Impeccable ya estaba cargado en esta sesión y no se repitió.

## Movimiento implementado

Las señales públicas que rodean el ejemplo editorial tienen dos planos: las conexiones se desplazan hasta 72px respecto al documento y los módulos hasta 32px. El texto, los CTA y el ejemplo conservan su posición en el documento. La relación de profundidad sigue el scroll nativo, sin suavizar ni interceptar el desplazamiento de la página.

La composición entra una vez con 12px de desplazamiento y opacidad sobre 600ms, desde un estado visible. Las cuatro etapas comparten un indicador que se desliza en 240ms con la curva existente `cubic-bezier(0.23, 1, 0.32, 1)`. Los cambios rápidos retoman la posición actual; el texto cambia inmediatamente y el teclado no anima el indicador. Las flechas de acciones reciben un avance de 2–3px al pasar un puntero fino, en 160ms. Press/release conserva 160/100ms.

Sólo se animan transformaciones en el parallax; no hay librería nueva, scroll listeners, bucle RAF ni actualizaciones de React por frame. Los fondos/bordes de botones tienen feedback de color de 150ms. La preferencia de movimiento reducido elimina los desplazamientos y mantiene ese feedback. El parallax usa un fallback estático cuando las APIs no están disponibles; la geometría periférica sigue oculta a 600px o menos.

## Revisión de Emil

| Antes                                                                       | Después                                                                | Por qué                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| El padding de tablet divergía del cálculo del indicador móvil.              | Insets, gap y regla usan las mismas variables en cada breakpoint.      | La barra coincide con el botón activo.         |
| El reset global de movimiento reducido anulaba los cambios suaves de color. | Override específico de 150ms para fondo y borde, sin transformaciones. | Mantiene respuesta visible sin desplazamiento. |

Ambos hallazgos del navegador quedaron resueltos en un solo ajuste. El revisor independiente confirmó **Approve** y mantuvo el veredicto tras revisar esas correcciones. La revisión de código no certifica rendimiento de GPU ni hardware físico.

## Verificación

- Navegador colaborativo de T3: escritorio, móvil y tablet a 1280, 390 y 768px. Sin desbordamiento. Barra alineada con el contenido de los botones en los tres anchos.
- Scroll 0 → 350 → 700 → 350 → 0: las capas regresan a la misma transformación. La posición absoluta del ejemplo permanece en 561,97px; el texto no recibe transformaciones.
- Clics rápidos entre etapas: selección y panel asociados correctos. Flecha izquierda por teclado: foco y selección inmediatos, sin animación del indicador.
- Reglas reales de movimiento reducido activadas mediante CSSOM: capas sin animación ni transformación, indicador inmediato y feedback de color de 150ms. También se deshabilitó el bloque de mejora para comprobar el fallback visible y estático. T3 no expone emulación nativa de la preferencia del sistema; se documenta el método empleado.
- Consola instrumentada durante interacción inicial y confirmación sin errores; no se observaron long tasks en la muestra inicial. La salida compacta de diagnósticos omite entradas históricas. No se midieron fps/GPU ni se probó un teléfono físico.
- `npm test`: **591/591**. `npm run build`: cliente, servidor y TypeScript correctos. `git diff --check`: correcto.

[Validación estructurada](../../.impeccable/review/landing-parallax/validation.json), [captura de escritorio](../../.impeccable/review/landing-parallax/desktop.png), [móvil](../../.impeccable/review/landing-parallax/mobile.png) y [grabación real de T3](../../.impeccable/review/landing-parallax/motion.mp4).

## Referencias técnicas verificadas

El rango `exit-crossing` abarca desde que el borde inicial del hero cruza el viewport hasta que lo cruza el borde final, incluso con un hero más alto que la pantalla. Se conserva la animación lineal para que refleje el progreso del scroll. [Especificación CSSWG](https://drafts.csswg.org/scroll-animations-1/#view-timelines-ranges).

`animation-timeline` se declara después de `animation`, ya que el shorthand reinicia la línea temporal. La mejora se limita con `@supports` y media queries; las propiedades animadas permiten al navegador componer las capas sin recalcular el layout. No se presume aceleración universal. [Guía oficial de Chrome](https://developer.chrome.com/docs/css-ui/scroll-driven-animations), [guía de WebKit](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/).
