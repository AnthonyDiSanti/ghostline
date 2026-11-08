import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { getDeployment } from '../lib/config.js';
import { executeInitialization, planInitialization, validateInitializationPlan, type InitializationPlan } from '../lib/region-initialization.js';
import { initializationOperator } from '../lib/region-initialization-operator.js';
import { parseJson } from '../lib/xray-config.js';

assertBenchmarkExclusion();
const [target, action, ...extra] = process.argv.slice(2);
const config = getDeployment(target);
const root = fileURLToPath(new URL('../../.local/region-init/', import.meta.url));
const folder = resolve(root, config.id);
const operator = initializationOperator(config, root);

try {
  if (action === 'plan') {
    // Review metadata and exact source selection before any private value is generated or read.
    if (extra.length && (extra.length !== 2 || extra[0] !== '--alerts-from')) throw new Error('Usage: npm run init-region -- <target> plan [--alerts-from <target>]');
    const source = extra[1] ? getDeployment(extra[1]) : undefined;
    if (source && source.account !== config.account) throw new Error('Alert source account mismatch.');
    const alertsFrom = source ? { id: source.id, account: source.account, region: source.region } : undefined;
    const plan = planInitialization(config, await operator.observe(alertsFrom), alertsFrom);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const path = resolve(folder, `${plan.id}.json`);
    writeFileSync(path, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ account: config.account, region: config.region, target: config.id, actions: plan.actions,
      credentialParameters: plan.actions.credentials === 'create' ? 6 : 0, alertsFrom: plan.alertsFrom?.id,
      retained: ['existing endpoint/credentials', 'image publication', 'GuardDuty', 'shared CloudTrail'] }, null, 2));
    console.log(`Review plan: ${path}`);
  } else if (action === 'execute') {
    if (extra.length !== 1) throw new Error('Usage: npm run init-region -- <target> execute <reviewed-plan-file>');
    const plan = parseJson(readFileSync(resolve(extra[0]!), 'utf8')) as InitializationPlan;
    validateInitializationPlan(plan, config);
    // Serialize local writers without expiring or stealing an uncertain operation's lock.
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const lock = resolve(folder, 'execute.lock');
    if (existsSync(lock)) throw new Error('Initialization is already running or interrupted; inspect its local lock before resuming.');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, planDigest: plan.digest }) + '\n', { flag: 'wx', mode: 0o600 });
    try { console.log(JSON.stringify(await executeInitialization(plan, config, operator.execution(plan)), null, 2)); }
    finally { rmSync(lock); }
  } else throw new Error('Select plan or execute.');
} catch (error) {
  // SDK/parser errors can quote private inputs; expose only fixed domain messages or exception names.
  console.error(error instanceof Error && error.constructor === Error ? error.message
    : `Region initialization failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
}
