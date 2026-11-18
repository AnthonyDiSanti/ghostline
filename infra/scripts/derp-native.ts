import { DescribeRegistryCommand } from '@aws-sdk/client-ecr';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import maintained from '../deployment.json' with { type: 'json' };
import { getDeployment, getPublication } from '../lib/config.js';
import { credentials, deployReleaseRegion, operatorGate, registry, root, verifyAccount } from '../lib/releases/operator.js';
import { derpReleaseArtifacts, dnsReleaseArtifacts } from '../lib/image-artifacts.js';
import { assertCurrentBuildQualification, loadNativeQualification } from '../lib/platform-qualification.js';
import { publishQualifiedImage, type QualifiedImage } from '../lib/releases/image-publication.js';
import { applyPromotion, planPromotion } from '../lib/releases/publication.js';
import { releaseRepository, repository, type Release } from '../lib/releases/model.js';
import { stageFreshCredentials } from '../lib/region-initialization-operator.js';
import { credentialParameters, importParameters } from '../lib/parameters.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { reconcileRollout } from '../lib/releases/rollout-controller.js';
import { advanceRollout, type Rollout } from '../lib/releases/blue-green.js';
import { hostRemote, withHostDiagnostics } from '../lib/ecs-verification.js';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { emailParameter } from '../lib/releases/names.js';

const [target, action, ...extra] = process.argv.slice(2);
if (extra.length || !['initialize', 'support', 'seed', 'fault'].includes(action ?? '')) throw new Error('Usage: npm run derp:native <private-target> <initialize|support|seed|fault>');
const config = getDeployment(target), profile = getPublication();
const folder = resolve(root, '.local/deployments', config.id, 'qualification');
mkdirSync(folder, { recursive: true, mode: 0o700 });

function command(executable: string, args: string[]): string {
  // No secret-bearing subprocess output leaves this transport, including failed OpenSSL/Docker/AWS calls.
  try { return execFileSync(executable, args, { cwd: resolve(root, 'infra'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim(); }
  catch { throw new Error('Native qualification subprocess failed; output withheld.'); }
}
const aws = (args: string[]) => JSON.parse(command('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json']) || '{}');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function assertIsolated() {
  // This harness may seed unqualified platform bytes only in an isolated, explicitly private common-stack experiment.
  verifyAccount();
  if (!config.parameterPrefix?.startsWith('/ghostline/trial/') || config.account !== maintained.account
    || Object.values(maintained.deployments).some(item => item.region === config.region || item.stackName === config.stackName)
    || profile.automation || profile.members.length !== 1 || profile.members[0] !== config.region) {
    throw new Error('Native harness requires a private catalog outside every maintained region and publication mesh.');
  }
  const current = await registry(config.region).client.send(new DescribeRegistryCommand({}));
  if (current.replicationConfiguration?.rules?.some(rule => !rule.repositoryFilters?.length
    || rule.repositoryFilters.some(filter => 'ghostline/prod/'.startsWith(filter.filter ?? '') || filter.filter?.startsWith('ghostline/prod/')))) {
    throw new Error('Native qualification registry is not isolated from Ghostline replication.');
  }
}

async function initialize() {
  // Only disposable synthetic identities/contact are created; never copy a production contact or device bundle.
  const staging = resolve(folder, 'synthetic');
  if (!existsSync(resolve(staging, 'server/xray.json'))) stageFreshCredentials(staging);
  const client = new SSMClient({ region: config.region, credentials });
  await importParameters(client, config, credentialParameters(staging, config.parameterPrefix));
  // Release support has one fixed regional contact, even when gateway identities use a private trial prefix.
  const name = emailParameter, value = 'ghostline-qualification@invalid.invalid';
  let existing;
  try { existing = (await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }))).Parameter; }
  catch (error) { if ((error as Error).name !== 'ParameterNotFound') throw error; }
  if (existing && (existing.Type !== 'SecureString' || existing.Value !== value)) throw new Error('Private trial contact conflicts; no overwrite.');
  if (!existing) await client.send(new PutParameterCommand({ Name: name, Type: 'SecureString', Overwrite: false, Value: value,
    Tags: Object.entries({ ...config.globalTags, System: 'shared' }).map(([Key, Value]) => ({ Key, Value })) }));
  console.log('Private native qualification identities/contact prepared; production parameters untouched.');
}

