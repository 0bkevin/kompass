# Auditoría adversarial: autenticación

Resultado: **PASS** en 14 casos seleccionados. **14 PASS, 0 FAIL, 0 BLOCKED. Sin hallazgos confirmados.**

Revisión independiente del build existente, realizada el 2026-10-18. Se leyeron PRODUCT.md, docs/TRANSCRIPT-TO-PRODUCT.md, README.md y docs/IMPLEMENTATION.md. No se modificó implementación ni se leyeron informes ajenos.

Entorno aislado: `http://127.0.0.11:4101`, `DATA_DIR=/tmp/30x-adversarial-auth`, discovery deshabilitado y cuatro claves de proveedor excluidas del proceso. Proceso propio PID 3826747, sesión exec 59606. Navegador T3 incognito, pestaña propia `tab_3m_07e54779-9ab2-4979-8a15-674c4eff160a`; se utilizó explícitamente en todas las operaciones. Los flujos revisados se accionaron en la UI; API y SQLite sólo corroboraron identidad, permisos y persistencia. Cuenta normal ficticia: qa-auth@example.com. La segunda identidad fue creada por el botón de demo.

## Casos

| Caso | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| Ruta inicial sin sesión | La ruta /home debe mostrar acceso/registro, sin datos privados. | / redirige a /home y muestra el formulario de registro; API session no presenta usuario. | PASS |
| Registro vacío | Registro vacío: no debe crear cuenta ni abrir sesión; debe indicar campos requeridos. | El navegador bloqueó envío y marcó los tres campos requeridos; continúa sin sesión. | PASS |
| Alta con correo inválido y contraseña corta | Correo mal formado y contraseña de menos de 10 caracteres: deben impedir el alta hasta corregirse. | El navegador marcó email inválido y longitud inferior a 10; /api/session devuelve user:null y brands:[]; no se creó sesión. | PASS |
| Registro válido tras corregir datos | Al corregir credenciales válidas, debe crearse exactamente una cuenta sin marcas ni contenido demo. | POST register 201; aparece alta de empresa. SQLite contiene una cuenta QA Auth / qa-auth@example.com, una sesión y cero marcas. | PASS |
| Sesión persistente en recarga y ruta directa | La sesión registrada debe sobrevivir recarga y acceso directo a /studio manteniendo el mismo usuario y el alta de empresa pendiente. | Recarga /home y entrada directa /studio conservan el ID y correo de QA Auth, brands=[] y el asistente de empresa; document.cookie no expone radar_session. | PASS |
| Logout y ruta directa sin sesión | Cerrar sesión debe borrar la sesión del servidor, mostrar acceso y mantener el cierre tras recarga. | Logout devuelve al registro; navegación completa a /studio sigue mostrando registro. /api/session devuelve user:null, brands:[]; SQLite sessions=0. | PASS |
| Correo duplicado con mayúsculas | Registrar de nuevo el mismo correo, incluso cambiando mayúsculas, debe devolver conflicto sin segunda cuenta ni sesión. | La UI muestra Ya existe una cuenta con este correo (409); persiste una cuenta y cero sesiones. /api/session continúa anónimo. | PASS |
| Login con contraseña incorrecta | Contraseña errónea: debe presentar error genérico y mantener user:null, sin abrir sesión. | POST login 401; alerta Correo o contraseña incorrectos; user:null y brands:[], formulario conservado para corregir. | PASS |
| Login válido tras corregir contraseña | Corregir la contraseña debe entrar en la misma cuenta existente, sin duplicarla ni añadir ejemplos. | Login 200; vuelve al alta de empresa con mismo ID QA Auth y brands:[]; no mezcla contenido. | PASS |
| Entrada demo separada de cuenta normal | Tras cerrar la cuenta normal, Explorar con datos de ejemplo debe crear una identidad demo distinta y una marca identificada como demo. | POST demo 201 crea Explorador de Radar con ID distinto y una sola marca 30X · espacio de ejemplo, isDemo:true; UI identifica el espacio de ejemplo. | PASS |
| Persistencia demo y protección tras logout | La sesión demo debe persistir en recarga sin recrear usuario/marca; al cerrarla, rutas privadas y APIs conocidas deben pedir autenticación. | Recarga conserva el mismo usuario demo y misma marca; logout seguido de /settings muestra registro. /api/session devuelve user:null y brands:[], sin contenido del espacio. | PASS |
| Regreso a cuenta normal tras demo | Volver a la cuenta normal después de demo debe conservar su identidad y sus marcas vacías; no debe autorizar leer el espacio demo. | Login recupera ID y correo originales QA Auth con brands:[]; no aparecen ejemplos. SQLite muestra QA Auth con cero membresías y Explorador con una. Se revalidó el endpoint /state de la marca demo: 404 No se encontró la marca. | PASS |
| Sesión expirada (fixture sintética) | Con la expiración de la sesión adelantada únicamente en la base sintética propia, recargar debe invalidar acceso y solicitar autenticación. | Se adelantó expires_at a 1 en la única sesión normal mediante SQLite propia. Recarga /home muestra registro; session user:null, brands:[] y GET state demo responde 401. | PASS |
| API de marca demo desde cuenta normal | Una cuenta normal autenticada no debe leer /state de la marca demo; debe responder sin datos de esa marca. | La cuenta QA Auth reautenticada recibe 404 No se encontró la marca en /state del espacio demo, sin datos de marca ni contenido. | PASS |

## Hallazgos

No se confirmó un defecto en el alcance revisado. La cuenta normal conservó su identidad y sus cero marcas antes y después de la demo. La demo creó una identidad diferente y una marca `isDemo:true`. La cuenta normal no pudo leer el estado de esa marca; la respuesta 404 ocultó su existencia. Después de logout o expiración, la API no reveló usuario ni marcas y las rutas directas presentaron acceso.

La consulta de SQLite tras el alta válida confirmó users=1, sessions=1 y brands=0; tras el primer logout, sessions=0; tras la demo, había dos usuarios y una única membresía, perteneciente a Explorador de Radar. No se usaron ni guardaron tokens, cookies o contraseñas en estos informes.

## Evidencia

- [Cuenta normal después de login/ruta directa](../evidence/auth-normal-session.png).
- [Registro duplicado rechazado](../evidence/auth-duplicate.png).
- [Contraseña incorrecta rechazada](../evidence/auth-wrong-password.png).
- [Identidad y espacio demo](../evidence/auth-demo.png).
- [Ruta /settings tras cerrar sesión](../evidence/auth-anonymous-route.png).
- [Recarga con sesión expirada](../evidence/auth-expired.png).

## Límites

- Revisión acotada de autenticación en el build existente con Chromium de T3 a 1280×800; no prueba cobertura universal, otros navegadores, despliegue HTTPS ni proxies.
- La expiración se provocó adelantando expires_at de una única sesión en la SQLite temporal propia; no se esperaron 30 días reales.
- El acceso demo se ejercitó desde UI con sus datos ilustrativos; no demuestra exactitud editorial ni integración con proveedores.
- No se ensayaron agotamiento de rate limit, concurrencia masiva ni recuperación de contraseña (sin flujo visible en esta revisión).

## Reproducción y cierre

Se conservó la base temporal propia, incluida una fila de sesión expirada artificialmente para el caso de expiración. Al finalizar se cerró la sesión vigente desde UI y se terminó únicamente el PID 3826747. Puede reiniciarse el mismo build con el DATA_DIR y puerto indicados, sin las claves de proveedor. El detalle estructurado de los casos está en [auth.json](auth.json).
