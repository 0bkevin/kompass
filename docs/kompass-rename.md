# Cambio de nombre a kompass

El usuario pidió llamar **kompass**, en minúsculas, a toda la aplicación. El cambio cubre landing, acceso, onboarding, navegación, pie de página, preguntas públicas, metadatos, favicon, ejemplos nuevos, mensajes del servidor y documentación de producto. La landing conserva «Le damos dirección a tu contenido», sus dos tipografías y el navbar compacto.

La identidad visual nueva sigue limitada a la landing. El cambio de nombre sí alcanza toda la aplicación.

## Compatibilidad

- La empresa seleccionada se lee desde la clave anterior y se guarda como `kompass-brand`, eliminando la clave anterior después de guardarla. Las sesiones existentes, las empresas y el contenido guardado se conservan.
- Cookie, SQLite, variables de entorno e identificadores OAuth mantienen sus nombres técnicos para evitar invalidar instalaciones existentes.
- Las solicitudes públicas se identifican como kompass. Las restricciones de robots dirigidas al nombre anterior siguen aplicándose; renombrar el lector no concede acceso adicional.
- Las capturas, registros de pruebas e identificadores externos históricos conservan los hechos del momento en que se obtuvieron. El código no cambia el nombre del proyecto o consentimiento en la consola de Google; el documento de Google identifica esos nombres como históricos.

## Verificación del 18 de octubre de 2026

- `npm test`: **591/591**.
- `npm run build`: compilaciones cliente/servidor y TypeScript correctos, también después del ajuste final de nombre en Configuración.
- Tres pruebas de selección de empresa: migración, prioridad de la clave actual y almacenamiento bloqueado.
- Revisión independiente del diff: sin bloqueos; se corrigieron dos referencias al nombre de la app en Configuración.
- Navegador colaborativo de T3, servidor propio en 5188/3038: landing a 1280 × 800 y 390 × 844, registro desde el CTA, acceso, demo explícita, pregunta comunitaria y página no encontrada. Ninguna de estas superficies muestra el nombre anterior del producto.
- Continuidad real en navegador: se creó una empresa sintética adicional en la demo, se guardó su selección con la clave anterior y se recargó. Se conservaron usuario y empresa; la nueva clave quedó guardada y la anterior se eliminó.
- Demo desde la landing: recorrido hasta `/home` sin errores capturados de JavaScript. El favicon devuelve el SVG de kompass.

Durante la edición se invalidó una exportación en la caché HMR de Vite. Reiniciar exclusivamente el servidor de este worktree restableció el módulo; las comprobaciones y capturas se hicieron después de ese reinicio.

## Capturas actuales

- [Landing de escritorio](../.impeccable/review/kompass/desktop.png)
- [Landing móvil](../.impeccable/review/kompass/mobile.png)
- [Registro](../.impeccable/review/kompass/auth.png)
- [Aplicación con selección conservada](../.impeccable/review/kompass/workspace.png)
- [Pregunta pública](../.impeccable/review/kompass/community.png)