async function seed() {
  // This is test setup, not production publication. The accepted OS is exercised with the new platform bytes before qualification.
  const qualified = JSON.parse(readFileSync(resolve(root, '.local/deployments/image-builds/qualified-derp.json'), 'utf8'));
  assertCurrentBuildQualification(qualified, derpReleaseArtifacts);
  const os = loadNativeQualification()?.os;
  if (!os || os.targetVersion !== '1.66.0') throw new Error('Native experiment must preserve the currently accepted OS.');
  const destination = registry(config.region), images = {} as Release['images'];
  for (const name of config.derp ? derpReleaseArtifacts : dnsReleaseArtifacts) {
    images[name] = await publishQualifiedImage(destination, repository(name), name, qualified.images[name] as QualifiedImage,
      args => { command('docker', args); }, console.log);
  }
  const release = await planPromotion(destination, { schemaVersion: config.derp ? 5 : 4, promotionId: randomUUID(),
    promotedAt: new Date().toISOString(), origin: config.region, platform: 'linux/arm64', images, os, history: [] }, 'derp-migration-trial');
  if (!release) { console.log('Private native experiment already selects these exact bytes.'); return; }
  const document = await destination.putRelease(releaseRepository, release, `release-${release.promotionId}`);
  await applyPromotion(destination, document, 'derp-migration-trial');
  writeFileSync(resolve(folder, `staged-${config.derp ? 'seven' : 'six'}.json`), JSON.stringify({ scope: 'unqualified-isolated-native-experiment',
    document: document.digest, release }, null, 2) + '\n', { mode: 0o600 });
  console.log(`Private native experiment staged ${config.derp ? 'seven' : 'six'} images; no maintained selector was changed.`);
}

