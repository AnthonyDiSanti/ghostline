import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { destroyRegion, type DestroyJournal } from '../lib/regional-destroy.js';
import { regionalDestroyPorts } from '../lib/regional-destroy-operator.js';

assertBenchmarkExclusion();
const [target, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: npm run destroy <deployment>');
const config = getDeployment(target);
const folder = fileURLToPath(new URL(`../../.local/deployments/${config.id}/`, import.meta.url));
const path = resolve(folder, 'regional-cleanup.json');
mkdirSync(folder, { recursive: true, mode: 0o700 });
let reportedPhase: string | undefined;
const save = (journal: DestroyJournal) => {
  // Atomically persist exact ownership and the next resumable phase; this journal contains no credentials or snapshots.
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
  // Long cloud waiters should still expose the durable checkpoint without dumping resource or credential contents.
  if (reportedPhase !== journal.phase) console.log(`${config.id}: cleanup ${journal.phase}.`);
  reportedPhase = journal.phase;
};
const ports = regionalDestroyPorts(config, save);
let previous: DestroyJournal | undefined = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
if (previous?.phase === 'complete') {
  const current = await ports.inventory();
  // A deliberate redeploy starts a new generation; never reuse the old ARN inventory for it.
  if (current.stacks.length && current.stacks.some(s => !previous!.stacks.some(old => old.id === s.id))) previous = undefined;
}
try {
  const result = await destroyRegion(config, ports, previous);
  console.log(JSON.stringify({ target: config.id, phase: result.phase, retained: result.retained,
    persistent: ['Standard Parameter Store credentials', 'enabled regional GuardDuty', 'independent account CloudTrail'], pending: result.pending }, null, 2));
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `Regional cleanup failed (${(error as Error).name}).`);
  console.error(`Resume with the same command; exact pending work is recorded in ${path}.`);
  process.exitCode = 1;
}
