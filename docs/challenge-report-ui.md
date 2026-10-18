# Informe semanal: contrato de integración de UI

Implementado sobre `30c3868`, en el worktree `t3-64839668`. No cambia navegación, `View`, el árbol generado, `Journey`, la API compartida, políticas ni routers del servidor. Root registra la navegación y monta los endpoints. La generación normal de TanStack incorpora `src/routes/_workspace/research.tsx` durante el build; ese archivo generado se excluye del commit.

## Entrada y exportaciones

`src/features/ChallengeReport.tsx` exporta por defecto `ChallengeReport({ endpoints? })`. Consume `useWorkspace()`; empresa, segmentos y rol proceden del espacio autenticado. Se monta una sesión nueva por `brand.id`, cancela solicitudes al desmontar y descarta respuestas tardías. No necesita credenciales de proveedores ni inicia consultas de descubrimiento o IA.

`src/lib/challenge-report.ts` exporta `ResearchReport`, `ReportFinding`, `ReportFilters`, `ReportFeedback`, `ReportPilot`, `ReportEndpoints`, `reportEndpoints`, `normalizeResearchReport`, `normalizeReportFindings`, `selectReportOpportunities`, `isResearchReportStale`, `reportPilotInput`, `exportMarkdown`, `reportDate`, `reportCitationUrl`, `methodLabels` y `reportLimits`.

Se usa `api` existente, con credenciales de sesión del mismo origen. Los endpoints son funciones de `brandId` y pueden sustituirse mediante la prop `endpoints`.

## Lectura

`GET /api/brands/:brandId/research-report` devuelve este sobre:

```ts
{
  generatedAt: string; // ISO; una fecha inválida se muestra como desactualizada
  isDemo?: boolean;
  stale?: boolean;
  scope?: {
    company?: string;
    market?: string;
    question?: string;
    period?: { from?: string; to?: string; days?: number };
    counts?: {
      selected?: number;
      publicationDated?: number;
      observationDated?: number;
      [key: string]: number | undefined;
    };
  };
  coverage?: {
    references?: number;
    sources?: number;
    activeSources?: number;
    errors?: string[];
    notes?: string[];
  };
  opportunities: Opportunity[]; // contrato actual de src/lib/journey-types.ts
  trends?: ReportFinding[] | object;
  formats?: ReportFinding[] | object;
  validation?: ReportFinding[] | object;
  pilot?: ReportFinding[] | object;
  costs?: { actualUsd?: number; reservedUsd?: number; note?: string };
}
```

`ReportFinding` es `{ title: string, detail: string }`. Es la forma recomendada para los adaptadores de root: evita presentar claves internas de los módulos. El normalizador también acepta strings, arrays con `label/topic/format/name` y `summary/explanation/reason/note`, y objetos con `items`, `findings` o `summary`. Para un objeto plano conserva solo strings y números no negativos finitos. No recorre registros arbitrarios ni convierte estructuras desconocidas en resultados: los detalles complejos de los helpers se adaptan explícitamente en backend. La validación editorial y el piloto pueden aportar sus avisos como un finding adicional.

`opportunities` usa la forma actual de `buildInsights`, incluidos `referenceIds`, `segmentIds`, `reasons`, `evidence`, `growth`, `factors`, `analysis`, `hypothesis` y `adaptation`. Un sobre u oportunidad malformados producen un error recuperable. El servidor es responsable de autorización, corpus semanal, vigencia de citas literales y exclusión de derivados de YouTube. No enviar datos de participantes, cuentas o notas personales.

`publicationDated` cuenta referencias con fecha de publicación utilizable; `observationDated` cuenta las restantes seleccionadas por observación. La UI muestra ambas por separado. Las fechas de evidencia se rotulan **Observada**, nunca se convierten en publicación. Fechas visibles en UTC. El informe se marca desactualizado si el servidor lo indica, la generación/período es inválida, la generación queda en el futuro más de cinco minutos o la generación/fin del corpus superan siete días.

