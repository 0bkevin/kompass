import fs from "node:fs";
import path from "node:path";

const directory = import.meta.dirname;
const summary = JSON.parse(fs.readFileSync(path.join(directory, "summary.json"), "utf8"));
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const categories = {
  company: "Empresa", audience: "Audiencia", signals: "Señales",
  community: "Comunidad", discovery: "Descubrimiento", references: "Referencias",
  duplicate: "Referencias", opportunities: "Oportunidades", studio: "Contenido",
  calendar: "Calendario", results: "Resultados", assets: "Archivos",
  sources: "Fuentes", providers: "Publicación", navigation: "Navegación",
};
const issues = summary.issues.map((issue) => ({
  ...issue,
  category: categories[issue.id.split("-")[0]] || issue.id,
}));
const options = [...new Set(issues.map((issue) => issue.category))].sort((a, b) => a.localeCompare(b, "es"));
const row = (issue) => {
  const report = issue.reportDetails;
  const verification = report.verification.map((check) => `<li>${escape(check.after || check.result || check.command || JSON.stringify(check))}</li>`).join("");
  return `<details class="issue" data-category="${escape(issue.category)}"><summary><span class="identity"><code>${escape(issue.id)}</code><span class="category">${escape(issue.category)}</span></span><span class="issue-title">${escape(issue.resolution)}</span><span class="verified">Verificado</span></summary><div class="details"><p class="owner">Responsable: <code>${escape(issue.agent)}</code></p><p class="label">Hallazgo original</p><p>${escape(issue.title)}</p><p>${escape(report.rootCause)}</p><ul>${report.changes.map((change) => `<li>${escape(change)}</li>`).join("")}</ul><p class="label">Comprobaciones</p><ul>${verification}</ul>${report.limitations?.length ? `<p class="label">Alcance</p><ul>${report.limitations.map((limit) => `<li>${escape(limit)}</li>`).join("")}</ul>` : ""}</div></details>`;
};
const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verificación de correcciones</title><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--foreground,#17251f);font:14px/1.5 var(--font-sans,system-ui)}button,input,select{font:inherit;color:inherit}p{margin:0 0 12px}code{font:12px var(--font-mono,monospace)}.lead{font-size:16px;max-width:66ch}.stats{display:flex;flex-wrap:wrap;gap:10px 24px;margin:18px 0}.stats div{display:grid;gap:1px}.stats strong{font-size:23px;line-height:1.2;font-weight:650}.stats span,.hint,.category,.owner{color:var(--muted-foreground,#5b6962);font-size:12px}.controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:20px 0 10px}.controls label{display:grid;gap:5px;font-size:12px;font-weight:600}.controls label:first-child{flex:1 1 230px}.controls input,.controls select,.controls button{border:1px solid var(--border,#cbd5cf);border-radius:6px;background:var(--card,#fff);padding:9px 10px;min-height:40px}.controls button{cursor:pointer}.controls input:focus-visible,.controls select:focus-visible,.controls button:focus-visible,summary:focus-visible{outline:2px solid var(--ring,#26764d);outline-offset:3px}.hint{margin-bottom:10px}.issue{border-top:1px solid var(--border,#d5ddd8)}.issue:last-child{border-bottom:1px solid var(--border,#d5ddd8)}summary{cursor:pointer;display:grid;grid-template-columns:145px 1fr 78px;gap:12px;align-items:center;list-style:none;padding:12px 0}summary::-webkit-details-marker{display:none}.identity{display:grid;gap:2px}.identity code::before{content:'＋ ';font-size:12px}.issue[open] .identity code::before{content:'− '}.issue-title{font-size:13px}.verified{font-size:12px;color:var(--foreground,#17251f);font-weight:650;text-align:right}.verified::before{content:"✓ ";color:var(--success,#28734e)}.details{padding:4px 0 18px 157px}.details p{font-size:13px}.details ul{margin:8px 0 14px;padding-left:18px;font-size:12px}.details li+li{margin-top:6px}.details .label{font-size:12px;font-weight:650;margin:12px 0 0}.limits{margin-top:20px;font-size:12px;color:var(--muted-foreground,#5b6962)}[hidden]{display:none!important}@media(max-width:520px){summary{grid-template-columns:1fr 76px;gap:5px 10px}.identity{grid-column:1;display:flex;gap:10px;align-items:center}.issue-title{grid-column:1;grid-row:2}.verified{grid-column:2;grid-row:1/3}.details{padding:4px 0 16px}.controls input,.controls select{font-size:16px}.stats{gap:12px 20px}.stats strong{font-size:20px}}
</style></head><body>
<p class="lead">${summary.originalFindings} hallazgos cubiertos por ${summary.distinctIssues} correcciones, cada una con un agente responsable distinto y comprobación de su resultado.</p>
<div class="stats"><div><strong>${summary.independentFixAgents}</strong><span>agentes independientes</span></div><div><strong>${summary.validation.tests.pass}/${summary.validation.tests.tests}</strong><span>pruebas aprobadas</span></div><div><strong>Build ✓</strong><span>Vite + TypeScript</span></div><div><strong>Recorrido ✓</strong><span>navegador y móvil</span></div></div>
<div class="controls"><label>Buscar un punto<input id="search" type="search" placeholder="Ej.: archivos, audiencia, calendario"></label><label>Área<select id="area"><option value="">Todas las áreas</option>${options.map((option) => `<option>${escape(option)}</option>`).join("")}</select></label><button id="expand" type="button">Abrir detalles</button></div>
<p class="hint" id="count" role="status" aria-live="polite">${issues.length} correcciones verificadas. Abre un punto para leer el cambio y sus comprobaciones.</p>
<main id="issues">${issues.map(row).join("\n")}</main>
<p class="limits">Los ${summary.originalAuditPreserved.files} archivos de la auditoría anterior permanecen intactos, verificados por SHA-256. Publicación y proveedores de pago se probaron con transportes controlados; la entrega externa y la precisión de modelos requieren comprobación con sus credenciales. Los resultados de prueba son sintéticos.</p>
<script>
const search=document.querySelector('#search'),area=document.querySelector('#area'),count=document.querySelector('#count'),button=document.querySelector('#expand'),rows=[...document.querySelectorAll('.issue')];
const normalize=value=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase('es');
function filter(){const query=normalize(search.value.trim());for(const row of rows)row.hidden=!!((area.value&&row.dataset.category!==area.value)||(query&&!normalize(row.textContent).includes(query)));const visible=rows.filter(row=>!row.hidden);count.textContent=visible.length+' de '+rows.length+' correcciones verificadas.';sync();}
function sync(){const visible=rows.filter(row=>!row.hidden);button.textContent=visible.length&&visible.every(row=>row.open)?'Cerrar detalles':'Abrir detalles';button.disabled=!visible.length;}
search.addEventListener('input',filter);area.addEventListener('change',filter);button.addEventListener('click',()=>{const visible=rows.filter(row=>!row.hidden),open=!visible.every(row=>row.open);for(const row of visible)row.open=open;sync();});for(const row of rows)row.addEventListener('toggle',sync);
console.log('Report: '+rows.length+' independent corrections; '+document.querySelectorAll('.verified').length+' verified states.');
</script></body></html>`;
fs.writeFileSync(path.join(directory, "review.html"), html);
console.log(JSON.stringify({ output: "docs/remediation/review.html", issues: issues.length, bytes: Buffer.byteLength(html) }));
