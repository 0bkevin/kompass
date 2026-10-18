<img src="assets/icon.svg" width="56" height="56" alt="">

# 30X Radar · contenido con contexto

Plataforma para empresas, medios y creadores: empieza por el contenido de una empresa, conecta necesidades de audiencia con evidencia pública y acompaña la pieza hasta su revisión, calendario y resultados. 30X es el caso inicial; cada empresa tiene su propio espacio, marca, audiencias, fuentes y equipo.

## Ejecutar

Requiere Node.js 24 o posterior.

```bash
npm ci
cp .env.example .env
npm run dev
```

La interfaz usa `WEB_PORT` (5173) y la API `PORT` (3001). `RADAR_API_PORT` debe coincidir con `PORT` para el proxy de desarrollo. Si hay otros proyectos activos, cambia los puertos en `.env`.

```bash
npm test
npm run build
npm start
```

En producción `npm start` sirve interfaz y API desde `PORT`. Requiere un proceso Node persistente y almacenamiento duradero; configura HTTPS y proxy en el host. La configuración de proveedores corresponde al operador del despliegue; las empresas heredan los servicios de plataforma sin introducir claves. Esta entrega no despliega un SaaS público.

## Entrar con Google

La [configuración local verificada](docs/google-sign-in/README.md) documenta el proyecto creado y las dos entradas reales con Google en `http://localhost:3026`. Las credenciales de este entorno ya están instaladas privadamente; el proyecto permanece en modo de prueba para localhost.

