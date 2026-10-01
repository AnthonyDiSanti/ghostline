import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { deploymentIds, getDeployment, type DeploymentConfig } from '../lib/config.js';
import { deploymentCommand } from '../lib/commands.js';
import { readiness } from '../lib/releases/gate.js';
import { operatorGate, registry } from '../lib/releases/operator.js';
import type { Rollout } from '../lib/releases/blue-green.js';
import { assertNativeDeploymentSettled, removeRegionalHosts } from '../lib/host-slot-lifecycle.js';
import { verifyOfficialBottlerocketImage } from '../lib/bottlerocket-os.js';
import { assertInstanceMemory } from '../lib/ecs-memory.js';

const infraDir = fileURLToPath(new URL('../', import.meta.url));

function aws(config: DeploymentConfig, args: string[], region = config.region) {
  // Only nonsecret metadata is queried here; argument arrays avoid shell interpolation.
  const output = execFileSync('aws', ['--profile', 'personal', '--region', region, ...args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  // Successful waiters and several mutations return no body; they still completed successfully.
  return output.trim() ? JSON.parse(output) : {};
}

async function preflight(config: DeploymentConfig) {
  // Fail before diff/deploy if regional prerequisites or the operator's account do not match.
  const identity = aws(config, ['sts', 'get-caller-identity'], 'eu-central-1');
  if (identity.Account !== config.account) throw new Error('AWS profile account does not match deployment.');
  const regions = aws(config, ['ec2', 'describe-regions', '--all-regions'], 'eu-central-1');
  const status = regions.Regions.find((region: { RegionName: string }) => region.RegionName === config.region)?.OptInStatus;
  if (!['opted-in', 'opt-in-not-required'].includes(status)) {
    throw new Error(`${config.region} is not enabled yet (${status}). Enable it explicitly and wait before retrying.`);
  }
  const selectedRelease = await readiness(registry(config.region));
  const version = selectedRelease.current?.release.os.targetVersion;
  if (!selectedRelease.ready || !version) throw new Error('Preflight requires a complete local release with a centrally qualified OS.');
  const channel = `/aws/service/bottlerocket/aws-ecs-3/arm64/${version}`;
  const parameters = aws(config, ['ssm', 'get-parameters', '--names', `${channel}/image_id`, `${channel}/image_version`]).Parameters;
  const selected = (name: string) => parameters.find((p: any) => p.Name === `${channel}/${name}`)?.Value;
  if (!/^ami-[a-f0-9]{17}$/.test(selected('image_id') ?? '')) throw new Error('Official Bottlerocket launch channel is unavailable.');
  const image = aws(config, ['ec2', 'describe-images', '--owners', 'amazon', '--image-ids', selected('image_id')]).Images[0];
  verifyOfficialBottlerocketImage({ owner: image?.ImageOwnerAlias, architecture: image?.Architecture,
    state: image?.State, name: image?.Name }, selected('image_version'));
  const type = aws(config, ['ec2', 'describe-instance-types', '--instance-types', config.instanceType]).InstanceTypes[0];
  assertInstanceMemory(config.instanceType, type?.MemoryInfo?.SizeInMiB);
  const zones = aws(config, ['ec2', 'describe-availability-zones', '--zone-names', config.availabilityZone]);
  if (zones.AvailabilityZones[0]?.State !== 'available') throw new Error('Selected availability zone is unavailable.');
  const offerings = aws(config, ['ec2', 'describe-instance-type-offerings', '--location-type', 'availability-zone',
    '--filters', `Name=location,Values=${config.availabilityZone}`, `Name=instance-type,Values=${config.instanceType}`]);
  if (!offerings.InstanceTypeOfferings.length) throw new Error('Instance type is not offered in the selected zone.');
  console.log(`Preflight passed: ${config.id}, ${config.account}/${config.region}, ${image.Name}.`);
}

// Keep lifecycle actions explicit; no region enablement, fleet loop, or automatic deletion is hidden here.
assertBenchmarkExclusion();
const [action, target, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: npm run <synth|diff|deploy|park|preflight> <deployment>');
if (action === 'list') {
  if (target) throw new Error('deployments takes no arguments.');
  for (const id of deploymentIds) {
    const config = getDeployment(id);
    console.log(`${id}: ${config.account}/${config.region}/${config.stackName}`);
  }
} else if (action === 'preflight') {
  await preflight(getDeployment(target));
} else if (action === 'deploy') {
  // Both public deployment commands use the same host preparation, lock handoff and native rollout path.
  const child = spawnSync(process.execPath, ['--import=tsx', resolve(infraDir, 'scripts/ecs.ts'), getDeployment(target).id, 'deploy'],
    { cwd: infraDir, stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} else {
  const command = deploymentCommand(action ?? '', target, infraDir);
  if (action === 'diff') await preflight(command.config);
  const operation = async () => {
    mkdirSync(command.artifactDir, { recursive: true, mode: 0o700 });
    console.log(`Target: ${command.config.id} (${command.config.account}/${command.config.region}/${command.config.stackName})`);
    const environment = { ...process.env, GHOSTLINE_DEPLOYMENT: command.config.id, GHOSTLINE_LIFECYCLE: action === 'park' ? 'parked' : 'active' };
    if (action === 'park') {
      // Refuse to allocate idle addresses for a target that has never been deployed.
      const stack = aws(command.config, ['cloudformation', 'describe-stacks', '--stack-name', command.config.stackName]).Stacks[0];
      if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack.StackStatus)) throw new Error('Only a completed stack can be parked.');
      const diff = spawnSync(process.execPath, [resolve(infraDir, 'node_modules/aws-cdk/bin/cdk'),
        ...deploymentCommand('diff', target, infraDir).args], { cwd: infraDir, stdio: 'inherit', env: environment });
      if (diff.error || diff.status !== 0) throw new Error('Park diff failed.');
      removeRegionalHosts(command.config, Object.fromEntries(stack.Outputs.map((item: any) => [item.OutputKey, item.OutputValue])), args => aws(command.config, args));
    }
    const child = spawnSync(process.execPath, [resolve(infraDir, 'node_modules/aws-cdk/bin/cdk'), ...command.args], {
      cwd: infraDir, stdio: 'inherit', env: environment,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error('Scoped CDK operation failed.');
    if (action === 'park') {
      // Park deliberately removes both generations. Preserve failure history without making old hooks/retries own a later activation.
      const gate = await operatorGate(command.config.id);
      const rollout = await gate.record<Rollout>('rollout/current');
      if (rollout && rollout.phase !== 'retired') await gate.save({ ...rollout, phase: 'retired', version: rollout.version + 1 }, rollout);
      await gate.progress(false);
    }
  };
  if (action === 'park') {
    assertNativeDeploymentSettled(command.config, args => aws(command.config, args));
    await withLifecycle(command.config, action, operation, 'parked');
  }
  else await operation();
}
