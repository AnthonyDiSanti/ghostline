import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { getDeployment } from '../lib/config.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { credentials, operatorGate, root, verifyAccount } from '../lib/releases/operator.js';
import { readiness } from '../lib/releases/gate.js';
import { generationMatchesIntent } from '../lib/releases/rollout-controller.js';
import { releaseAutomationMode } from '../lib/releases/automation.js';
import { reportTrialExclusion, type ActiveTrial } from '../lib/releases/trial-exclusions.js';
import type { Generation } from '../lib/releases/blue-green.js';
import { resolve } from 'node:path';

interface Trial extends ActiveTrial { baseline: Generation; originalMode: 'manual'; verifiedAt?: string }
const [target, action, ...extra] = process.argv.slice(2);
if (extra.length || !['begin', 'deploy', 'status', 'finish'].includes(action ?? '')) throw new Error('Usage: npm run trial <target> <begin|deploy|status|finish>');
const config = getDeployment(target);
async function manual() {
  // Release intent is already staged by the normal publication transaction; this tool coordinates regional operations only.
  const response = await new LambdaClient({ region: config.region, credentials }).send(new GetFunctionConfigurationCommand({ FunctionName: 'ghostline-prod-release-gate' }));
  if (releaseAutomationMode(response.Environment?.Variables?.AUTOMATION, response.Environment?.Variables?.OPERATOR_ONLY) !== 'manual') {
    throw new Error('Put this region in existing manual release mode before beginning a trial.');
  }
}
async function verified(gate: Awaited<ReturnType<typeof operatorGate>>, trial: Trial) {
  const selected = await readiness(gate.registry, config.dnsRequired, !!config.derp);
  const actual = await gate.generation();
  if (!selected.ready || selected.current?.digest !== trial.candidate || !actual
    || !generationMatchesIntent(actual, selected.current.release) || actual.os !== selected.current.release.os.targetVersion) {
    throw new Error('Trial does not match the current complete production intent; inspect before removing exclusion.');
  }
  return actual;
}
try {
  verifyAccount();
  if (action === 'status') {
    const gate = await operatorGate(config.id);
    console.log(JSON.stringify({ target, trial: await gate.record('trial/current'), rollout: await gate.record('rollout/current') }, null, 2));
  } else if (action === 'begin') {
    await withLifecycle(config, 'candidate-begin', async () => {
      await manual();
      const gate = await operatorGate(config.id), previous = await gate.record<Trial>('trial/current');
      if (previous) { console.log(JSON.stringify({ status: 'already-excluded', target, trial: previous.id })); return; }
      const selected = await readiness(gate.registry, config.dnsRequired, !!config.derp), baseline = await gate.generation();
      if (!selected.ready || !selected.current || !baseline) throw new Error('Trial needs staged production intent and a verified running baseline.');
      const trial: Trial = { version: 1, id: randomUUID(), target: config.id, candidate: selected.current.digest,
        phase: 'deploying', startedAt: new Date().toISOString(), baseline, originalMode: 'manual' };
      if (!await gate.replace('trial/current', trial)) throw new Error('Regional exclusion changed concurrently.');
      console.log(JSON.stringify({ status: 'excluded', target, trial: trial.id, candidate: trial.candidate }));
    });
  } else if (action === 'deploy') {
    const gate = await operatorGate(config.id), trial = await gate.record<Trial>('trial/current');
    if (!trial) throw new Error('Begin the bounded regional trial first.');
    await manual();
    // Reject changed intent before invoking any deployment, as well as checking it again afterward.
    const selected = await readiness(gate.registry, config.dnsRequired, !!config.derp);
    if (!selected.ready || selected.current?.digest !== trial.candidate) {
      throw new Error('Production intent changed during this trial; inspect it before deploying.');
    }
    const lifecycle = await gate.record<{ operation?: { owner: string } }>('lifecycle');
    if (lifecycle?.operation?.owner === 'regional-release-controller') throw new Error('Native rollout still owns this trial; observe status until it settles.');
    const result = spawnSync(process.execPath, ['--import=tsx', 'scripts/ecs.ts', config.id, 'deploy'], {
      cwd: resolve(root, 'infra'), stdio: 'inherit', env: { ...process.env, GHOSTLINE_TRIAL_ID: trial.id },
    });
    if (result.error || result.status !== 0) throw new Error('Trial deployment remains excluded; inspect its native rollout and receipt.');
    await withLifecycle(config, 'candidate-observe', async () => {
      const current = await gate.record<Trial>('trial/current');
      if (current?.id !== trial.id) throw new Error('Regional trial identity changed.');
      await verified(gate, current);
      if (!await gate.replace('trial/current', { ...current, version: current.version + 1, phase: 'testing' }, current)) throw new Error('Trial observation changed concurrently.');
    });
    console.log(`${config.id}: production canary deployed; exclusion remains during acceptance checks.`);
  } else {
    await withLifecycle(config, 'candidate-finish', async () => {
      await manual();
      const gate = await operatorGate(config.id), trial = await gate.record<Trial>('trial/current');
      if (!trial) { console.log(`${config.id}: no active trial exclusion.`); return; }
      await verified(gate, trial);
      await gate.put(`trial/history/${trial.id}`, { ...trial, phase: 'finished', verifiedAt: new Date().toISOString() });
      await gate.clients.db.send(new DeleteItemCommand({ TableName: gate.config.table, Key: { id: { S: 'trial/current' } },
        ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(trial.version) } } }));
      console.log(`${config.id}: verified production canary closed; original manual mode retained, exclusion cleared.`);
    });
  }
} catch (error) {
  if (reportTrialExclusion(error)) process.exitCode = 3;
  else {
    console.error(error instanceof Error && error.constructor === Error ? error.message : `Trial operation failed (${(error as Error).name}); details withheld.`);
    process.exitCode = 1;
  }
}
