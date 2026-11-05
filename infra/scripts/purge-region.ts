import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { deploymentIds, getDeployment } from '../lib/config.js';
import { planRegionalPurge, purgeRegion, type PurgePlan } from '../lib/regional-purge.js';
import { regionalPurgePorts } from '../lib/regional-purge-operator.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

assertBenchmarkExclusion();
const [region, action, ...extra] = process.argv.slice(2);
if (!region || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) || !['plan', 'execute'].includes(action ?? '') || extra.length) {
  throw new Error('Usage: npm run purge-region <region> <plan|execute>');
}
const account = getDeployment(deploymentIds[0]).account;
const folder = fileURLToPath(new URL('../../.local/region-purge/', import.meta.url));
const path = resolve(folder, `${region}.json`);
const ports = regionalPurgePorts(account, region);
if (action === 'plan') {
  // Persist only names and ownership scope; the review receipt never contains parameter values or log contents.
  const plan = planRegionalPurge(account, region, await ports.inventory());
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
  console.log(JSON.stringify({ account, region, parameters: plan.parameters.length, logGroups: plan.logGroups.length,
    queues: plan.queues.length, taskDefinitions: plan.taskDefinitions.length,
    retained: ['regional GuardDuty', 'shared account CloudTrail', 'local .local/ artifacts'] }, null, 2));
  console.log(`Review the exact names and statuses in ${path} before running execute.`);
} else {
  if (!existsSync(path)) throw new Error('Run purge-region plan and review its exact resource list before execute.');
  const plan = JSON.parse(readFileSync(path, 'utf8')) as PurgePlan;
  if (plan.account !== account || plan.region !== region) throw new Error('Purge plan account or region mismatch.');
  const pending = await purgeRegion(plan, ports);
  console.log(pending.length
    ? `Regional purge submitted: ${account}/${region}; ${pending.length} ECS task definitions are still DELETE_IN_PROGRESS. Recheck with plan later.`
    : `Regional purge complete: ${account}/${region}. GuardDuty, shared CloudTrail and local artifacts remain.`);
}
