# Contrato de cobertura de descubrimiento

Implementación sobre `30c3868`: `server/discovery-coverage.mjs`. No añade rutas,
conectores, dependencias ni permisos. `buildDiscoveryCoverage` inspecciona los
datos suministrados y devuelve un objeto JSON; no lee SQLite, archivos de
permisos, variables de entorno, red ni reloj. No autoriza nuevas lecturas.

```js
import { buildDiscoveryCoverage } from "./discovery-coverage.mjs";

const coverage = buildDiscoveryCoverage(brand, {
  references, // Registros de UNA empresa, con la procedencia original.
  sources, // Registros de esa empresa, con accessPolicy evaluado en servidor.
  socialConnections, // Opcional: resultado público de socialConnections().
  now: Date.now(), // El integrador proporciona el reloj; también admite ISO/Date.
});
```

El integrador obtiene los registros y evalúa los permisos vigentes **antes** de
llamar. Para feeds adicionales debe aportar `source.accessPolicy` obtenido con
`sourceAccessPolicy(source)`. Para contenido recuperado de webs o feeds debe
aportar `reference.accessPolicy` obtenido con `referenceUsePolicy(reference,
source)`. Esto permite comprobar fuera del módulo la revisión de la ruta,
finalidad y cadena de redirecciones. Sin ese resultado, la lectura adicional no
queda acreditada. Los casos estáticos HN, GDELT y el RSS oficial exacto de Trends
se reconocen con la política existente, sin consultar revisiones del operador.
Los snapshots son datos internos del servidor, **nunca permisos aceptados desde
un cuerpo de petición del navegador**. Las plataformas restringidas no se
habilitan con un snapshot `{allowed: true}`.

No usar `publicReference()` como entrada: su representación restringida oculta
procedencia necesaria para este inventario. El resultado del módulo no contiene
textos, títulos de referencias, autores, URLs almacenadas, métricas, nombres o
identificadores de canales ni diagnósticos originales del proveedor. Conserva
sólo IDs técnicos válidos de empresa/fuente y URLs constantes de documentación
de los proveedores. El llamante conserva la responsabilidad del aislamiento;
SQLite elimina `brandId` del JSON guardado. Si un registro sí incluye un
`brandId` distinto, se excluye de forma adicional.

## Forma del JSON, versión 1

- `version`, `policyVersion`, `identityVersion`: versiones del contrato, política
  existente y reglas de identidad de publicaciones.
- `brandId`: ID técnico o `null`; `asOf`: instante ISO o `null`; `scope`:
  `stored_non_demo_references`.
- `summary`: `counts`, `dates`, `configuredSources`, `enabledSources`,
  `verifiedSources` y contadores de referencias demo/ajenas y fuentes ajenas
  excluidas. Siempre excluye referencias marcadas `isDemo`.
- `sources[]`: `id`, `network`, `type`, `configured`, `enabled`, `permission`,
  `verification`, `counts`, `dates`, `errors`. Una fuente guardada está
  configurada, aunque esté deshabilitada, restringida o nunca haya respondido.
- `networks[]`: `id`, `name` canónico, `kind`, `sourceIds`, `configuredSources`,
  `enabledSources`, `verifiedSources`, `editorialAnalysisAllowed`,
  `permittedPurposes`, `officialConnection`, `counts`, `dates`, `errors`.
- `errors[]`: errores seguros por fuente o sincronización oficial. Cada error
  tiene `sourceId` o `null`, `stage` (`collection` / `official_sync`), `code`,
  `httpStatus` o `null`, `occurredAt` o `null`, `message` fijo. Los de
  sincronización oficial añaden `network`. No se inventa una fecha de error a
  partir de la fecha del último éxito.
- `limitations[]`: límites esenciales del inventario para acompañar el informe.

`permission` contiene `allowed`, `state`, `basis`, `reason`, `purpose` y,
cuando la política estática lo proporciona, `termsUrl`. `state` distingue
`allowed`, `restricted`, `unverified`, `expired`. `basis` distingue política
estática, snapshot del servidor, revisión ausente o adaptador sin soporte.
`purpose` identifica `rss` o `discovery_metadata`; no es un permiso de análisis
audiovisual ni una autorización para consultar al proveedor de IA.

`verification` contiene `verified`, `status`, `lastSyncedAt`,
`lastSuccessAgeHours`, `lastAttemptAt`, `lastResultCount`. Un éxito guardado con
fecha válida, permiso vigente y sin error posterior acredita la sincronización;
un resultado de cero también es un éxito. No verifica conectividad actual.
Una fuente deshabilitada puede conservar un éxito histórico; `enabled` expresa
por separado si está activa. Un error conserva la fecha del último éxito, pero
`verified` pasa a `false`. No se acepta un éxito futuro. `status` añade `error`
y `not_verified` a los estados de permiso. `lastResultCount` es el tamaño
registrado de la última consulta, nunca el total de publicaciones únicas.

## Cantidades y lectura

Cada `counts` tiene la misma forma en resumen, fuentes y redes:

- `records`, `uniqueReferences`, `duplicateRecords`.
- `retrievedText`, `providedText`, `metadataOnly`, `linkOnly`, `unavailable`:
  categorías excluyentes, cuya suma es `uniqueReferences`. `retrievedText`
  acredita texto recuperado con procedencia y permiso; puede ser sólo una
  descripción o extracto. `providedText` indica texto aportado sin atribuirlo a
  la lectura del enlace. Texto legado de un conector sin prueba de lectura
  permanece en `metadataOnly`. Un archivo adjunto sin texto observado permanece
  en `unavailable`; no se simula extracción.
- `pageReads`, `feedReads`, `linkedWithoutPageRead`: dimensiones que pueden
  solaparse con las categorías anteriores. `pageReads` acredita recuperación
  de texto/metadatos con finalidad `website` o `metadata`; no prueba lectura
  integral del artículo ni reproducción de video. Leer un feed no lee sus
  artículos enlazados. Un título obtenido vía HN/GDELT tampoco lee al editor
  enlazado. `linkedWithoutPageRead` cuenta publicaciones con al menos un
  registro de enlace sin lectura de página acreditada.
- `restrictedReferences`: publicaciones sin ninguna copia reutilizable por
  permiso/procedencia; incluye revisiones no verificadas y fuentes eliminadas.
  No se presenta como permiso legal denegado en todos esos casos.
- `datedReferences`, `undatedReferences`, `invalidPublicationDates`,
  `futurePublicationDates`, `publishedLast7Days`.

Identidad usa `reference-identity.mjs`: URL canónica, archivo, ID del proveedor
por fuente o ID del registro. Quita tracking reconocido, conserva parámetros
de negocio y rutas de fragmento. Títulos/textos similares no acreditan la misma
publicación. Si hay varias copias se cuenta una, conservando la mejor cobertura
reutilizable. Dos fuentes pueden acreditar la misma publicación: **no sumar
fuentes ni redes para obtener el total global**. Las entradas `evidence[]`
adjuntas no se cuentan como publicaciones adicionales ni prueban lecturas.

`dates` separa rangos `{from,to}` para `published`, `stored` y `firstSeen`, con
`null` donde no hay evidencia. `createdAt` es guardado, `firstSeenAt` es primera
detección: ninguno sustituye `publishedAt`. Fechas futuras no cuentan como
publicaciones observadas si se aporta `now`. Sin `now`, `asOf`, edad del éxito
y recuento de últimos siete días son `null`; un snapshot con vencimiento no se
puede verificar y no se usa. Esto conserva la pureza y reproducibilidad.

## Fuentes reales y límites actuales

Este inventario se basa en README, `access-policy.mjs`, los adaptadores de
`intelligence.mjs` y `social-sync.mjs` de la base indicada, sin consultas externas
ni afirmaciones nuevas de permisos. Estado documentado en esos archivos el
2026-10-18:

- HN/Algolia: títulos, enlaces, fecha y contadores nativos; no conserva cuerpos
  ni usuarios. Su procedencia gana a una etiqueta editable «LinkedIn» y al
  dominio del artículo enlazado.
- GDELT: títulos y metadatos de noticias; `firstSeenAt` registra detección, no
  fecha de publicación. Los cuerpos de los artículos requieren permiso aparte.
- Google Trends: RSS oficial `/trending/rss?geo=CC`; interés de búsqueda con
  atribución. Explore es un enlace. No mide interacción en redes.
- RSS/Atom adicionales y webs: revisión vigente de origen, ruta, finalidad y
  redirecciones; el informe no busca ni amplía permisos.
- Instagram: falta una aplicación de Meta aprobada y autorización de una cuenta
  profesional elegible. LinkedIn: acceso aprobado a Community Management y
  autorización de la página. TikTok: aplicación aprobada y consentimiento del
  creador para Display API; no se infiere permiso comercial de Research API.
- YouTube: el módulo oficial separado puede ofrecer catálogo y contadores
  públicos. Esto no concede permiso de análisis editorial, derivados o IA;
  los registros legacy permanecen restringidos.

Las condiciones y fuentes oficiales ya revisadas se conservan en
[revisión de acceso](compliance/README.md),
[términos de descubrimiento](compliance/DISCOVERY-TERMS.md) y
[conector oficial de YouTube y requisitos de otras redes](official-social-sync-20261018.md).
Este módulo no vuelve a investigar términos ni certifica que se hayan concedido
permisos nuevos.

`networks[].officialConnection` consume sólo el estado público opcional del
conector: configuración, disponibilidad, conexión con fecha y último éxito.
`contentVerified` permanece `false`: esa entrada no incluye el catálogo ni sus
snapshots y no acredita cantidad o lectura de videos. Sólo YouTube listo declara
`official_public_catalogue` y `native_public_counters` como finalidades separadas;
`editorialAnalysisAllowed` permanece `false` para datos de redes externas.
Texto propio aportado junto a un enlace social se refleja como `providedText`,
sin acreditar acceso a esa red. El informe no mezcla contadores con prioridades
editoriales, no deriva crecimiento ni afirma afinidad de personas.

## Verificación

```bash
node --test tests/discovery-coverage.test.mjs tests/editorial-factors.test.mjs
```

Pruebas locales sin credenciales ni transportes externos. Cubren procedencia,
identidad, categorías de lectura, caducidad, restricciones inmutables, errores
parciales, aislamiento, fechas, pureza y separación del conector oficial.