El operador configura un cliente OAuth de tipo **Aplicación web** en Google Auth Platform, con la marca de la aplicación, público y usuarios de prueba si el proyecto sigue en modo de prueba. Registra el URI de redirección exacto, incluido esquema, dominio, puerto y ruta: `https://radar.tudominio.com/api/auth/google/callback` en producción; por ejemplo `http://localhost:5173/api/auth/google/callback` en desarrollo con el proxy Vite. Usa el dominio y puerto reales del despliegue; no intercambies `localhost` y `127.0.0.1`. Google exige coincidencia exacta con el cliente configurado. Consulta [OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect#settingup) y la [configuración de aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

Guarda `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` en el entorno privado del servidor y reinicia el proceso. No uses el prefijo `VITE_`, no incluyas el secreto en el navegador ni lo guardes en Git. El flujo pide únicamente `openid email profile` para identificar la cuenta; no solicita acceso a Gmail, Drive ni Calendar.

El botón **Continuar con Google** aparece cuando el servidor tiene la configuración completa. Su disponibilidad confirma configuración, no que Google haya aceptado las credenciales o el dominio: valida el recorrido con una cuenta autorizada en ese proyecto antes de habilitarlo para todos. Sin configuración o si no se puede consultar la disponibilidad, siguen funcionando correo/contraseña y la demo. El botón usa el [recurso oficial y las pautas de marca de Google](https://developers.google.com/identity/branding-guidelines); el tipo Google Sans se sirve localmente bajo su licencia OFL.

Una cuenta nueva entra en el asistente de empresa; una cuenta que regresa conserva sus espacios. Si el correo ya pertenece a una cuenta con contraseña, la aplicación exige confirmar esa contraseña y elegir **Entrar y conectar Google** antes de asociarla. Compartir correo no vincula cuentas automáticamente. La cancelación permite volver a intentar o entrar con contraseña, y las invitaciones se conservan al volver.

## Servicios incluidos y configuración de plataforma

Cada empresa nueva recibe fuentes públicas permitidas (Hacker News, GDELT y Google Trends, con país adicional cuando el mercado coincide). Al completar contexto y audiencia, Inicio ejecuta la primera búsqueda automáticamente. Las entradas concurrentes comparten el trabajo; volver a Inicio no repite una consulta completada o fallida. El usuario puede reintentar de forma explícita desde el aviso o actualizar el radar. Los ejemplos no disparan consultas automáticas.

El operador configura la IA una sola vez con `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` y una revisión vigente del proveedor en `SOURCE_ACCESS_POLICY_FILE`. Las claves permanecen en servidor. La configuración de una empresa no puede cambiar el destino o modelo de la credencial compartida. Una empresa puede usar su propia credencial o volver al servicio de plataforma; esto no modifica las demás empresas.

El destino predeterminado usa la API Responses de OpenAI. También se admite la API oficial de texto de Gemini con `OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, su clave de AI Studio como `OPENAI_API_KEY` y un modelo disponible; ese destino usa Chat Completions con salida estructurada. No habilita el análisis de video. La [configuración y pruebas reales de servicios](docs/external-integrations-20261018/README.md) distinguen cuentas conectadas, cuota verificada y servicios aún restringidos. El nivel gratuito de Gemini tiene condiciones de tratamiento distintas del plan de pago y no admite información personal, sensible o confidencial.

```bash
npm run integrations:check
npm run integrations:check -- --require-ai
```

El chequeo inspecciona configuración sin transmitir datos, revelar claves ni ejecutar consultas de pago. `--require-ai` sale con código 1 si falta credencial o revisión. Su resultado no verifica conectividad, cuota ni calidad del proveedor: hace falta una solicitud real para eso. Sin IA disponible, el flujo editorial local continúa y se identifica como tal.

La interfaz muestra los servicios disponibles y mantiene las personalizaciones de IA y conectores adicionales fuera del recorrido inicial. Revisar, planificar y exportar no requieren una conexión. La entrega opcional por webhook requiere el destino autorizado de cada empresa; programar no publica automáticamente.

**Estado de la plataforma en localhost:** Google está conectado. Hacker News y Google Trends respondieron en la nueva [prueba interactiva de fuentes](docs/external-integrations-20261018/discovery.md); GDELT devolvió HTTP 429 y la interfaz mostró el fallo parcial y su recuperación al pausar esa fuente. Gemini de texto está configurado como servicio compartido de plataforma en modo de prueba con contenido público o ficticio, aprobado por el operador; las empresas no necesitan introducir claves. Su prueba de análisis y creación usa material sintético y no permite inferir precisión general ni derechos sobre contenido ajeno. OpenAI permite entrar con la cuenta solicitada, pero no tiene crédito API ni plan de facturación. Los adaptadores sociales y de video permanecen bloqueados. No están activadas todas las integraciones.

## Recorrido completo

1. Crear una cuenta y añadir una empresa desde su web, enlaces públicos o texto propio.
2. Revisar el contexto sugerido y confirmar la primera audiencia y su necesidad.
3. Contrastar perfiles con contenido público, hipótesis editoriales o preguntas comunitarias anónimas.
4. Descubrir referencias y evaluar oportunidades con procedencia, historia, factores editoriales y límites de cobertura.
5. Profundizar con IA opcional: compara necesidades semánticamente y entrega citas literales verificadas. Sin proveedor existe una lectura preliminar por reglas de texto y equivalencias bilingües.
6. Crear un borrador original por audiencia, canal y formato; editar, comentar, enviar a revisión y aprobar la versión vigente.
7. Programar en el calendario y exportar guiones/plan. La programación no publica por sí sola en una red social.
8. Registrar el enlace de una publicación y sus métricas manuales. Comparar resultados por audiencia y canal; el ajuste editorial requiere contenido propio comparable y suficiente muestra.

La pantalla Inicio propone un siguiente paso según el estado del equipo. Configuración avanzada, archivos y exploración detallada quedan disponibles como herramientas secundarias.

## Evidencia y audiencia

El perfil inicial es una hipótesis confirmada por el editor, no una audiencia observada. Un enlace social guardado no equivale a contenido importado ni acceso a seguidores. El inspector diferencia páginas leídas, texto aportado, enlaces guardados y errores, y no sobrescribe el contexto sin revisión.

El sensor comunitario usa preguntas públicas de opciones cerradas y sólo guarda contadores agregados por grupo y tema. No crea registros de participantes. Los resultados desglosados y señales aparecen desde cinco respuestas por grupo. Son respuestas voluntarias, sin verificación de identidad ni garantía de personas únicas o representatividad.

Las oportunidades separan prioridad editorial, crecimiento observado e hipótesis de funcionamiento. El primer muestreo no demuestra crecimiento. Los temas necesitan ventanas temporales comparables; las métricas de redes diferentes no se mezclan. El análisis de factores distingue gancho, formato, tema, momento, atribución y rendimiento, indicando exactamente qué pudo observarse.

## Fuentes y costos

La base admite RSS/Atom, Hacker News, Google Trends RSS y GDELT. Aportan señales diferentes; una noticia o interés de búsqueda no se presenta como crecimiento en LinkedIn. Las fuentes pueden limitar acceso o devolver errores parciales.

La revisión de condiciones de uso bloquea los adaptadores Apify de Instagram/TikTok, Reddit, el análisis editorial de YouTube y el análisis audiovisual de Gemini. Una credencial o una cuenta propia no los activa. Los enlaces sociales pueden conservarse como citas sin leer perfiles ni seguidores.

Webs, feeds adicionales, proveedores de IA y webhooks requieren un permiso revisado por el operador para dominio, ruta y finalidad. `SOURCE_ACCESS_POLICY_FILE` registra esa revisión con vencimiento; no sustituye una autorización real. Las lecturas permitidas respetan robots y vuelven a comprobar cada redirección y el origen del contenido almacenado. Ver la [revisión por funcionalidad](docs/compliance/README.md), sus fuentes oficiales y restricciones.

Los límites de reservas Apify se conservan para auditar usos previos, pero no se ejecutan Actors en este despliegue. Hosting, almacenamiento y modelos de IA tienen costos separados. Publicar requiere contenido aprobado, permiso del destino y una acción explícita; el calendario organiza fechas y no publica por sí solo.

## Persistencia y operación

`DATA_DIR` contiene SQLite, archivos y la clave de cifrado. Respalda todo el directorio; no copies datos ni credenciales de otro entorno. Credenciales por empresa cifradas en servidor; sesiones HttpOnly, membresías y roles de propietario/editor/revisor. El corpus de audiencia no es un CRM de personas; los datos de autenticación del operador están separados.

`DISCOVERY_ENABLED` y `DISCOVERY_INTERVAL_MS` controlan la búsqueda periódica. Los fallos se muestran por fuente y tienen espera progresiva. La IA contextual requiere una credencial y una revisión vigente del proveedor para esa finalidad; el video permanece restringido. La configuración de ejemplo documenta variables sin incluir secretos.

## Verificación y límites

Los tests usan SQLite temporal y proveedores simulados, incluyendo recorridos HTTP completos, aislamiento entre empresas, aprobación versionada, señales comunitarias, resultados corregibles, presupuestos concurrentes y análisis semántico con citas verificables. Build incluye TypeScript. Ver [validación](docs/VALIDATION.md) y [trazabilidad del audio](docs/TRANSCRIPT-TO-PRODUCT.md).

El funcionamiento real de proveedores sociales o de IA de pago no fue validado; la prueba de Gemini usa cuota gratuita y material sintético en un entorno aislado. La precisión de las recomendaciones y el ahorro deben medirse con uso real. La conservación/actualización de datos y permisos de cada API debe revisarse antes de una operación pública prolongada; no se afirma cobertura universal ni preparación de SaaS a escala.

La [auditoría adversarial por funcionalidad](docs/adversarial/SUMMARY.md) registra las pruebas interactivas posteriores, sus resultados esperados/observados y los defectos confirmados fuera de la cobertura de los tests automáticos.

Las [correcciones de la auditoría](docs/remediation/SUMMARY.md) documentan cada responsable independiente, la reproducción del defecto, su resultado corregido y la validación conjunta. Los informes originales se conservan como evidencia de la versión revisada.
