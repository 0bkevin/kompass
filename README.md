# 30X Radar

Un espacio editorial para encontrar contenido emergente en otros mercados, evaluar su relación con una marca y convertir referencias en guiones y un plan de contenido.

Primera versión funcional con descubrimiento real de fuentes públicas. Web en español, varias marcas por cuenta y datos persistentes. Ya se pueden examinar videos existentes cuando hay un medio accesible; generar o editar videos sigue pospuesto por decisión del usuario: [backlog](docs/BACKLOG.md).

## Ejecutar

Requiere **Node.js 24 o superior**.

```bash
npm ci
cp .env.example .env
npm run dev
```

Interfaz: **http://localhost:5173**. API: http://localhost:3001. Crea tu cuenta y configura marca, sector, temas y audiencia. También puedes explorar una demo con datos explícitamente identificados y después pulsar **Buscar tendencias** para obtener hallazgos reales.

```bash
npm test
npm run build
npm start
```

`npm start` sirve la aplicación compilada y la API en `PORT` (3001 por defecto). El servidor debe permanecer activo para las búsquedas periódicas.

La interfaz usa TanStack Start y rutas limpias; la API sigue en Express. Consulta [la migración y su estado de QA](docs/TANSTACK-START-MIGRATION.md) y la [matriz de aceptación](docs/TANSTACK-START-MIGRATION-QA.md).

## Arquitectura y rutas

Node.js 24 o superior ejecuta Express 5 y TanStack Start. En desarrollo, Vite sirve la interfaz en `5173` y Express expone solo la API en `3001`; Vite dirige `/api` a Express. `npm run build` genera los bundles cliente y servidor de Start y luego ejecuta `tsc -b`. En producción, `npm start` ejecuta `server/start-host.mjs`: Express atiende la API y los archivos estáticos, y entrega las demás solicitudes web al handler `fetch` de TanStack Start. Start genera el documento HTML; la rama privada del espacio de trabajo usa `ssr: false` para conservar el arranque actual de sesión, el contexto React y las llamadas a la API desde el navegador.

Las rutas del espacio de trabajo son `/radar`, `/inbox`, `/studio`, `/studio/:pieceId`, `/assets`, `/audience`, `/brand`, `/calendar` y `/settings`. `/` redirige a `/radar` conservando la búsqueda. Los enlaces heredados con hash se convierten a rutas limpias y conservan parámetros como `invite`; los formularios sucios mantienen el bloqueo de navegación. Las rutas web desconocidas muestran el 404 en español y las rutas `/api` desconocidas responden JSON con estado 404. La API sigue siendo Express: esta entrega migra el framework web y el enrutamiento, no reescribe sus funciones como server functions de Start.

En producción, el mismo proceso persistente inicia el planificador una sola vez y mantiene SQLite, archivos privados y la clave de cifrado dentro de `DATA_DIR`. El despliegue requiere un host Node persistente y almacenamiento local duradero; no incluye un worker separado ni almacenamiento de objetos. Los conectores externos siguen siendo opcionales y algunos pueden tener costo. La generación y edición de videos continúan en el backlog.

## Qué está implementado

- Registro e inicio de sesión con contraseña, sesiones HttpOnly y persistencia SQLite.
- Varios espacios de marca por cuenta, contexto editorial y perfiles de audiencia editables.
- Fuentes configurables: Hacker News, Google Trends RSS, GDELT y RSS/Atom. YouTube Data API y Apify para Instagram/TikTok son conectores sociales opcionales, deshabilitados hasta que se configuren y activen. Reddit es opcional y sujeto a acceso autorizado.
- Descubrimiento manual y periódico, deduplicación, historial de métricas y procedencia de cada referencia. Un fallo de una fuente no descarta el resto.
- Prioridad explicable y distinción entre popularidad, crecimiento observado y contenido sin evidencia suficiente. Afinidad preliminar por palabras clave bilingües; no es comprensión semántica ni predicción de viralidad.
- Captación de enlaces, texto y archivos del equipo. Análisis de texto orientativo local o con IA; examen audiovisual opcional de videos accesibles mediante Gemini.
- Guiones editables por audiencia y canal, asignación, comentarios, revisión y aprobación. Cambiar una pieza aprobada requiere renovar su aprobación.
- Grilla mensual/semanal, planificación por fecha, piezas pendientes y exportación CSV; exportación Markdown de guiones.
- Biblioteca privada de archivos, equipos e invitaciones de un solo uso con roles de propietario, editor y revisor.
- Conectores opcionales de Telegram y webhook, con credenciales cifradas. El calendario **no publica automáticamente**. Los conectores de entrega requieren configuración y una acción explícita vía API; la interfaz actual prioriza exportación y planificación.

