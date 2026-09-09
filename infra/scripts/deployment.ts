import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { deploymentIds, getDeployment, type DeploymentConfig } from '../lib/config.js';
import { deploymentCommand } from '../lib/commands.js';

const infraDir = fileURLToPath(new URL('../', import.meta.url));

function aws(config: DeploymentConfig, args: string[], region = config.region) {
  // Only nonsecret metadata is queried here; argument arrays avoid shell interpolation.
  return JSON.parse(execFileSync('aws', ['--profile', 'personal', '--region', region, ...args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
}

function preflight(config: DeploymentConfig) {
  // Fail before diff/deploy if regional prerequisites or the operator's account do not match.
  const identity = aws(config, ['sts', 'get-caller-identity'], 'eu-central-1');
  if (identity.Account !== config.account) throw new Error('AWS profile account does not match deployment.');
  const regions = aws(config, ['ec2', 'describe-regions', '--all-regions'], 'eu-central-1');
  const status = regions.Regions.find((region: { RegionName: string }) => region.RegionName === config.region)?.OptInStatus;
  if (!['opted-in', 'opt-in-not-required'].includes(status)) {
    throw new Error(`${config.region} is not enabled yet (${status}). Enable it explicitly and wait before retrying.`);
  }
  const image = aws(config, ['ec2', 'describe-images', '--image-ids', config.amiId]).Images[0];
  if (!image || image.State !== 'available' || image.OwnerId !== '099720109477'
    || image.Architecture !== 'x86_64' || image.RootDeviceType !== 'ebs'
    || image.RootDeviceName !== '/dev/sda1' || image.VirtualizationType !== 'hvm'
    || !image.Name.startsWith('ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-')) {
    throw new Error('Pinned AMI is not an available Canonical Ubuntu 24.04 x86_64 server image.');
  }
  const zones = aws(config, ['ec2', 'describe-availability-zones', '--zone-names', config.availabilityZone]);
  if (zones.AvailabilityZones[0]?.State !== 'available') throw new Error('Selected availability zone is unavailable.');
  const offerings = aws(config, ['ec2', 'describe-instance-type-offerings', '--location-type', 'availability-zone',
    '--filters', `Name=location,Values=${config.availabilityZone}`, `Name=instance-type,Values=${config.instanceType}`]);
  if (!offerings.InstanceTypeOfferings.length) throw new Error('Instance type is not offered in the selected zone.');
  console.log(`Preflight passed: ${config.id}, ${config.account}/${config.region}, ${image.Name}.`);
}

// Keep lifecycle actions explicit; no region enablement, fleet loop, or automatic deletion is hidden here.
const [action, target, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: npm run <synth|diff|deploy|park|preflight> <deployment>');
if (action === 'list') {
  if (target) throw new Error('deployments takes no arguments.');
  for (const id of deploymentIds) {
    const config = getDeployment(id);
    console.log(`${id}: ${config.account}/${config.region}/${config.stackName}`);
  }
} else if (action === 'preflight') {
  preflight(getDeployment(target));
} else {
  const command = deploymentCommand(action === 'park' ? 'deploy' : action ?? '', target, infraDir);
  if (action !== 'synth') preflight(command.config);
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
  }
  const child = spawnSync(process.execPath, [resolve(infraDir, 'node_modules/aws-cdk/bin/cdk'), ...command.args], {
    cwd: infraDir, stdio: 'inherit', env: environment,
  });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}