Los filtros de segmento y método son locales y afectan exclusivamente oportunidades y su exportación. `heuristic` selecciona oportunidades sin `analysis.engine === 'ai'`; `ai` selecciona las que tienen ese análisis. No solicita IA al cambiar de método. Los resúmenes y la cobertura corresponden al corpus completo y así se indica. Se ordena por `relevance` descendente, desempata por título y se limita a diez; nunca rellena posiciones ni usa crecimiento para clasificar.

La exportación Markdown incluye alcance, filtros, fuentes, citas IA vinculadas a un `referenceId` existente en la evidencia, atribución canónica de proveedores, factores, adaptación, errores y límites. Escapa Markdown/HTML de los textos y rechaza enlaces fuera de HTTP(S) o con credenciales. No verifica una cita remota: usa la validación de citas del servidor. Costos ausentes se muestran como desconocidos; las reservas se distinguen del gasto.

## Decisiones editoriales

Contrato leído de `server/opportunity-feedback.mjs` del worktree `t3-e5ab092c`:

```http
POST /api/brands/:brandId/opportunity-feedback
```

```json
{
  "opportunityId": "opportunity-id",
  "referenceIds": ["reference-id"],
  "segmentId": "segment-id",
  "decision": "accepted"
}
```

Decisiones admitidas: `accepted`, `rejected`, `needs_evidence`. `referenceIds` procede de la oportunidad completa. El segmento inicial es el filtro explícito o el primer segmento válido de la oportunidad; siempre aparece en un select editable y requerido. Si no hay ninguno, el editor debe elegirlo. No se envían `reportGeneratedAt`, `verdict` ni notas libres. La API vuelve a validar permiso, pertenencia y evidencia vigente. Una respuesta 2xx confirma guardado y vuelve a consultar el informe. Un fallo conserva el formulario y muestra el error. El rol `reviewer` tiene lectura; no ve los controles de escritura.

## Piloto

Contrato leído de `server/pilot-evaluation.mjs` del worktree `t3-3055ec0e`:

```http
POST /api/brands/:brandId/pilot-evaluation
```

```ts
{
  origin: "manual";
  period: {
    start: "YYYY-MM-DD";
    end: "YYYY-MM-DD";
  }
  editorialMinutes: number | null;
  actualCost: {
    amount: number | null;
    currency: "USD";
  }
  results: {
    reviewed: number | null;
    useful: number | null;
    accepted: number | null;
  }
}
```

Formulario compacto con fechas requeridas y mediciones opcionales. Un campo vacío es `null`; cero sigue siendo cero. Valida fechas reales, orden, futuro, cifras no negativas, conteos enteros y `accepted ≤ useful ≤ reviewed` cuando se conocen. USD admite dos decimales. Se avisa que guardar un período existente sustituye todas sus cifras. La API decide solapamiento, corrección y límites. Se registra la protección de cambios sin guardar existente. No ofrece línea base en esta entrega, no calcula ahorro ni causalidad y no convierte minutos en dinero. Root puede ampliar con el contrato `baseline` del módulo cuando conecte ese recorrido.

## Verificación

- `node --test tests/challenge-report.test.mjs`: 11 pruebas, aprobadas. Cubren límites, filtros, fechas, citas/atribución, exportación, enlaces, contratos y mediciones desconocidas.
- `npm run build`: Vite cliente/servidor y TypeScript aprobados.
- Navegador colaborativo con componente real y transporte sintético aislado: escritorio 1280 px y móvil 390 px sin desbordamiento, fuentes Hedvig/Geist locales, expansión con Enter y foco visible; filtros, feedback y piloto con payload exacto; estados carga/error/vacío/desactualizado/malformado y descarte de respuesta tardía tras cambiar de empresa. No se llamó a proveedores ni se modificaron datos reales.
- Impeccable, una pasada mecánica: solo dos avisos de `12px`, admitidos expresamente en DESIGN.md para metadatos. Se conserva la identidad existente. Su sidecar previo está desactualizado; no se modificó documentación de diseño ajena al alcance.

La revisión visual se hizo con un host temporal bajo `.tanstack/`, ignorado por Git. Los datos de ese host estaban rotulados como sintéticos/demostración. No se entrega un endpoint simulado como funcionalidad real ni se afirma integración HTTP con los routers aún no montados en esta rama.
