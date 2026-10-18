# Equipo, roles e aislamiento — permissions

Estado: **PARTIAL**. 20 casos PASS, 0 FAIL y 1 BLOCKED. **0 hallazgos confirmados**. El bloqueo corresponde sólo a lectura literal de portapapeles; no es un defecto confirmado de la aplicación.

Instancia: `http://127.0.0.29:4119`. Build existente servido con claves de proveedores retiradas y descubrimiento deshabilitado. Base propia: `/tmp/30x-adversarial-permissions/radar.sqlite`. Cuentas ficticias `qa-permissions@example.com` y `qa-permissions-b@example.com`; logins de navegador secuenciales en un único tab propio. Dos empresas principales; marca auxiliar para probar asignación masiva.

## Casos

| Caso | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| Invitación de editor por enlace | Un propietario crea un enlace de un uso, válido siete días; B obtiene editor al aceptarlo. | UI creó invitación Editor y fecha de vencimiento a siete días. B aceptó el enlace completo por UI; session/state y recarga conservaron editor. | PASS |
| Invitación de revisor por enlace | El rol Revisor elegido por el owner se asigna al nuevo miembro. | Tras retirar B, A creó invitación Revisor por UI. B aceptó enlace completo; equipo y session mostraron reviewer. Sin mensajes externos. | PASS |
| Invitación reutilizada | El enlace consumido debe rechazarse y no duplicar membresía. | Segundo intento UI devolvió invitación vencida/utilizada/no existe; miembros siguieron siendo dos y SQLite marcó un solo uso. | PASS |
| Invitación caducada | Un token vencido no crea membresía ni se consume. | Token sintético API con expires_at=1 en SQLite propia fue rechazado desde UI; permaneció sin usar. | PASS |
| Invitación vacía o inválida | Vacío no se envía y el token inválido ofrece error recuperable. | Aceptar deshabilitado en vacío; invalido produjo Pega un token o enlace de invitación válido. El campo permitió corregir y aceptar una invitación válida. | PASS |
| Roles de invitación no permitidos | Ni owner ni cadena vacía pueden emitirse como invitación. | API de propietario rechazó ambos roles con 400 Rol no es válido. | PASS |
| Copiar enlace: acción y mensaje | El botón debe completar la escritura y dar confirmación. | Dos clics UI mostraron Enlace copiado, sin errores de escritura observados. | PASS |
| Copiar enlace: lectura literal real | Comparar el texto realmente leído del portapapeles con el enlace mostrado. | navigator.clipboard.readText devolvió NotAllowedError: Read permission denied. No se verificó contenido literal global. | BLOCKED |
| Editor modifica por UI y persiste | Editor puede editar una pieza y guardar. | Cambió título por UI, GET confirmó el nuevo título y una recarga lo conservó. | PASS |
| Editor no aprueba ni administra | Editor no aprueba, invita, cambia roles, retira miembros ni configura conectores/contexto. | Aprobar/Solicitar cambios deshabilitados; no controles de miembros en equipo. API devolvió 403 para review, invitations, miembros, brand, integrations y context/commit. | PASS |
| Reviewer lee, comenta y aprueba por UI | Revisor puede leer/comentar/aprobar la versión actual, con edición bloqueada. | Campos editoriales deshabilitados al recargar; comentario UI persistió; Aprobar cambió estado a approved y añadió comentario Aprobada. | PASS |
| Reviewer no crea ni modifica | Revisor no crea/edita piezas, archivos, señales, encuestas, resultados, contexto ni ejecuta IA. | API devolvió 403 para POST/PATCH pieces, assets, audience-signals, polls, outcome, draft/analyze, análisis de oportunidad, referencias y administración. Aprobación con versión inválida devolvió 409. | PASS |
| Owner cambia rol y retira por UI | El propietario cambia permisos y puede retirar un miembro; estado persistente actualizado. | Selector cambió B de reviewer a editor. Retirar redujo miembros de 2 a 1; API posterior denegó acceso del retirado a state y archivo. | PASS |
| Último propietario protegido | Ni cambiar el último owner ni borrarlo puede dejar empresa sin dueño. | UI oculta select/retirar de sí mismo; PATCH role=reviewer y DELETE de último owner devolvieron 409 La marca necesita al menos un propietario. | PASS |
| Aislamiento de corpus y gestión por empresa | Una cuenta ajena no accede a estado, contexto, señales, resultados, encuestas o IA por ID conocido. | Antes de incorporación y tras retirada, B recibió 404 para A; A recibió 404 para B. Se repitió con corpus A existente en todos los tipos probados. | PASS |
| Aislamiento de archivos | Archivo privado sólo accesible a miembros de la empresa; ID ajeno en empresa propia también falla. | Owner leyó archivo sintético. B retirado obtuvo 404 en URL A; pedir mismo assetId bajo empresa B dio 404 Archivo no encontrado. | PASS |
| IDs cruzados y relaciones adivinadas | ID válido de otra empresa no permite editar ni enlazar registro/responsable. | PATCH pieza A bajo B devolvió 404; crear pieza B con referenceId A o assignee A devolvió 400. | PASS |
| Asignación masiva | role, isDemo, userId e id enviados por cliente no elevan permisos ni sustituyen marcas ajenas. | PATCH owner conservó ID A/owner y no añadió isDemo/userId; POST con ID B generó otro ID propio sin flags. Editor inyectó flags al editar pieza; se ignoraron y su rol no cambió. | PASS |
| Revocación durante edición abierta | La siguiente mutación debe usar el rol vigente del servidor. | Editor dejó título modificado sin guardar; A lo cambió a reviewer por API; Guardar UI dio 403 y el título persistido quedó intacto. Tras recarga se bloqueó edición. | PASS |
| Cambio de empresa y URL ajena sin caché de contenido | Al cambiar empresa o abrir pieza ajena no quedan campos/texto del contexto anterior. | Selector A→B mostró sólo pieza B y eliminó texto A del DOM. B sin pertenencia abrió URL A y vio su propia lista B, sin datos de A. | PASS |
| Logout y nuevo login secuencial | Cerrar sesión limpia UI, invalida su sesión y no reusa datos al cambiar cuenta. | Logout mostró formulario sin texto privado; session null y state 401. SQLite redujo en una la sesión B; sucesivos logins A/B mostraron sólo empresas autorizadas. | PASS |

