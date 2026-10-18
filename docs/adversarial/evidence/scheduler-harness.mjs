// Isolated adversarial runtime. No production files/builds are modified.
// Scheduler time and discovery are simulated; syncSources persists fixture RSS.
// Only /api/.../discover initiated manually by the UI can use the public source.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../../server/index.mjs';
import { loadStartBuild } from '../../../server/start-host.mjs';
import { createStartMiddleware } from '../../../server/start-adapter.mjs';
import { startDiscoveryScheduler, syncSources } from '../../../server/intelligence.mjs';
import { db, saveBrand, getBrand, saveRecord, listRecords, getSecret, setSecret } from '../../../server/db.mjs';
import { createUser, hashPassword } from '../../../server/auth.mjs';

if (process.env.DATA_DIR !== '/tmp/30x-adversarial-scheduler') throw Error('Own DATA_DIR required');
const out = path.resolve('docs/adversarial/evidence/scheduler-runtime.json');
const log = { simulated: true, wallStartedAt: new Date().toISOString(), pid: process.pid, cases: [], commands: [] };
const persist = () => fs.writeFileSync(out, JSON.stringify(log, null, 2));
const MIN = 60000;
let now = Date.now(), mode = 'success', selected = [], calls = [], fetches = [], schedulers = [], lastResult;
const uiId = 'scheduler-ui';
const emptyId = 'scheduler-empty';
const disabledId = 'scheduler-disabled';
const suiteId = 'scheduler-suite';
function fixtureBrand(id, name) {
  return saveBrand({ id, name, description: 'Prueba SIMULADA de actualización automática.', industry: 'Educación', market: 'Latinoamérica', language: 'Español', website: '', color: '#c4f168', secondaryColor: '#161b17', tone: 'Claro y práctico', goals: ['Ayudar a equipos a aprender IA'], pillars: ['inteligencia artificial'], audience: [{ id: 'scheduler-audience', name: 'Equipos', role: 'Profesionales', stage: 'Aprendizaje', needs: 'Aprender IA', description: 'Segmento declarado sintético' }], weeklyTarget: 3 });
}
function source(id, enabled = true, brand = suiteId, lastSyncedAt) {
  return saveRecord(brand, 'sources', { id, name: `SIMULADA ${id}`, type: 'rss', enabled, url: `https://example.com/${id}.xml`, ...(lastSyncedAt ? { lastSyncedAt } : {}) });
}
function clean(brand) {
  db.prepare('DELETE FROM records WHERE brand_id=?').run(brand);
  db.prepare('DELETE FROM activity WHERE brand_id=?').run(brand);
  setSecret(brand, 'discoveryScheduler', null);
}
function schedulerState(id) { return getSecret(id, 'discoveryScheduler'); }
function state(id = uiId) {
  return { now, nowISO: new Date(now).toISOString(), mode, selected, calls: calls.slice(), fetches: fetches.slice(), scheduler: schedulerState(id), sources: listRecords(id, 'sources'), references: listRecords(id, 'references').map(({ id, title, sourceId, source, url, status }) => ({ id, title, sourceId, source, url, status })), activity: db.prepare('SELECT text,created_at FROM activity WHERE brand_id=? ORDER BY rowid DESC LIMIT 5').all(id), lastResult };
}
async function discover(brand) {
  calls.push({ brand: brand.id, now, mode });
  if (mode === 'throw') throw Error('Fallo superior SIMULADO');
  lastResult = await syncSources(brand, { now, fetcher: async (url) => {
    const address = String(url);
    fetches.push({ url: address, mode, now });
    if (mode === 'failure' || (mode === 'partial' && address.includes('secondary'))) throw Error('Fallo RSS SIMULADO, sin red');
    const marker = address.includes('secondary') ? 'Control de calidad educativo' : 'Automatización responsable para equipos';
    return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>SIMULADO scheduler</title><item><title>SIMULADA: ${marker}</title><link>https://example.com/scheduler/${address.includes('secondary') ? 'secondary' : 'primary'}</link><guid>${address}</guid><description>Fixture SIMULADA sobre inteligencia artificial para una auditoría de cadencia.</description><pubDate>Sun, 18 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml' } });
  } });
  return lastResult;
}
function make(extra = {}) {
  const runtime = startDiscoveryScheduler({ intervalMs: 1, tickMs: 2147483647, clock: () => now, discover, listBrands: () => selected.map(getBrand), ...extra });
  schedulers.push(runtime);
  return runtime;
}
function expect(name, expected, actual, passed) {
  log.cases.push({ name, expected, actual: structuredClone(actual), verdict: passed ? 'PASS' : 'FAIL' });
  persist();
}
async function suite() {
  const base = Date.now();
  selected = [suiteId]; calls = []; fetches = []; clean(suiteId);
  source('suite-primary', true, suiteId, new Date(base).toISOString());
  const s = make(); mode = 'success'; now = base + 10 * MIN - 1;
  await s.runOnce(); const before = calls.length;
  now++; await s.runOnce(); const first = calls.length;
  const successState = schedulerState(suiteId);
  now += 10 * MIN - 1; await s.runOnce(); const beforeSecond = calls.length;
  now++; await s.runOnce();
  expect('Minimum cadence, exact 10-minute boundary, and repeat', '0 calls at 599999 ms; 1 at 600000 ms; second only after another 600000 ms.', { before, first, beforeSecond, afterSecond: calls.length, successState }, before === 0 && first === 1 && beforeSecond === 1 && calls.length === 2);
  s.stop();

  clean(suiteId); source('suite-primary'); now = base; selected = [suiteId]; calls = []; mode = 'success';
  let release; let entries = 0;
  const blocked = make({ discover: async () => { entries++; await new Promise(r => release = r); return { sources: [{ id: 'suite-primary' }] }; } });
  const waiting = blocked.runOnce(); await Promise.resolve(); await blocked.runOnce(); await blocked.runOnce();
  const concurrent = entries; release(); await waiting; await blocked.runOnce();
  expect('Non-reentrancy within a scheduler', 'Concurrent ticks invoke discovery once; immediate repeated tick respects cadence.', { concurrent, finalEntries: entries }, concurrent === 1 && entries === 1); blocked.stop();

  clean(suiteId); clean(emptyId); clean(disabledId);
  source('suite-primary'); source('suite-disabled', false); source('disabled-only', false, disabledId);
  selected = [emptyId, disabledId, suiteId]; calls = []; fetches = []; now = base; const enabled = make();
  await enabled.runOnce();
  expect('Brands and sources eligibility', 'Only brand with enabled sources discovered; disabled source never fetched.', { calls, fetches, emptyScheduler: schedulerState(emptyId), disabledScheduler: schedulerState(disabledId) }, calls.length === 1 && calls[0].brand === suiteId && fetches.length === 1 && !fetches[0].url.includes('disabled') && schedulerState(emptyId) === null && schedulerState(disabledId) === null); enabled.stop();

  clean(suiteId); source('suite-primary'); selected = [suiteId]; calls = []; mode = 'failure'; now = base; const backoff = make();
  const delays = [], counts = [], boundaryCounts = [];
  for (let n = 1; n <= 10; n++) {
    await backoff.runOnce(); const metadata = schedulerState(suiteId);
    delays.push((metadata.nextAttemptAt - now) / MIN); counts.push(metadata.failures);
    now = metadata.nextAttemptAt - 1; await backoff.runOnce(); boundaryCounts.push(calls.length); now++;
  }
  expect('All-source failures exponential backoff and 6-hour cap', 'Delay minutes 20,40,80,160,320,360,360,360,360,360; failure count saturates at 8; no call 1 ms before each boundary.', { delays, counts, boundaryCounts, calls: calls.length }, JSON.stringify(delays) === JSON.stringify([20,40,80,160,320,360,360,360,360,360]) && counts[9] === 8 && boundaryCounts.every((n, i) => n === i + 1));
  mode = 'success'; await backoff.runOnce(); const recovered = schedulerState(suiteId);
  expect('Full success clears failed streak', 'After prior failures, failures=0 and nextAttemptAt=now+10 min.', recovered, recovered.failures === 0 && recovered.nextAttemptAt - now === 10 * MIN); backoff.stop();

  clean(suiteId); source('suite-primary'); source('suite-secondary'); selected = [suiteId]; mode = 'failure'; now = base; calls = []; const partial = make();
  await partial.runOnce(); now = schedulerState(suiteId).nextAttemptAt; mode = 'partial'; await partial.runOnce(); const partly = schedulerState(suiteId);
  expect('Partial failure preserves successful results and clears backoff', 'One failed source plus one successful RSS persists reference and resets failures=0/cadence=10 min.', { scheduler: partly, result: lastResult, sources: listRecords(suiteId, 'sources'), references: listRecords(suiteId, 'references').map(r => ({ title: r.title, sourceId: r.sourceId })) }, partly.failures === 0 && partly.nextAttemptAt - now === 10 * MIN && lastResult.errors.length === 1 && listRecords(suiteId, 'references').length === 1); partial.stop();

  clean(suiteId); source('suite-primary'); selected = [suiteId]; now = base; mode = 'throw'; const thrown = make(); await thrown.runOnce();
  const thrownState = schedulerState(suiteId); expect('Thrown discovery error', 'Error does not reject tick; failure=1 and activity explains pending update.', { scheduler: thrownState, activity: db.prepare('SELECT text FROM activity WHERE brand_id=?').all(suiteId) }, thrownState.failures === 1 && db.prepare('SELECT COUNT(*) AS n FROM activity WHERE brand_id=?').get(suiteId).n === 1); thrown.stop();

  clean(suiteId); source('suite-primary'); selected = [suiteId]; calls = []; mode = 'success'; now = base; const stopped = make(); stopped.stop(); await stopped.runOnce(); now += 100000000; await stopped.runOnce();
  expect('stop suppresses subsequent ticks', 'No discovery calls or scheduler metadata after stop.', { calls, scheduler: schedulerState(suiteId) }, calls.length === 0 && schedulerState(suiteId) === null);
  process.env.DISCOVERY_ENABLED = 'false'; const disabled = make(); await disabled.runOnce(); disabled.stop(); process.env.DISCOVERY_ENABLED = 'true';
  expect('DISCOVERY_ENABLED=false', 'No discovery calls or metadata when disabled.', { calls, scheduler: schedulerState(suiteId) }, calls.length === 0 && schedulerState(suiteId) === null);
  selected = []; persist(); return log.cases;
}

