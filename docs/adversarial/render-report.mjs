import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const directory = path.join(root, "docs/adversarial");
const inventory = JSON.parse(
  fs.readFileSync(path.join(directory, "inventory.json")),
);
const reports = inventory.map((entry) => {
  const reportPath = path.join(root, entry.report);
  if (!fs.existsSync(reportPath)) throw new Error(`Falta ${entry.report}`);
  return { ...entry, ...JSON.parse(fs.readFileSync(reportPath)) };
});
const verdicts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
for (const report of reports) {
  for (const item of report.cases) verdicts[item.verdict]++;
}
const findings = reports.flatMap((report) =>
  report.findings.map((finding) => ({
    ...finding,
    feature: report.feature,
    slug: report.slug,
  })),
);
const groups = [];
const duplicates = ["references-1", "opportunities-2"];
for (const finding of findings) {
  if (duplicates.includes(finding.id)) {
    const group = groups.find((entry) => entry.id === "duplicate-reference");
    if (group) group.members.push(finding.id);
    else
      groups.push({
        id: "duplicate-reference",
        severity: finding.severity,
        title:
          "La captura manual duplica publicaciones y aumenta la evidencia contada",
        members: [finding.id],
      });
  } else
    groups.push({
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      members: [finding.id],
    });
}
groups.sort((a, b) => a.severity.localeCompare(b.severity));
const summary = {
  reviewedAt: new Date().toISOString(),
  agents: reports.length,
  cases: Object.values(verdicts).reduce((sum, count) => sum + count, 0),
  verdicts,
  reportFindings: findings.length,
  distinctIssues: groups.length,
  issues: groups,
  features: reports.map((report) => ({
    slug: report.slug,
    feature: report.feature,
    agent: report.agent,
    status: report.status,
    cases: report.cases.length,
    verdicts: report.cases.reduce(
      (counts, item) => ({
        ...counts,
        [item.verdict]: (counts[item.verdict] || 0) + 1,
      }),
      {},
    ),
    findings: report.findings.map((finding) => finding.id),
    report: `reports/${report.slug}.md`,
  })),
};
fs.writeFileSync(
  path.join(directory, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
const markdown = [
  "# Resultado de la revisión adversarial",
  "",
  `${summary.agents} agentes nuevos e independientes revisaron ${summary.agents} funcionalidades mediante navegador T3, con host, cuenta y SQLite propios. Se registraron ${summary.cases} escenarios: ${verdicts.PASS} PASS, ${verdicts.FAIL} FAIL y ${verdicts.BLOCKED} BLOCKED. Son escenarios registrados, no una certificación exhaustiva ni un conteo de peticiones HTTP.`,
  "",
  `Se confirmaron ${summary.reportFindings} hallazgos por funcionalidad, agrupados en ${summary.distinctIssues} defectos distintos. El duplicado de referencias fue descubierto por dos revisores independientes y se cuenta una sola vez en la agrupación. Los informes originales permanecen separados.`,
  "",
  "## Prioridad de corrección",
  "",
  "Esta priorización pertenece a la consolidación; los informes de cada agente conservan sus resultados independientes.",
  "",
  "1. Aplicar las restricciones de datos personales y procedencia pública en todas las entradas: company-2, signals-1/2, results-1 y references-2.",
  "2. Corregir la lectura de crecimiento y el conteo de evidencia: opportunities-1 y el grupo references-1/opportunities-2. Afectan directamente la confianza de la decisión editorial.",
  "3. Completar el resultado utilizable de creación y entrega: studio-1 y providers-1. Revisar el texto producido además de los metadatos, y permitir usar las integraciones que la interfaz ofrece configurar.",
  "4. Preservar las decisiones y el trabajo del usuario: company-1, navigation-1, assets-1 y las demás inconsistencias de formulario, calendario, actualización y móvil detalladas debajo.",
  "",
  "## Cobertura individual",
  "",
  "| Funcionalidad | Resultado | PASS | FAIL | BLOCKED | Hallazgos |",
  "| --- | --- | ---: | ---: | ---: | --- |",
  ...summary.features.map(
    (feature) =>
      `| [${feature.feature}](${feature.report}) | ${feature.status} | ${feature.verdicts.PASS || 0} | ${feature.verdicts.FAIL || 0} | ${feature.verdicts.BLOCKED || 0} | ${feature.findings.join(", ") || "Sin fallos confirmados"} |`,
  ),
  "",
  "## Defectos confirmados",
  "",
  ...groups.flatMap((group) => [
    `### ${group.severity} · ${group.title}`,
    "",
    ...group.members.flatMap((id) => {
      const finding = findings.find((item) => item.id === id);
      return [
        `**${id}** · [Informe independiente](reports/${finding.slug}.md).`,
        "",
        `Esperado: ${finding.expected}`,
        "",
        `Observado: ${finding.actual}`,
        "",
        `Código: ${finding.source.map((source) => `\`${source}\``).join(", ")}.`,
        "",
        ...finding.evidence
          .filter((file) => file.endsWith(".png"))
          .map(
            (file) =>
              `[Captura](${path.relative(directory, path.join(root, file))})`,
          ),
        "",
      ];
    }),
  ]),
  "## Casos registrados como pendientes",
  "",
  ...reports.flatMap((report) =>
    report.cases
      .filter((item) => item.verdict === "BLOCKED")
      .map((item) => `- **${report.feature} · ${item.name}:** ${item.actual}`),
  ),
  "",
  "El cooldown quedó sin prueba dinámica en el informe de fuentes porque su entorno desactivaba la actualización automática. Se revisó después como funcionalidad independiente: [actualización automática](reports/scheduler.md). Ese caso se conserva como BLOCKED en el informe original y en su conteo; no equivale a una rama globalmente sin revisar.",
  "",
  "Los proveedores sintéticos sólo verifican el recorrido y las validaciones de la aplicación. No demuestran exactitud de un modelo real, entrega a una red, costos, cuota o continuidad de una API. Las cifras, nombres y domicilios de las pruebas son ficticios. Los snapshots temporales se sembraron: no se esperaron semanas ni se demostró rendimiento comercial.",
  "",
  "PASS significa que los casos descritos devolvieron el resultado esperado. PARTIAL separa los casos comprobados de los pendientes; FAIL exige un fallo confirmado. Los candidatos descartados y las observaciones condicionadas no se suman a los defectos. Cada informe detalla sus límites, fixtures y recuperación.",
  "",
  "## Integridad y reproducción",
  "",
  "Se conserva la aplicación examinada sin correcciones durante la auditoría. `manifest.json` fija el código/build de partida; `integrity.json` registra la comprobación final. Las bases temporales se conservan bajo las rutas de `inventory.json`; los procesos de prueba se detuvieron. Pasos, resultados exactos y capturas se encuentran en cada informe. El [contrato de revisión](BRIEF.md) describe el método.",
  "",
].join("\n");
fs.writeFileSync(path.join(directory, "SUMMARY.md"), markdown);

const data = JSON.stringify({ summary, reports }).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisión adversarial por funcionalidad</title><style>
*{box-sizing:border-box}body{margin:0;color:var(--foreground,#19352b);font:14px/1.5 var(--font-sans,system-ui,sans-serif);background:transparent}button,input{font:inherit}button{cursor:pointer}p{margin:0 0 12px}.lead{font-size:16px}.muted{color:var(--muted-foreground,#58665f)}.counts{display:flex;gap:24px;flex-wrap:wrap;margin:18px 0}.counts strong{font-size:26px;line-height:1.2;display:block}.counts span{font-size:12px;color:var(--muted-foreground,#58665f)}.filters{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 10px}.filters button{border:1px solid var(--border,#dde5de);border-radius:6px;padding:7px 10px;background:var(--card,#fff);color:inherit}.filters button[aria-pressed=true]{background:var(--primary,#136c51);color:var(--primary-foreground,#fff)}input{width:100%;padding:10px 12px;border:1px solid var(--border,#dde5de);border-radius:6px;background:var(--card,#fff);color:inherit;margin-bottom:12px}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--ring,#438b6a);outline-offset:3px}details{border-bottom:1px solid var(--border,#dde5de)}summary{display:grid;grid-template-columns:80px minmax(0,1fr) 78px;align-items:center;gap:10px;cursor:pointer;padding:12px 0;list-style:none}summary::-webkit-details-marker{display:none}.status{display:inline-flex;justify-content:center;border-radius:4px;padding:3px 5px;font-size:11px;font-weight:700;letter-spacing:.02em}.PASS{background:#e1efe7;color:#175036}.FAIL{background:#fbe8e8;color:#852929}.PARTIAL,.BLOCKED{background:#fff1d5;color:#734a12}.tally{text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted-foreground,#58665f)}.name{font-weight:600;line-height:1.4}.detail{padding:0 0 18px}.detail h3{font-size:14px;margin:12px 0 7px}.finding{padding:14px 16px;margin:10px 0;background:var(--secondary,#eef1ec);border-radius:8px}.finding p:last-child{margin-bottom:0}.finding ol{padding-left:20px;margin:6px 0 12px}code{font:11px/1.5 var(--font-mono,monospace);overflow-wrap:anywhere}.case{margin:8px 0;padding:10px 0;border-top:1px solid var(--border,#dde5de)}.case b{font-size:13px}.case p{font-size:12px;margin:4px 0}.case .status{margin-right:7px}.limits{font-size:12px;padding-left:20px}.limits li{margin:6px 0}.empty{padding:16px 0}.legend{font-size:12px;line-height:1.6;margin-top:14px}details[open]>summary .name::after{content:' · abierto';font-weight:400;color:var(--muted-foreground,#58665f)}@media(max-width:440px){summary{grid-template-columns:68px minmax(0,1fr);gap:8px}.tally{grid-column:2;text-align:left;margin-top:-5px}.counts{gap:20px}.counts strong{font-size:24px}.finding{padding:12px 16px}.lead{font-size:15px}}
</style></head><body><p class="lead">Revisión individual de <strong id="total"></strong> funcionalidades, con un agente independiente por función.</p><div class="counts" id="counts"></div><p class="muted">Abre una función para comparar el resultado esperado con el observado. Los casos con proveedor simulado están identificados en sus límites.</p><div class="filters" aria-label="Filtrar resultados"><button data-status="ALL" aria-pressed="true">Todas</button><button data-status="FAIL" aria-pressed="false">Con fallos</button><button data-status="PARTIAL" aria-pressed="false">Parciales</button><button data-status="PASS" aria-pressed="false">Sin fallos observados</button></div><label for="search" class="muted">Buscar función o hallazgo</label><input id="search" type="search" placeholder="Por ejemplo: audiencia, crecimiento, archivos"><p class="muted" style="font-size:12px">Conteos por fila: PASS / FAIL / BLOCKED.</p><div id="rows"></div><p class="empty" id="empty" hidden>No hay funciones con esos filtros.</p><p class="legend muted">P1: fallo crítico de seguridad o resultado. P2: fallo funcional parcial. P3: fricción de interfaz. PASS cubre sólo los casos descritos; BLOCKED indica un resultado sin comprobar. Los hallazgos repetidos entre funciones se agrupan en el conteo de defectos distintos.</p><script id="data" type="application/json">${data}</script><script>
const {summary,reports}=JSON.parse(document.getElementById('data').textContent);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
document.getElementById('total').textContent=summary.agents;
for(const [value,label] of [[summary.cases,'escenarios registrados'],[summary.distinctIssues,'defectos distintos'],[summary.verdicts.BLOCKED,'casos marcados BLOCKED']]){const d=el('div');d.append(el('strong',value),el('span',label));document.getElementById('counts').append(d);}
const rows=document.getElementById('rows');
for(const report of reports){const d=el('details');d.dataset.status=report.status;d.dataset.search=(report.feature+' '+report.findings.map(f=>f.title).join(' ')).toLocaleLowerCase();const s=el('summary');const count=report.cases.reduce((a,c)=>(a[c.verdict]=(a[c.verdict]||0)+1,a),{});s.append(el('span',report.status,'status '+report.status),el('span',report.feature,'name'),el('span',(count.PASS||0)+' / '+(count.FAIL||0)+' / '+(count.BLOCKED||0),'tally'));d.append(s);const detail=el('div',undefined,'detail');detail.append(el('p','Agente '+report.agent+' · '+report.cases.length+' casos.','muted'));
if(!report.findings.length)detail.append(el('p','Sin fallos confirmados en los casos observados.'));
for(const f of report.findings){const box=el('section',undefined,'finding');box.append(el('h3',f.severity+' · '+f.title),el('p','Esperado: '+f.expected),el('p','Observado: '+f.actual));const steps=el('ol');for(const step of f.steps)steps.append(el('li',step));box.append(steps,el('code',f.source.join(' · ')));detail.append(box);}
detail.append(el('h3','Casos comprobados'));
for(const c of report.cases){const section=el('div',undefined,'case');const title=el('div');title.append(el('span',c.verdict,'status '+c.verdict),el('b',c.name));section.append(title,el('p','Esperado: '+c.expected),el('p','Observado: '+c.actual));detail.append(section);}
detail.append(el('h3','Límites de esta revisión'));const limits=el('ul',undefined,'limits');for(const l of report.limitations)limits.append(el('li',l));detail.append(limits);d.append(detail);rows.append(d);}
let filter='ALL';const search=document.getElementById('search');function apply(){let shown=0;for(const d of rows.children){d.hidden=!(filter==='ALL'||d.dataset.status===filter)||!d.dataset.search.includes(search.value.trim().toLocaleLowerCase());if(!d.hidden)shown++;}document.getElementById('empty').hidden=shown>0;}for(const button of document.querySelectorAll('.filters button[data-status]'))button.addEventListener('click',()=>{filter=button.dataset.status;for(const b of document.querySelectorAll('.filters button[data-status]'))b.setAttribute('aria-pressed',String(b===button));apply();});search.addEventListener('input',apply);console.assert(rows.children.length===reports.length,'Una fila por revisión independiente');console.assert(reports.every(r=>r.cases.every(c=>c.expected&&c.actual)),'Esperado y observado presentes');const failFilter=document.querySelector('.filters button[data-status=FAIL]');failFilter.click();console.assert([...rows.children].filter(d=>!d.hidden).length===reports.filter(r=>r.status==='FAIL').length,'Filtro de fallos correcto');document.querySelector('.filters button[data-status=ALL]').click();search.value='__sin_coincidencias__';search.dispatchEvent(new Event('input'));console.assert(!document.getElementById('empty').hidden,'Estado vacío correcto');search.value='';search.dispatchEvent(new Event('input'));console.log(JSON.stringify({features:reports.length,cases:summary.cases,distinctIssues:summary.distinctIssues,overflow:document.documentElement.scrollWidth>innerWidth}));
</script></body></html>`;
fs.writeFileSync(path.join(directory, "review.html"), html);
console.log(
  JSON.stringify({
    agents: summary.agents,
    cases: summary.cases,
    findings: summary.reportFindings,
    distinctIssues: summary.distinctIssues,
  }),
);