## Evidencia

[Respuestas API, resumen SQLite y observaciones UI](../evidence/permissions-api.json). Las fases de API distinguen cuenta ajena, editor, revisor y miembro retirado. No contienen tokens, cookies ni contraseñas.

- [Edición por editor](../evidence/permissions-editor.png)
- [Guardado denegado tras revocación](../evidence/permissions-revoked-save.png)
- [Comentario y aprobación por revisor](../evidence/permissions-reviewer-approval.png)
- [Rol revisor tras invitación](../evidence/permissions-reviewer-team.png)
- [URL de pieza ajena sin contenido de A](../evidence/permissions-foreign-piece.png)
- [Logout sin contenido privado](../evidence/permissions-logout.png)

## Hallazgos

Ningún fallo confirmado en los casos anteriores. La etiqueta de rol de una pantalla ya abierta permaneció como Editor hasta recargar; el servidor denegó el guardado tras revocación. No se observó escalada de privilegios por ese estado visual.

## Límites

- Lectura real de portapapeles bloqueada por permiso del navegador. Se verificaron botón/mensaje, no la recuperación literal desde clipboard.
- No se enviaron invitaciones por correo ni mensajes externos: el producto sólo generó enlaces locales.
- Proveedores externos y generación de contenido excluidos; las solicitudes IA probadas se limitaron a verificar rechazo de roles/cuentas sin permiso.
- Revocación probada durante una edición abierta antes del guardado; no se midieron carreras dentro de operaciones externas ya en vuelo.
- Fixtures sintéticas API/SQLite y archivo de texto propio; las pruebas no representan datos ni credenciales de producción. Se conservó DATA_DIR completo.
- UI invitación aceptada mediante formulario con enlace completo; no se probó alta de un usuario nuevo directamente desde query invite sin empresa previa.

## Reproducción y cierre

Datos preservados en `/tmp/30x-adversarial-permissions`. `audit/ids.json` identifica empresas, usuarios, pieza, referencia, encuesta y archivo. Los scripts y credenciales sintéticas de reproducción permanecen sólo en el directorio temporal propio; el informe no incluye secretos. La empresa A termina con un único owner y B retirado. Sesión de proceso iniciada: `35204`; al finalizar se detuvo exclusivamente el servidor de puerto 4119 y se cerró el tab propio. No se modificó código de producto ni se ejecutó build/format.
