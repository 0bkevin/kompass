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

En producción `npm start` sirve interfaz y API desde `PORT`. Requiere un proceso Node persistente y almacenamiento duradero; configura HTTPS y proxy en el host. Esta entrega no despliega un SaaS público ni configura proveedores del operador.

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

YouTube usa un conector oficial opcional. Instagram y TikTok disponen de adaptadores Apify opcionales, pausados hasta configuración y activación. No existe un conector de descubrimiento general de LinkedIn. El acceso a una red depende de sus permisos, condiciones, cuota y disponibilidad; no se accede a sesiones privadas ni se eluden bloqueos.

Apify reserva conservadoramente USD1 antes de cada intento y comparte el presupuesto entre empresas con la misma credencial. `APIFY_DAILY_BUDGET_USD=3` y `APIFY_MONTHLY_BUDGET_USD=30` fijan los límites por defecto; `0` pausa el proveedor. Estas reservas incluyen intentos fallidos y no representan la factura real. La interfaz muestra el estado y los errores por fuente. Hosting, almacenamiento y modelos de IA tienen costos separados.

El análisis audiovisual de referencias requiere Gemini y un medio accesible. No equivale a generar o editar un video final. Los conectores de publicación configurados mantienen su acción explícita y aprobación; los canales sociales sin integración usan planificación/exportación y registro manual.

## Persistencia y operación

`DATA_DIR` contiene SQLite, archivos y la clave de cifrado. Respalda todo el directorio; no copies datos ni credenciales de otro entorno. Credenciales por empresa cifradas en servidor; sesiones HttpOnly, membresías y roles de propietario/editor/revisor. El corpus de audiencia no es un CRM de personas; los datos de autenticación del operador están separados.

`DISCOVERY_ENABLED` y `DISCOVERY_INTERVAL_MS` controlan la búsqueda periódica. Los fallos se muestran por fuente y tienen espera progresiva. La IA contextual requiere `OPENAI_API_KEY` o un proveedor compatible configurado en la empresa; el video usa Gemini. La configuración de ejemplo documenta variables sin incluir secretos.

## Verificación y límites

Los tests usan SQLite temporal y proveedores simulados, incluyendo recorridos HTTP completos, aislamiento entre empresas, aprobación versionada, señales comunitarias, resultados corregibles, presupuestos concurrentes y análisis semántico con citas verificables. Build incluye TypeScript. Ver [validación](docs/VALIDATION.md) y [trazabilidad del audio](docs/TRANSCRIPT-TO-PRODUCT.md).

El funcionamiento real de proveedores sociales/IA de pago no fue validado con credenciales del operador. La precisión de las recomendaciones y el ahorro deben medirse con uso real. La conservación/actualización de datos y permisos de cada API debe revisarse antes de una operación pública prolongada; no se afirma cobertura universal ni preparación de SaaS a escala.

La [auditoría adversarial por funcionalidad](docs/adversarial/SUMMARY.md) registra las pruebas interactivas posteriores, sus resultados esperados/observados y los defectos confirmados fuera de la cobertura de los tests automáticos.

Las [correcciones de la auditoría](docs/remediation/SUMMARY.md) documentan cada responsable independiente, la reproducción del defecto, su resultado corregido y la validación conjunta. Los informes originales se conservan como evidencia de la versión revisada.
