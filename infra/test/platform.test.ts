import { expect, it } from 'vitest';
import { stringify } from 'yaml';
import { Template } from 'aws-cdk-lib/assertions';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { buildPlatformRepository, platformImage, platformInputs, platformRepository, platformSourceHash } from '../lib/platform-image.js';
import { withHostDiagnostics } from '../lib/ecs-verification.js';

it('uses the qualified source and immutable regional platform artifact independently of application releases', () => {
  expect(platformSourceHash()).toBe(platformInputs.sourceSha256);
  for (const target of ['stockholm-ecs', 'cape-town']) {
    const config = getDeployment(target);
    const image = platformImage(config);
    expect(image).toContain(`.ecr.${config.region}.amazonaws.com/${platformRepository}@${platformInputs.digest}`);
    const platform = gatewayPlatform(config, image, platformRepository, true);
    expect(platform.userData).not.toContain('@@');
    expect(Buffer.byteLength(platform.userData)).toBeLessThan(16384);
    expect(platform.userData).toContain('essential = true');
    expect(platform.pullRepositoryArns.every(arn => arn.startsWith(`arn:aws:ecr:${config.region}:`) && !arn.includes('*'))).toBe(true);
    const durable = Template.fromStack(buildPlatformRepository(config).stack).toJSON();
    expect(durable.Resources.Repository).toMatchObject({ DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
      Properties: { RepositoryName: platformRepository, ImageTagMutability: 'IMMUTABLE' } });
    const active = Template.fromStack(buildApp(config, { service: true, runtime: true }).stack).toJSON();
    const parked = Template.fromStack(buildApp(config, { service: false, runtime: false }, {}, 'parked').stack).toJSON();
    expect(Object.keys(parked.Resources).sort()).toEqual(['awgAddress', 'xrayAddress']);
    for (const name of Object.keys(parked.Resources)) expect(parked.Resources[name]).toEqual(active.Resources[name]);
    expect(active.Resources.NetworkService.Properties.SchedulingStrategy).toBe('DAEMON');
    // Deletion reverses these edges: engines, daemon, EIP bindings, then host and management transport.
    expect(active.Resources.GatewayService.DependsOn).toContain('NetworkService');
    expect(active.Resources.NetworkService.DependsOn).toEqual(expect.arrayContaining(['xrayAssociation', 'awgAssociation', 'Instance']));
  }
});

it('rejects unsafe identifiers and omits agent pulls when live runtime discovery is unavailable', () => {
  const config = getDeployment('cape-town');
  expect(gatewayPlatform(config, platformImage(config), platformRepository, false).pullRepositoryArns).toHaveLength(2);
  for (const resourceName of ['bad\nvalue', '$(false)', 'bad"quote']) {
    expect(() => gatewayPlatform({ ...config, resourceName }, platformImage(config), platformRepository, true)).toThrow('Invalid gateway identity');
  }
});

it.each(['success', 'operation-error', 'enable-timeout', 'not-ready', 'lockdown-error'])('releases and verifies diagnostic authority after %s', async mode => {
  const commands: string[] = [];
  const remote = async (command: string) => {
    commands.push(command);
    if (command.endsWith('enabled=true') && mode === 'enable-timeout') throw new Error('transport timeout');
    if (command.endsWith('echo ready')) return mode === 'not-ready' ? '' : 'ready';
    if (command.startsWith('apiclient get')) return JSON.stringify({ settings: { 'host-containers': {
      'ghostline-diagnostics': { enabled: mode === 'lockdown-error' }, admin: { enabled: false }, control: { superpowered: false },
    } } });
    return '';
  };
  const result = withHostDiagnostics(remote, async () => {
    if (mode === 'operation-error') throw new Error('verification failed');
    return 'verified';
  }, async () => {});
  if (mode === 'success') await expect(result).resolves.toBe('verified');
  else await expect(result).rejects.toThrow();
  expect(commands.slice(-2)).toEqual(['apiclient set host-containers.ghostline-diagnostics.enabled=false', 'apiclient get settings.host-containers']);
});

it('parks one named stack without an interactive IAM-removal prompt', async () => {
  // The lifecycle wrapper still runs a fresh diff; explicit park must also work without a terminal.
  const { deploymentCommand } = await import('../lib/commands.js');
  const command = deploymentCommand('park', 'stockholm-ecs', '/tmp/infra');
  expect(command.args.slice(0, 2)).toEqual(['deploy', 'GhostlineEcsTrial']);
  expect(command.args.slice(-2)).toEqual(['--require-approval', 'never']);
  expect(command.args).not.toContain('--all');
});

it('reads the actual ECS reserve while keeping host verification output redacted', async () => {
  const { verifyHost } = await import('../lib/ecs-verification.js');
  const commands: string[] = [];
  const remote = async (command: string) => {
    commands.push(command);
    if (command === 'uname -m') return 'aarch64';
    if (command.endsWith('echo ready')) return 'ready';
    if (command === 'apiclient get settings.ecs') return JSON.stringify({ settings: { ecs: { 'reserved-memory': 602 } } });
    if (command.endsWith('diagnostics.py')) return JSON.stringify({ memory: { taskMiB: 1126 }, selinuxEnforcing: true });
    if (command.endsWith('isolation.py')) return JSON.stringify({ peerBlocked: true });
    if (command.endsWith('settings.host-containers')) return JSON.stringify({ settings: { 'host-containers': {
      'ghostline-diagnostics': { enabled: false }, admin: { enabled: false }, control: { superpowered: false },
    } } });
    return '';
  };
  await expect(verifyHost(remote)).resolves.toEqual({ memory: { taskMiB: 1126 }, selinuxEnforcing: true,
    isolation: { peerBlocked: true }, agentReservedMiB: 602 });
  expect(commands.some(command => command.includes('get-parameter'))).toBe(false);
  expect(commands.at(-1)).toBe('apiclient get settings.host-containers');
});

it.each(['json', 'yaml', 'object'])('checks %s templates for changed host settings while permitting ordinary task deploys and unpark', async format => {
  const { assertHostPlatform } = await import('../lib/platform-lifecycle.js');
  const config = getDeployment('stockholm-ecs');
  let template = Template.fromStack(buildApp(config, { service: true, runtime: true }).stack).toJSON();
  let status = 'UPDATE_COMPLETE';
  const aws = (args: string[]) => args[1] === 'list-stacks'
    ? { StackSummaries: [{ StackName: config.stackName, StackStatus: status, StackId: 'owned-stack' }] }
    : { TemplateBody: format === 'json' ? JSON.stringify(template) : format === 'yaml' ? stringify(template) : template };
  expect(() => assertHostPlatform(config, aws)).not.toThrow();
  for (const changed of [{ ...config, amiId: 'ami-00000000000000000' }, { ...config, instanceType: 't4g.medium' },
    { ...config, dataVolumeGiB: 40 }]) expect(() => assertHostPlatform(changed, aws)).toThrow('cold rebuild');
  template.Resources.Instance.Properties.UserData['Fn::Base64'] += '\n# changed bootstrap';
  expect(() => assertHostPlatform(config, aws)).toThrow('cold rebuild');
  template = Template.fromStack(buildApp(config, { service: false, runtime: false }, {}, 'parked').stack).toJSON();
  expect(() => assertHostPlatform(config, aws)).not.toThrow();
  expect(() => assertHostPlatform(config, () => ({ StackSummaries: [] }))).not.toThrow();
  status = 'UPDATE_IN_PROGRESS';
  expect(() => assertHostPlatform(config, aws)).toThrow('stable');
});
