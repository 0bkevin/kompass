# Verificación pública de kompass — 2026-10-18

Dominio comprobado: https://kompass.kevinbravo.com. Las pruebas usan empresas y material de QA identificados como tales. No son resultados de clientes ni evidencia de ahorro, conversión o consumo de audiencia.

## Código, historial y comprobaciones

- La base visual se fusionó en [PR2](https://github.com/0bkevin/kompass/pull/2). El informe y texto gestionado se fusionaron en [PR3](https://github.com/0bkevin/kompass/pull/3), merge `60c655a2f3bb6a4e85cef902f041e15360adf3ea`, fuente aprobada `e47de7c0452e3c4497b1ebf0f96e2392974ee48b`. Se preservó el historial, sin squash.
- La suite completa de esa fuente pasó **756/756**, sin fallos ni omitidas, en 45,84 s. Log: `/tmp/kompass-e47de7c-tests.log`. `npm run build` incluye Vite de producción y `tsc -b`; ambos pasaron.
- La revisión independiente de interfaz dio `ship` al informe, creación de borrador y observaciones manuales. La documentación preservó el sistema visual. [Evidencia local del recorrido](../.impeccable/review/challenge/validation.json).
- El despliegue de `60c655a` pasó **56 comprobaciones HTTP públicas**, comprobación de paquete y verificación del servicio real. El montaje de solo lectura tiene unidad persistente y dependencia del servicio. No se reinició la VM para probar un arranque completo. Se verificaron backup y conservación de SQLite, autenticación, uploads y Caddy.

## Recorrido real desde el navegador colaborativo

1. Crear cuenta desde el formulario público. Crear empresa y audiencia sin claves de proveedor. Entrar al espacio inició una búsqueda con las fuentes ya configuradas: se guardaron 49 referencias públicas; se añadieron dos textos originales de QA.
2. Abrir `/research`: HTTP200, 51 referencias del período; 49 con fecha de publicación y dos solo con fecha de observación. Se comprobó que el filtro por segmento funciona. Esta prueba detectó propuestas sin relación con la audiencia en la selección inicial. `ae11f3c` corrige su selección antes del límite de diez; conserva el corpus, cobertura y contexto de decisiones. Sus 35 pruebas enfocadas pasaron. Su confirmación pública corresponde al despliegue posterior a este registro.
3. La misma empresa heredó `provider=codex-chatgpt`, `managedBy=platform`, `hasOverride=false`, `ready=true` y permiso vigente. Un POST normal a `/draft`, con material original y audiencia Directivos, guardó un guion de 924 caracteres en **9,488 s**, `generationEngine=ai`. No se aceptó un borrador heurístico como prueba de IA.
4. Abrir la pieza guardada en Studio: «Asistencia IA», texto y audiencia correctos. Exportar el Markdown: descarga de **1335 bytes**. Enviar a revisión, aprobar y agendar desde los controles reales. La pieza quedó `scheduled`, con fecha `2026-10-19T16:03:00.000Z`, y apareció en calendario. Exportar CSV: descarga de **1400 bytes**. No hubo publicación en una red.
5. En escritorio y móvil se comprobaron rutas, sesión y ausencia de desbordamiento de documento. El calendario conserva su desplazamiento horizontal interno. La consola no mostró errores nuevos durante el recorrido. La comprobación local del informe incluyó apertura con Enter y foco visible de 2px; texto secundario sobre fondo principal: contraste 8,29:1. Esta pasada no emuló `prefers-reduced-motion`: el informe no añade animaciones y se conservaron las reglas globales existentes.

Empresa QA del recorrido: `93f3ae00-b385-4eb4-b702-54b43a676fdd`. Pieza: `67e5879c-ef63-4dcc-b5b3-be41fd20dc75`. Los IDs permiten revisar la evidencia sin exponer credenciales.

## Generación real de medios y contadores oficiales

El agente de despliegue verificó imágenes y video mediante la API autenticada normal, en otra empresa de QA. Se generó una ilustración de **1672×941** y un **MP4 H.264 de 720×1280, 9,583 s**, con animación y subtítulos, sin audio. Ambos se descargaron con HTTP200. Los archivos se volvieron a descargar tras cambiar a `60c655a`, con hashes idénticos, y la comprobación de capacidades dentro de la unidad real pasó. La imagen y un fotograma se abrieron para inspección visual.

La autenticación procede de la sesión normal de ChatGPT de la VM, expuesta en solo lectura al usuario del servicio. No se copiaron tokens. Los clientes nuevos heredan la generación gestionada; no necesitan introducir claves. La vía de texto gestionado no hace fallback a una API de pago.

YouTube respondió en el catálogo público. Una prueba separada sobre un video público ajeno, rotulado expresamente como QA, sincronizó un registro sin errores: `origin=official_api`, `lastSyncedAt=2026-10-18T16:02:01.262Z`. Sus contadores oficiales eran cero; no se sustituyeron por cifras inventadas. Se confirmó intervalo de 60 minutos y se retiró el enlace de QA para evitar consultas periódicas innecesarias. Los datos de YouTube no se enviaron a IA.

El informe operativo y archivos se conservan fuera del checkout, sin secretos:

- `/workspace/t3-persistent/kompass-operations/20261018/release-60c655a.md`
- `/workspace/t3-persistent/kompass-operations/20261018/production-services-qa/qa-illustration.png`
- `/workspace/t3-persistent/kompass-operations/20261018/production-services-qa/qa-animated-video.mp4`
- `/workspace/t3-persistent/kompass-operations/20261018/final-production-qa/evidence.json`

## Límites que siguen siendo reales

Instagram, LinkedIn y TikTok no tienen conexión oficial. El calendario agenda; la exportación permite publicar manualmente. El MP4 no es metraje generativo ni incluye voz. La afinidad editorial es una hipótesis sobre la audiencia declarada; la comparación histórica requiere observaciones comparables. Las respuestas voluntarias de comunidad y los registros manuales conservan su procedencia. Los filtros de texto no equivalen a detección completa de datos personales en imágenes o archivos.