## La estrategia de fuentes gratuitas

La base elegida es **Hacker News + Google Trends RSS + RSS del sector**, ampliada por **GDELT**. Cada fuente aporta una señal diferente: interacción en su comunidad, interés de búsqueda, novedades editoriales o cobertura de noticias. No se mezclan contadores como si midieran lo mismo.

- [Investigación completa y fuentes oficiales](docs/RESEARCH-TREND-DISCOVERY.md): alternativas, costos, permisos, limitaciones y pruebas reales de acceso.
- [Conectores y criterios de ranking](docs/INTEGRATIONS.md): configuración, datos observados y significado de las etiquetas.

El acceso a estas fuentes no necesita una API de pago en la configuración inicial. Eso no hace gratuitos el hosting, almacenamiento ni una IA externa. Las fuentes pueden aplicar límites o devolver errores: GDELT respondió HTTP 429 en una prueba de integración, que se muestra como cobertura parcial.

Las fuentes sociales requieren credenciales y pueden consumir cuota o crédito de proveedor. Configura por marca YouTube/Apify en **Configuración → Fuentes y equipo → Exploración social y video**, o define `YOUTUBE_API_KEY` y `APIFY_API_TOKEN` en el servidor. Las búsquedas sociales empiezan pausadas y una ejecución no equivale a cubrir toda una red; consulta los [límites y el alcance de los conectores](docs/INTEGRATIONS.md).

## Datos y configuración

`DATA_DIR` contiene `radar.sqlite`, `uploads/` y `.encryption-key`. Respalda **el directorio completo**: la clave permite recuperar las credenciales cifradas. No se versionan datos, sesiones, archivos subidos ni secretos.

`DISCOVERY_INTERVAL_MS` fija la cadencia global de búsqueda (30 minutos por defecto, mínimo 10). `DISCOVERY_ENABLED=false` la desactiva. El planificador comparte el bloqueo con la búsqueda manual y aplica espera progresiva si todas las fuentes fallan.

Para obtener señales útiles, configura temas concretos de la marca y feeds del sector. El filtro **Solo mi contexto** usa afinidad preliminar; puedes desactivarlo para explorar contenido general. Las consultas inglesas y la expansión de términos frecuentes ayudan a buscar fuera del mercado local; no sustituyen una búsqueda semántica completa.

El análisis habitual de referencias trabaja con texto y metadatos. Para examinar las imágenes, el texto en pantalla y el audio de un video existente, usa **Examinar video** y configura Gemini en Ajustes o mediante `GEMINI_API_KEY`/`GEMINI_MODEL` en el servidor. Admite videos públicos de YouTube, archivos MP4 privados de la marca y medios audiovisuales accesibles de referencias verificadas de Instagram/TikTok. El analizador acepta hasta 50 MB y 20 minutos. El formulario de referencia admite cargas de hasta 50 MB; la pantalla Biblioteca limita sus cargas a 25 MB. El análisis envía el video al proveedor Google Gemini y el uso puede tener costo según la cuenta y el modelo. No analiza capturas como si fueran el video completo. La generación y edición de videos continúa en el backlog.

## Validación y límites de esta entrega

La migración se validó con `npm run build` y `npm test` (102/102). La aceptación en navegador cubrió autenticación, onboarding, rutas y enlaces profundos, historial, formularios sin guardar, invitaciones de un solo uso, el flujo de referencia a calendario y archivos privados. El primer recorrido de producción encontró un bucle al abrir `/assets`; el servidor ya lo corrige y un segundo retest confirmó la carga directa, la normalización de la barra final y los assets compilados. Consulta el [informe inicial](docs/TANSTACK-START-MIGRATION-RESULTS.md), el [retest](docs/TANSTACK-START-MIGRATION-RETEST.md), las [resoluciones](docs/TANSTACK-START-RESOLUTIONS.md) y la [matriz de aceptación](docs/TANSTACK-START-MIGRATION-QA.md).

La aceptación fue acotada: no se llamaron proveedores externos. La migración no repitió las advertencias al cerrar o recargar pestañas, la invitación de una cuenta ya existente ni el reinicio del proceso con el mismo `DATA_DIR`; la matriz conserva esos y otros checks como referencia, sin marcarlos como ejecutados.

La estimación de repetición se limita al corpus observado de la marca. Un tema ausente de una selección no demuestra ausencia en Latinoamérica. El primer snapshot nunca demuestra crecimiento.

Esta es una aplicación local/autohospedada inicial. Recuperación de contraseña por email, facturación, despliegue público y operación de SaaS a escala quedan en el backlog. Para desplegar con HTTPS detrás de un proxy, revisa `TRUST_PROXY`, `COOKIE_SECURE` y `TRUSTED_ORIGINS` en `.env.example`.
