# Texto esencial en la aplicación

El usuario pidió retirar por completo consejos, promoción, introducciones y explicaciones que no sean necesarias para usar la aplicación. La landing pública y el guion del pitch pertenecen a recorridos separados.

## Cambios

- Títulos de tarea: Inicio, Empresa, Audiencia, Oportunidades, Contenido, Calendario, Resultados, Archivos y Referencias.
- Acceso reducido a marca, formulario y acciones. Eliminados el panel narrativo, los ejemplos explicativos, el lema del pie y el eslogan del título de las rutas de trabajo.
- Retiradas las introducciones de página, tarjetas de consejos, descripciones repetidas, avisos genéricos y texto de ayuda que solo repetía una etiqueta.
- Estados vacíos con título y acción; el cuerpo explicativo es opcional. Formularios y pasos de configuración conservan sus etiquetas y requisitos.
- El resumen de oportunidades de Inicio muestra título y estado; el texto completo sigue en la oportunidad. El editor omite dos notas de consejo genéricas conocidas por coincidencia exacta, conservando el resto de los datos del brief.
- Eliminados estilos de los bloques retirados. La documentación del sistema refleja el formulario de acceso de una columna y la regla de texto esencial.

Se mantienen datos, contenido guardado, procedencia, hipótesis, errores y recuperación, permisos, costes, disponibilidad, confirmaciones y consecuencias de las acciones. Los límites se expresan donde afectan a una decisión: publicar, enviar datos a un proveedor, subir archivos o reemplazar información.

## Comprobaciones

- 591 tests aprobados; build de producción y TypeScript aprobados. No se añadieron dependencias ni tests que repliquen cadenas de texto.
- Once rutas revisadas en el navegador colaborativo a 1440 × 900 y 390 × 844. Sin desbordamiento de página ni fallos en el contraste del texto visible comprobado. Revisión inicial y confirmación de Inicio tras retirar el resumen duplicado.
- Acceso revisado en ambos tamaños; login con una cuenta local de prueba, captura de referencia y creación → revisión → aprobación → programación de una pieza comprobados mediante la UI.
- Formulario público, etiquetas, estados, descripción accesible y diálogo de programación comprobados. Sin errores en la muestra de consola consultada.
- Revisión independiente y acotada del diff: sin cambios en handlers, sesión, permisos, recuperación o confirmaciones. Impeccable orientó el recorte y las dos pasadas de navegador; no-ai-slop orientó la edición.

Las capturas y sus resultados están en `.impeccable/review/essential-copy/validation.json`. Las comprobaciones de contraste cubren los textos visibles de esos estados, no una certificación completa de accesibilidad. No se ejercitaron proveedores externos que requieren credenciales.

El guion se trabaja en [otro hilo de T3 Code](t3-thread://v1/mcp:626b4931-260f-4aba-ac20-209ed896d941), con rama y worktree propios (`content/kompass-video-pitch`). Allí se estudió la slide y se entregó una primera versión de menos de tres minutos, disponible para seguir editándola.
