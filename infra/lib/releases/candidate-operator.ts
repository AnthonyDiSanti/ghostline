import { CloudFormationClient, GetTemplateCommand } from '@aws-sdk/client-cloudformation';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { GetFunctionConfigurationCommand, InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDeployment } from '../config.js';
import { configuredArtifacts } from '../image-artifacts.js';
import { assertCurrentBuildQualification } from '../platform-qualification.js';
import { releaseTag } from '../ecs-release.js';
import { withLifecycle } from '../lifecycle-operator.js';
import { deploymentChanges, deployWithGreen } from '../infrastructure-rollout.js';
import { assertNativeDeploymentSettled } from '../host-slot-lifecycle.js';
import { command, credentials, operatorGate, registry, root, awsProfile } from './operator.js';
import { candidateManifest, immutableReadiness, readCandidate, type CandidateTrial, type TrialCandidate } from './candidates.js';
import { trialSourceDigest } from './trial-source.js';
import { readiness, regionalReadiness } from './gate.js';
import { generationMatchesContract } from './rollout-controller.js';
import { publishQualifiedImage } from './image-publication.js';
import { digestPattern, emptyConfig, releaseRepository, repository, type Release } from './model.js';
import { releaseAutomationMode } from './automation.js';
import { TrialStacks, templateObject } from './trial-stacks.js';
import { gateName, releaseStackName } from './names.js';
import type { Rollout } from './blue-green.js';

