// Additional dynamic control with synthetic prior scheduler history.
// No external network. syncSources persists the simulated manual success.
import fs from 'node:fs';
import { startDiscoveryScheduler, syncSources } from '../../../server/intelligence.mjs';
import { getBrand, saveRecord, listRecords, setSecret, getSecret, db } from '../../../server/db.mjs';
if (process.env.DATA_DIR !== '/tmp/30x-adversarial-scheduler') throw Error('Own data required');
const id = 'scheduler-suite', brand = getBrand(id), min = 60000;
db.prepare('DELETE FROM records WHERE brand_id=?').run(id);
saveRecord(id, 'sources', { id: 'reset-control', name: 'SIMULADA control de reset manual', type: 'rss', enabled: true, url: 'https://example.com/reset-control.xml' });
const baseline = Date.now();
const previous = { lastAttemptAt: baseline - min, failures: 8, nextAttemptAt: baseline - min + 6 * 3600000 };
setSecret(id, 'discoveryScheduler', previous);
const manualResult = await syncSources(brand, { now: baseline, fetcher: async () => new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>SIMULADO</title><item><title>SIMULADA recuperación manual de IA</title><link>https://example.com/reset-control</link><description>Fixture sin tráfico externo</description></item></channel></rss>') });
const manualSource = listRecords(id, 'sources')[0];
const now = Date.parse(manualSource.lastSyncedAt) + 10 * min;
let calls = 0;
const scheduler = startDiscoveryScheduler({ intervalMs: 1, tickMs: 2147483647, clock: () => now, listBrands: () => [brand], discover: async b => { calls++; return syncSources(b, { now, fetcher: async () => { throw Error('Fallo después del éxito manual SIMULADO'); } }); } });
await scheduler.runOnce(); scheduler.stop();
const after = getSecret(id, 'discoveryScheduler');
const result = {
  simulated: true,
  explanation: 'Prior failures=8/6h is a fixture, manual success is syncSources with simulated RSS. This is separate from the real BBC manual UI success.',
  expected: { retryBeforeOldDeadline: true, failuresAfterFirstNewFailure: 1, delayMinutes: 20 },
  observed: { previous, manualResult, manualSource, now, calls, after, retryBeforeOldDeadline: calls === 1 && now < previous.nextAttemptAt, delayMinutes: (after.nextAttemptAt - now) / min },
  verdicts: { manualSuccessSupersedesOldDeadline: calls === 1 && now < previous.nextAttemptAt ? 'PASS' : 'FAIL' },
  policyObservation: { productRequirementConfirmed: false, resetsFailureStreak: after.failures === 1, experimentalHypothesisVerdict: after.failures === 1 && after.nextAttemptAt - now === 20 * min ? 'PASS' : 'FAIL', productDefect: false, note: 'Full streak reset was an experimental hypothesis; no explicit product promise was found. The documented retry behavior passes.' },
};
fs.writeFileSync('docs/adversarial/evidence/scheduler-manual-reset-control.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
