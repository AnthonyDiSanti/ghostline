import { expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { hostTemplates } from '../lib/host-slot.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { withHostDiagnostics } from '../lib/ecs-verification.js';

it('uses separate static local platform aliases and preserves endpoint ordering', () => {
  for (const target of ['stockholm-ecs', 'cape-town']) {
    const config = getDeployment(target);
    const platform = gatewayPlatform(config, true);
    expect(platform.bootstrapImage).toBe(`${config.account}.dkr.ecr.${config.region}.amazonaws.com/ghostline/prod/bootstrap:keep-production`);
    expect(platform.daemonImage).toBe(`${config.account}.dkr.ecr.${config.region}.amazonaws.com/ghostline/prod/network-daemon:keep-production`);
    expect(platform.userData).not.toContain('@@');
    expect(Buffer.byteLength(platform.userData)).toBeLessThan(16384);
    expect(platform.userData).toContain('essential = true');
    expect(platform.pullRepositoryArns.every(arn => arn.startsWith(`arn:aws:ecr:${config.region}:`) && !arn.includes('*'))).toBe(true);
    const active = Template.fromStack(buildApp(config, { service: true, runtime: true }).stack).toJSON();
    const parked = Template.fromStack(buildApp(config, { service: false, runtime: false }, {}, 'parked').stack).toJSON();
    expect(Object.keys(parked.Resources).sort()).toEqual(['awgAddress', 'xrayAddress']);
    for (const name of Object.keys(parked.Resources)) expect(parked.Resources[name]).toEqual(active.Resources[name]);
    const slot = JSON.parse(hostTemplates(config, true).a);
    expect(slot.Resources.NetworkService.Properties.SchedulingStrategy).toBe('DAEMON');
    expect(slot.Resources.NetworkService.DependsOn).toContain('Instance');
    expect(active.Resources.xrayAssociation).toBeUndefined(); expect(active.Resources.awgAssociation).toBeUndefined();
  }
});

it('rejects unsafe identifiers and omits agent pulls when live runtime discovery is unavailable', () => {
  const config = getDeployment('cape-town');
  expect(gatewayPlatform(config, false).pullRepositoryArns).toHaveLength(2);
  for (const resourceName of ['bad\nvalue', '$(false)', 'bad"quote']) {
    expect(() => gatewayPlatform({ ...config, resourceName }, true)).toThrow('Invalid gateway identity');
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