export async function candidateOperation(target: string, action: string, argument?: string): Promise<void> {
  const config = getDeployment(target), names = configuredArtifacts(config);
  const destination = registry(config.region), lambda = new LambdaClient({ region: config.region, credentials });
  const cfn = new CloudFormationClient({ region: config.region, credentials });
  const aws = (args: string[]) => JSON.parse(command('aws', ['--profile', awsProfile, '--region', config.region, ...args, '--output', 'json']) || '{}');
  const captures = new TrialStacks(config, cfn, aws);
  const folder = resolve(root, '.local/deployments', config.id, 'trial');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const configuration = async () => (await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: gateName }))).Environment!.Variables!;
  const wake = async () => {
    const result = await lambda.send(new InvokeCommand({ FunctionName: gateName, Payload: Buffer.from(JSON.stringify({ action: 'reconcile' })) }));
    if (result.FunctionError) throw new Error('Trial handoff needs inspection; regional exclusion remains.');
  };
  const load = async (reference: string) => {
    if (!digestPattern.test(reference)) throw new Error('Candidate requires an immutable artifact digest.');
    const artifact = await destination.get(releaseRepository, reference);
    if (!artifact) throw new Error('Candidate artifact is unavailable.');
    const candidate = readCandidate(artifact);
    if (candidate.target !== config.id || candidate.account !== config.account || candidate.region !== config.region) throw new Error('Candidate scope mismatch.');
    return candidate;
  };
  const currentSources = (candidate: TrialCandidate) => {
    if (candidate.frameworkDigest !== trialSourceDigest() || names.some(name => candidate.sourceInputs[name] !== releaseTag(name))) {
      throw new Error('Executable inputs changed after candidate staging. Finish/return this trial before staging another candidate.');
    }
  };
  const trialCdk = (kind: 'gateway' | 'release', candidate: TrialCandidate, trial: CandidateTrial, verb: 'synth' | 'diff' | 'deploy') => {
    const candidateFile = resolve(folder, 'candidate.json'), trialFile = resolve(folder, 'current.json');
    writeFileSync(candidateFile, JSON.stringify(candidate), { mode: 0o600 });
    writeFileSync(trialFile, JSON.stringify(trial), { mode: 0o600 });
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const app = `node --import=tsx bin/trial.ts ${[config.id, kind, candidateFile, trialFile].map(quote).join(' ')}`;
    const stack = kind === 'gateway' ? config.stackName : releaseStackName;
    const args = ['node_modules/aws-cdk/bin/cdk', verb, stack, '--app', app, '--profile', awsProfile, '--region', config.region,
      '--output', resolve(folder, `cdk-${kind}`)];
    if (verb === 'diff') args.push('--method', 'template');
    if (verb === 'deploy') args.push('--require-approval', 'never');
    if (verb === 'synth') args.push('--json');
    return command(process.execPath, args, undefined, verb !== 'synth');
  };
  const requireTrial = async () => {
    const gate = await operatorGate(config.id), trial = await gate.record<CandidateTrial>('trial/current');
    if (trial?.kind !== 'candidate' || trial.target !== config.id || trial.account !== config.account || trial.region !== config.region) throw new Error('No owned candidate trial is active.');
    return { gate, trial };
  };
  const verified = async (gate: Awaited<ReturnType<typeof operatorGate>>, trial: CandidateTrial) => {
    const selected = await regionalReadiness(gate), actual = await gate.generation();
    if (!selected.ready || !selected.current || !actual || !generationMatchesContract(actual, selected.current.release, gate.template)) {
      throw new Error('Trial generation is not completely verified. Keep its exclusion and inspect the native rollout.');
    }
    if (trial.phase === 'returning' && selected.current.digest !== trial.baselineRelease) throw new Error('Return selection changed.');
    return actual;
  };

  if (action === 'stage') {
    // A separate OCI artifact permits a bounded native experiment without asserting qualification or moving production aliases.
    if (!argument) throw new Error('Stage requires a complete local image qualification file.');
    const qualified: unknown = JSON.parse(readFileSync(resolve(argument), 'utf8'));
    assertCurrentBuildQualification(qualified, names);
    const gate = await operatorGate(config.id);
    if (await gate.record('trial/current')) throw new Error('Finish the existing trial before staging another candidate.');
    const selected = await readiness(destination, config.dnsRequired, !!config.derp);
    if (!selected.ready || !selected.current?.release.os.targetVersion) throw new Error('Candidate needs an existing complete baseline OS/release.');
    const images = {} as Release['images'];
    for (const name of names) images[name] = await publishQualifiedImage(destination, repository(name), name, qualified.images[name],
      args => { command('docker', args); }, console.log);
    const candidate: TrialCandidate = { schema: 1, kind: 'native-qualification', target: config.id, account: config.account, region: config.region,
      createdAt: new Date().toISOString(), localQualifiedAt: qualified.qualifiedAt, frameworkDigest: trialSourceDigest(),
      sourceInputs: Object.fromEntries(names.map(name => [name, releaseTag(name)])),
      intent: { schemaVersion: config.derp ? 5 : config.dnsRequired ? 4 : 3, promotionId: randomUUID(), promotedAt: new Date().toISOString(),
        origin: config.region, platform: 'linux/arm64', images, os: selected.current.release.os, history: [] } };
    const artifact = candidateManifest(candidate);
    await destination.uploadBlob(releaseRepository, emptyConfig);
    await destination.uploadBlob(releaseRepository, Buffer.from(JSON.stringify(candidate)));
    await destination.put(releaseRepository, artifact, `trial-${artifact.digest.slice(7)}`);
    writeFileSync(resolve(folder, 'staged.json'), JSON.stringify({ digest: artifact.digest, candidate }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ target: config.id, status: 'native-pending', candidate: artifact.digest, productionAliasesChanged: false }));
  } else if (action === 'begin') {
    if (!argument) throw new Error('Candidate begin requires the staged digest.');
    const candidate = await load(argument); currentSources(candidate);
    await withLifecycle(config, 'candidate-begin', async () => {
      const gate = await operatorGate(config.id);
      let trial = await gate.record<CandidateTrial>('trial/current');
      if (trial && (trial.kind !== 'candidate' || trial.candidate !== argument || trial.phase !== 'prepared')) throw new Error('Another trial already owns this region.');
      if (!trial) {
        assertNativeDeploymentSettled(config, aws);
        const selected = await readiness(destination, config.dnsRequired, !!config.derp), baseline = await gate.generation();
        if (!selected.ready || !selected.current || !baseline || !generationMatchesContract(baseline, selected.current.release, gate.template)) {
          throw new Error('Capture requires a verified production baseline.');
        }
        const env = await configuration(), mode = releaseAutomationMode(env.AUTOMATION, env.OPERATOR_ONLY);
        if (mode === 'held') throw new Error('Resolve the regional automation hold before a candidate trial.');
        const endpoint = await captures.capture(config.stackName), release = await captures.capture(releaseStackName);
        trial = { version: 1, id: randomUUID(), kind: 'candidate', target: config.id, account: config.account, region: config.region, endpoint: config.stackName,
          candidate: argument, phase: 'prepared', startedAt: new Date().toISOString(), baseline, baselineRelease: selected.current.digest,
          originalMode: mode, baselineTemplates: JSON.parse(env.SLOT_TEMPLATES!), endpointTemplate: endpoint.url, endpointParameters: endpoint.parameters,
          releaseTemplate: release.url, releaseParameters: release.parameters };
        if (!await gate.replace('trial/current', trial)) throw new Error('Regional trial changed concurrently.');
      }
      if (!(await immutableReadiness(destination, { digest: argument, release: candidate.intent }, !!config.dnsRequired, !!config.derp)).ready) throw new Error('Candidate image set is incomplete.');
      trialCdk('release', candidate, trial, 'diff'); trialCdk('release', candidate, trial, 'deploy');
      const env = await configuration();
      if (releaseAutomationMode(env.AUTOMATION, env.OPERATOR_ONLY) !== 'manual') throw new Error('Candidate controller did not enter manual mode.');
      console.log(JSON.stringify({ target, trial: trial.id, status: 'prepared-and-excluded', baseline: trial.baselineRelease, candidate: trial.candidate }));
    });
  } else if (action === 'deploy' || action === 'return') {
    const before = await requireTrial();
    const candidate = await load(before.trial.candidate);
    if (action === 'deploy') currentSources(candidate); // Returning the captured recipe remains possible after source edits.
    await withLifecycle(config, `candidate-${action}`, async control => {
      let { gate, trial } = await requireTrial();
      const next = { ...trial, phase: action === 'return' ? 'returning' as const : 'deploying' as const, version: trial.version + 1 };
      if (action === 'deploy' && !['prepared', 'deploying'].includes(trial.phase)) throw new Error('Candidate has already deployed; return and finish before another candidate.');
      if (!await gate.replace('trial/current', next, trial)) throw new Error('Concurrent trial transition.');
      trial = next; gate = await operatorGate(config.id);
      const env = await configuration();
      if (releaseAutomationMode(env.AUTOMATION, env.OPERATOR_ONLY) !== 'manual') throw new Error('Candidate rollout requires manual mode.');
      const old = templateObject((await cfn.send(new GetTemplateCommand({ StackName: config.stackName, TemplateStage: 'Processed' }))).TemplateBody);
      // Baseline restoration uses its captured task/env/IAM interface, not the candidate branch's newer interface.
      const desired = action === 'deploy' ? templateObject(trialCdk('gateway', candidate, trial, 'synth'))
        : captures.template({ url: trial.endpointTemplate, parameters: trial.endpointParameters });
      const changes = deploymentChanges(old, desired);
      if (action === 'return' && changes === 'none') {
        const actual = await verified(gate, trial), rollout = await gate.record<Rollout>('rollout/current');
        if (actual.template === gate.template) {
          // Native rollback may already have restored the captured recipe. Never hand off a task update that will be a no-op.
          if (rollout && !['complete', 'cleaned', 'retired'].includes(rollout.phase)) throw new Error('Clean the failed native generation before returning.');
          await captures.restore(config.stackName, { url: trial.endpointTemplate, parameters: trial.endpointParameters }, true);
          if (rollout?.phase === 'cleaned') {
            await gate.put(`trial/rollback/${trial.id}`, rollout);
            await gate.save({ ...rollout, phase: 'retired', version: rollout.version + 1 }, rollout);
          }
          return;
        }
      }
      await deployWithGreen(gate, control, changes, async () => {
        if (action === 'deploy') { trialCdk('gateway', candidate, trial, 'diff'); trialCdk('gateway', candidate, trial, 'deploy'); }
        else await captures.restore(config.stackName, { url: trial.endpointTemplate, parameters: trial.endpointParameters }, true);
      }, wake);
      await verified(gate, trial);
    });
    if (action === 'deploy') await withLifecycle(config, 'candidate-observe', async () => {
      const { gate, trial } = await requireTrial(); await verified(gate, trial);
      if (!await gate.replace('trial/current', { ...trial, phase: 'testing', version: trial.version + 1 }, trial)) throw new Error('Concurrent trial observation.');
    });
    console.log(`${config.id}: ${action === 'deploy' ? 'candidate ready for acceptance checks' : 'captured baseline restored'}; regional exclusion remains.`);
  } else if (action === 'finish') {
    await withLifecycle(config, 'candidate-finish', async () => {
      const { gate, trial } = await requireTrial();
      if (trial.phase !== 'returning') throw new Error('Return the candidate to its captured production baseline before finishing.');
      await verified(gate, trial);
      const selected = await readiness(destination, config.dnsRequired, !!config.derp);
      if (!selected.ready || selected.current?.digest !== trial.baselineRelease) throw new Error('Production intent changed during the trial. Keep exclusion and reconcile explicitly.');
      await captures.restore(releaseStackName, { url: trial.releaseTemplate, parameters: trial.releaseParameters });
      const env = await configuration();
      if (releaseAutomationMode(env.AUTOMATION, env.OPERATOR_ONLY) !== trial.originalMode || env.SLOT_TEMPLATES !== JSON.stringify(trial.baselineTemplates)) throw new Error('Captured controller configuration was not restored exactly.');
      await gate.put(`trial/history/${trial.id}`, { ...trial, phase: 'finished', verifiedAt: new Date().toISOString() });
      await gate.clients.db.send(new DeleteItemCommand({ TableName: gate.config.table, Key: { id: { S: 'trial/current' } },
        ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(trial.version) } } }));
      console.log(`${config.id}: baseline and original ${trial.originalMode} automation restored; trial exclusion cleared.`);
    });
  } else throw new Error('Unsupported candidate operation.');
}
