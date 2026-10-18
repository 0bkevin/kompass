# Observaciones editoriales manuales

Implementación aislada en `server/editorial-evidence.mjs`. No requiere credenciales ni añade dependencias. El integrador monta `app.use("/api", createEditorialEvidenceRouter())` antes del 404 de API, con el parser JSON y el manejador de errores existentes.

## API HTTP

`GET /api/brands/:brandId/references/:referenceId/editorial-evidence` requiere sesión y membresía. `PUT` requiere además propietario/editor y comprueba el origen de la solicitud. Los revisores pueden leer. Las respuestas llevan `Cache-Control: no-store`.

GET devuelve:

```json
{
  "schemaVersion": 1,
  "referenceId": "reference-id",
  "referenceFingerprint": "sha256 de 64 caracteres",
  "revision": 0,
  "status": "empty",
  "origin": "manual",
  "causality": "not_established",
  "isDemo": false,
  "observations": [],
  "updatedAt": null
}
```

`status` es `empty`, `current` o `stale`. Una referencia modificada devuelve su fingerprint actual, la revisión guardada y `stale` con `observations: []`: su contenido anterior no se ofrece al informe. Cambiar sólo el estado del flujo o un análisis generado no cambia el material observado. Texto, título, atribución, fechas, métricas, enlaces y metadatos del adjunto sí cambian el fingerprint.

PUT reemplaza el conjunto completo. Envía `observations: []` para retirarlo. Usa el fingerprint y la revisión del último GET:

```json
{
  "expectedReferenceFingerprint": "fingerprint del GET",
  "expectedRevision": 0,
  "observations": [
    {
      "factor": "hook",
      "observation": "La apertura plantea una pregunta concreta.",
      "uncertainty": "No se ha observado la reacción de la audiencia.",
      "possibleHypothesis": "La pregunta podría facilitar reconocer la necesidad; requiere contraste.",
      "observedAt": "2026-01-01T10:00:00Z",
      "support": {
        "kind": "text",
        "field": "text",
        "quote": "Cita literal presente en el texto de la referencia."
      }
    }
  ]
}
```

El ejemplo muestra la forma del contrato, no un caso ni un resultado real. `possibleHypothesis` es opcional; los demás campos de la observación son obligatorios. `observedAt` es ISO UTC con segundos, sin fechas futuras. Hay hasta seis observaciones y una por factor: `hook`, `format`, `topic`, `timing`, `publisher`, `performance`.

`support` admite dos formas:

- `{ kind: "text", field: "title" | "text", quote: string }`: coincidencia literal en el campo indicado. No acepta citas inventadas ni extraídas de análisis anteriores. La respuesta añade `verification: "literal_reference"`.
- `{ kind: "time", startSeconds: number, endSeconds?: number }`: requiere un adjunto de audio/video de esta empresa. Intervalo no negativo, hasta 86400 s y dentro de la duración registrada cuando existe. La respuesta añade `verification: "manual_timestamp"`; el tiempo es declarado por el editor, no verificado contra los bytes.

Cada observación devuelta añade `origin: "manual"`. Al editar, construye el payload con los campos de entrada: `origin` y `support.verification` son campos de salida y el contrato rechaza campos adicionales. Límites de caracteres: observación 1000, incertidumbre 600, hipótesis 600 y cita 1000. Se exportan `EDITORIAL_EVIDENCE_FACTORS` y `EDITORIAL_EVIDENCE_LIMITS`.

PUT devuelve el mismo documento que GET con revisión incrementada. Un conflicto de referencia o revisión da 409 con `code: "EDITORIAL_EVIDENCE_CONFLICT"`; valida de nuevo el material antes de reenviar. Una entrada inválida da 400 sin escritura parcial. Referencias ajenas/inexistentes dan 404; sesión ausente/caducada 401 y acceso restringido 403.

## Lectores para informe y UI

```js
import {
  createEditorialEvidenceRouter,
  getEditorialEvidence,
  listCurrentEditorialEvidence,
  editorialEvidenceFingerprint,
} from "./editorial-evidence.mjs";

const document = getEditorialEvidence(brandId, referenceId);
const currentManualEvidence = listCurrentEditorialEvidence(brandId);
```

Los lectores internos reciben IDs de empresa ya autorizados por el llamador; no conceden autorización. `getEditorialEvidence` vuelve a aplicar la política y puede lanzar 403/404. `listCurrentEditorialEvidence` devuelve un array ordenado por ID de referencia, sólo con documentos vigentes, permitidos, no vacíos y no demo; omite registros restringidos y caducados. El informe debe conservar `origin`, `causality`, `observedAt`, el apoyo y la incertidumbre. No convertir la hipótesis manual en conclusión causal, métrica derivada, crecimiento ni puntuación automática. `performance` es una observación textual manual, no una consulta de contadores.

`editorialEvidenceFingerprint(reference, { asset } = {})` es una función pura. Se recomienda usar los lectores, que resuelven el adjunto de la empresa y comprueban permisos en cada consulta.

## Persistencia y límites

El módulo crea su propia tabla SQLite `editorial_evidence` al importarlo. Una fila por `(brand_id, reference_id)` con FK al registro de referencia y borrado en cascada al eliminar referencia o empresa. No usa el kind `editorialEvidence` ni modifica `server/db.mjs`. La comprobación de versión y escritura comparten `BEGIN IMMEDIATE`, evitando sobrescrituras concurrentes entre procesos. No se añaden identificadores de usuarios ni cuerpos completos de referencia a esta tabla.

Se aplican la política de referencia y fuente, revocaciones de permisos de ingestión, comprobaciones de URL pública y el bloqueo explícito de dominios sociales restringidos, incluso cuando un enlace manual no tiene plataforma declarada. YouTube oficial sigue en `social-sync`, separado de este módulo. Un permiso o una clave no habilita su análisis editorial. No hay scraping, solicitudes remotas, descarga, lectura de archivos audiovisuales, IA ni inferencia automática de causalidad.

El texto libre usa las comprobaciones existentes de privacidad agregada y URL: rechaza correos, teléfonos, contactos codificados y fichas individuales explícitas. No distingue automáticamente un nombre propio de persona de uno de empresa; el editor debe limitar atribución y observaciones a empresas/material permitido y eliminar datos personales. El módulo no determina derechos sobre texto propio aportado ni verifica que un tiempo haya sido observado. Sólo comprueba identidad/metadatos de adjuntos; una modificación de bytes fuera del sistema que no cambie sus metadatos no se detecta.

Pruebas aisladas, con SQLite temporal y datos sintéticos: `node --test tests/editorial-evidence.test.mjs`.
