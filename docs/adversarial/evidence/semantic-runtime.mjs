import fs from 'node:fs';
import { startProductionServer } from '/home/ubuntu/.t3/projects/30x-trackt-2/server/start-host.mjs';
import { createOpportunityAnalysisRouter } from '/home/ubuntu/.t3/projects/30x-trackt-2/server/opportunity-analysis.mjs';
const dir='/tmp/30x-adversarial-semantic';
const fetcher=async(url,opts)=>{
  if(url!=='https://api.openai.com/v1/responses') throw new Error('QA runtime blocks all other provider URLs');
  const body=JSON.parse(opts.body), input=JSON.parse(body.input[0].content[0].text);
  const control=JSON.parse(fs.readFileSync(dir+'/control.json','utf8'));
  fs.appendFileSync(dir+'/provider-log.jsonl',JSON.stringify({at:new Date().toISOString(),mode:control.mode,opportunityId:input.opportunity.id,audience:input.audience,references:input.references,coverage:input.coverage})+'\n');
  if(control.delayMs) await new Promise(r=>setTimeout(r,control.delayMs));
  let value={
    need:'Mantener continuidad de las conversaciones comerciales al cambiar el responsable.',
    rationale:'La necesidad declarada se relaciona con conservar el contexto de los acuerdos; la referencia propone documentar las conversaciones. Hipótesis sintética del proveedor controlado, pendiente de contrastar.',
    hookHypothesis:'Hipótesis editorial sintética: mostrar un traspaso entre responsables antes de explicar el método.',
    adaptation:'Propuesta sintética original: mostrar un traspaso comercial en una empresa educativa y probar un registro compartido con una decisión práctica.',
    segmentIds:[input.audience[0].id],
    citations:[{referenceId:input.references[0].id,support:input.references[0].text || input.references[0].title}],
    limitations:['Respuesta sintética de auditoría; no valida exactitud de IA ni evidencia real de consumidores.']
  };
  if(control.mode==='bad-segment') value.segmentIds=['foreign-segment'];
  if(control.mode==='bad-quote') value.citations[0].support='Cita inventada que no existe en el material.';
  if(control.mode==='foreign-reference') value.citations[0].referenceId='reference-not-in-opportunity';
  if(control.mode==='empty-need') value.need='';
  if(control.mode==='extra-field') value.inventedField='no permitido';
  if(control.mode==='nonliteral-case') value.citations[0].support=value.citations[0].support.toUpperCase();
  if(control.mode==='malformed') return new Response(JSON.stringify({output_text:'{malformed'}),{headers:{'content-type':'application/json'}});
  if(control.mode==='provider-error') return new Response('{}',{status:429});
  return new Response(JSON.stringify({output_text:JSON.stringify(value)}),{headers:{'content-type':'application/json'}});
};
const {server}=await startProductionServer();
const app=server.listeners('request')[0];
const layer=app.router.stack.find(x=>x.handle?.stack?.some(s=>s.route?.path==='/brands/:brandId/opportunities/:opportunityId/analyze'));
if(!layer) throw new Error('Analysis router layer missing');
layer.handle=createOpportunityAnalysisRouter({fetcher});
fs.writeFileSync(dir+'/runtime-pid',String(process.pid));
console.log('QA synthetic provider transport injected; all analysis requests are local controlled responses');