async function derpProcesses(remote: ReturnType<typeof hostRemote>) {
  // Resolve fresh host PIDs through exact owned Docker labels; never signal a remembered/reused PID.
  const output = await remote(`apiclient exec ghostline-diagnostics -- docker -H unix:///.bottlerocket/rootfs/run/docker.sock ps --filter label=com.amazonaws.ecs.task-definition-family=${config.resourceName}-gateway --filter label=com.amazonaws.ecs.container-name=derp --format '{{.ID}}'`);
  const containers = output.trim().split(/\s+/).filter(Boolean);
  if (containers.length > 2 || containers.some(id => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error('Native DERP process ownership is ambiguous.');
  const processes: Array<{ container: string; pid: string; stopped: boolean }> = [];
  for (const container of containers) {
    const top = await remote(`apiclient exec ghostline-diagnostics -- docker -H unix:///.bottlerocket/rootfs/run/docker.sock top ${container} -eo pid,comm,stat`, true);
    if (!top) continue; // ECS may remove a failed task between the two reads.
    const rows = [...top.matchAll(/^\s*(\d+)\s+derper\s+(\S+)\s*$/gm)];
    if (rows.length !== 1 || Number(rows[0]![1]) <= 1) throw new Error('Native fault must identify exactly one DERP server process.');
    processes.push({ container, pid: rows[0]![1]!, stopped: rows[0]![2]!.includes('T') });
  }
  return processes;
}

async function fault() {
  // Explicitly force a same-byte native qualification rollout, leaving the normal unchanged-release no-op contract intact.
  if (!config.derp) throw new Error('Fault experiment requires the seven-image gateway.');
  await withLifecycle(config, 'qualification-rollout', async control => {
    const gate = await operatorGate(config.id), before = await gate.generation();
    if (!before?.images.derp) throw new Error('Verify the successful seven-image native migration first.');
    await reconcileRollout(gate, 'prepare');
    let current: Rollout | undefined;
    for (let attempt = 0; attempt < 360; attempt++) {
      current = await gate.record<Rollout>('rollout/current');
      if (!current || current.source.instance !== before.instance) throw new Error('Native fault source changed.');
      if (current.phase === 'held') throw new Error('Native preparation held before fault injection.');
      if (current.phase === 'force') break;
      await advanceRollout(gate, current);
      await pause(5000);
    }
    if (current?.phase !== 'force') throw new Error('Native force preparation remains pending.');
    const id = current.id;
    await control.handoff();
    const invoked = await new LambdaClient({ region: config.region, credentials }).send(new InvokeCommand({
      FunctionName: 'ghostline-prod-release-gate', Payload: Buffer.from(JSON.stringify({ action: 'reconcile' })) }));
    if (invoked.FunctionError) throw new Error('Native fault rollout handoff is pending.');
    let instance: string | undefined;
    for (let attempt = 0; attempt < 180; attempt++) {
      current = await gate.record<Rollout>('rollout/current');
      if (current?.id !== id) throw new Error('Native fault rollout identity changed.');
      if (current.direction === 'green') {
        const green = await gate.observer.read(current.green);
        instance = green.instance?.InstanceId;
        if (!instance) throw new Error('Native green host is unavailable for controlled fault.');
        break;
      }
      if (['held', 'complete'].includes(current.phase)) throw new Error('Native rollout settled before fault injection.');
      await pause(5000);
    }
    if (!instance) throw new Error('Native handoff remains pending; inspect before continuing qualification.');
    const remote = hostRemote(instance, folder, aws), stopped = new Set<string>();
    let maximumHealthFailures = 0;
    await withHostDiagnostics(remote, async () => {
      const resume = async () => {
        // Restore only processes this experiment stopped and still owned by the same live container.
        for (const process of await derpProcesses(remote)) if (process.stopped && stopped.has(`${process.container}/${process.pid}`)) {
          await remote(`apiclient exec ghostline-diagnostics -- kill -CONT ${process.pid}`);
        }
      };
      try {
        for (let attempt = 0; attempt < 180; attempt++) {
          current = await gate.record<Rollout>('rollout/current');
          if (current?.id !== id) throw new Error('Native fault rollout identity changed.');
          maximumHealthFailures = Math.max(maximumHealthFailures, current.healthFailures ?? 0);
          if (current.direction === 'green') {
            // SIGSTOP the application, not Docker: health commands must continue, including on replacement tasks.
            for (const process of await derpProcesses(remote)) if (!process.stopped) {
              await remote(`apiclient exec ghostline-diagnostics -- kill -STOP ${process.pid}`);
              stopped.add(`${process.container}/${process.pid}`);
              console.log('Isolated green DERP process stopped with health checks live; sustain across task replacement.');
            }
          }
          if (current.phase === 'held' && current.direction === 'blue') {
            await resume();
            const native = aws(['ecs', 'describe-service-deployments', '--service-deployment-arns', current.deployment!.deployment]).serviceDeployments?.[0];
            if (native?.status === 'ROLLBACK_SUCCESSFUL') {
              if (!stopped.size || !maximumHealthFailures) throw new Error('Native rollback did not observe the controlled DERP health failure.');
              writeFileSync(resolve(folder, 'native-rollback.json'), JSON.stringify({ at: new Date().toISOString(), rollout: id,
                mechanism: 'derper-sigstop-with-live-healthchecks', status: native.status, source: before.instance,
                direction: current.direction, healthFailures: maximumHealthFailures, failure: current.failure }, null, 2) + '\n', { mode: 0o600 });
              console.log('Native DERP health failure rolled back both addresses to the verified source; explicit cleanup next.');
              return;
            }
          }
          if (current.phase === 'complete') throw new Error('Native rollout completed without the required health-failure rollback.');
          await pause(5000);
        }
        throw new Error('Native fault observation remains pending; inspect its recorded operation.');
      } finally { await resume(); }
    });
  });
}

try {
  await assertIsolated();
  if (action === 'initialize') await initialize();
  else if (action === 'support') await deployReleaseRegion(config.region, 'manual');
  else if (action === 'seed') await seed();
  else await fault();
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `Native qualification failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
}