for (const [id, name] of [[uiId, 'Scheduler · auditoría SIMULADA'], [suiteId, 'Scheduler suite aislada'], [emptyId, 'Sin fuentes SIMULADA'], [disabledId, 'Fuentes pausadas SIMULADA']]) fixtureBrand(id, name);
const email = 'qa-scheduler@example.com';
let user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (!user) user = createUser({ name: 'QA Scheduler', email, passwordHash: await hashPassword(process.env.QA_SCHEDULER_PASSWORD || (() => { throw Error('QA_SCHEDULER_PASSWORD required'); })()) });
db.prepare("INSERT OR IGNORE INTO members(brand_id,user_id,role) VALUES(?,?,'owner')").run(uiId, user.id);
const { serverEntry, clientDirectory } = await loadStartBuild();
const app = createApp({ webHandler: createStartMiddleware(serverEntry), staticDirectory: clientDirectory });
let uiScheduler;
async function command(body) {
  let result;
  if (body.action === 'suite') result = await suite();
  else if (body.action === 'ui-success') {
    clean(uiId); source('ui-primary', true, uiId); source('ui-secondary', true, uiId); source('ui-paused', false, uiId);
    selected = [uiId]; calls = []; fetches = []; now = Date.now(); mode = 'success'; uiScheduler?.stop(); uiScheduler = make(); await uiScheduler.runOnce(); result = state();
  } else if (body.action === 'ui-failure') {
    now = Math.max(schedulerState(uiId).nextAttemptAt, ...listRecords(uiId, 'sources').flatMap(s => [Date.parse(s.lastSyncedAt) + 10 * MIN || 0, Date.parse(s.lastAttemptAt) + 10 * MIN || 0])); mode = 'failure'; await uiScheduler.runOnce(); result = state();
  } else if (body.action === 'ui-partial') {
    now = Math.max(schedulerState(uiId).nextAttemptAt, ...listRecords(uiId, 'sources').flatMap(s => [Date.parse(s.lastSyncedAt) + 10 * MIN || 0, Date.parse(s.lastAttemptAt) + 10 * MIN || 0])); mode = 'partial'; await uiScheduler.runOnce(); result = state();
  } else if (body.action === 'manual-prepare') {
    clean(uiId); source('ui-primary', true, uiId);
    const current = listRecords(uiId, 'sources')[0];
    saveRecord(uiId, 'sources', { ...current, name: 'NASA RSS · actualización manual pública', url: 'https://www.nasa.gov/feed/' });
    now = Date.now() - 11 * MIN; mode = 'failure'; selected = [uiId]; calls = []; fetches = []; uiScheduler?.stop(); uiScheduler = make(); await uiScheduler.runOnce(); result = state();
  } else if (body.action === 'manual-after') {
    const before = state(); const synced = Math.max(...before.sources.map(s => Date.parse(s.lastSyncedAt) || 0));
    if (!synced) throw Error('UI manual success needed first');
    now = synced + 10 * MIN; mode = 'failure'; await uiScheduler.runOnce();
    const after = state();
    log.policyObservations = [{ name: 'Manual success and failure streak', productRequirementConfirmed: false, hypothesis: 'Full streak reset would give failures=1 and delay=20 min.', actual: { previousFailures: before.scheduler.failures, failures: after.scheduler.failures, delayMinutes: (after.scheduler.nextAttemptAt - now) / MIN }, experimentalHypothesisVerdict: after.scheduler.failures === 1 ? 'PASS' : 'FAIL', productDefect: false }];
    expect('Scheduled retry after successful UI manual refresh', 'The next eligible scheduled tick runs and preserves imported references even if discovery fails.', { before, after, delayMinutes: (after.scheduler.nextAttemptAt - now) / MIN }, after.calls.length === before.calls.length + 1 && after.references.length === before.references.length); result = { before, after };
  } else if (body.action === 'state') result = state();
  else throw Error('Unknown action');
  log.commands.push({ action: body.action, wallAt: new Date().toISOString(), result }); persist(); return result;
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/__scheduler' && req.method === 'POST') {
    try { let raw = ''; for await (const chunk of req) raw += chunk; const result = await command(JSON.parse(raw)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); }
    catch(error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
  } else app(req, res);
});
server.listen(4121, '127.0.0.31', () => { persist(); console.log(`scheduler audit PID ${process.pid}: http://127.0.0.31:4121 (periodic tick parked; injected discover only)`); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { schedulers.forEach(s => s.stop()); log.wallStoppedAt = new Date().toISOString(); persist(); server.close(() => process.exit(0)); });
