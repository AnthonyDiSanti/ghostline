import { spawnSync } from 'node:child_process';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildBottlerocketTrial, bottlerocketParameterPrefix, bottlerocketPlatform, bottlerocketConfig } from '../lib/bottlerocket.js';

const registry = '757999402784.dkr.ecr.eu-north-1.amazonaws.com';
const digest = `sha256:${'a'.repeat(64)}`;
const trial = { amiId: 'ami-031cd08d96ffcdb37', version: '1.65.0-test',
  supportImage: `${registry}/ghostline/experiments/bottlerocket-host@${digest}`,
  images: { xray: `${registry}/ghostline/prod/xray@${digest}`, awg: `${registry}/ghostline/prod/awg@${digest}`,
    'gateway-config': `${registry}/ghostline/prod/gateway-config@${digest}` } };

describe('isolated Bottlerocket gateway', () => {
  it('allows bootstrap diagnostics only with no gateway tasks or public ingress', () => {
    const template = Template.fromStack(buildBottlerocketTrial({ ...trial, diagnostic: true }, { service: true, runtime: true }).stack);
    template.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 0 });
    expect(template.toJSON().Resources.SecurityGroup.Properties.SecurityGroupIngress).toEqual([]);
    expect(bottlerocketPlatform(bottlerocketConfig(trial.amiId), trial.supportImage, true).userData).toContain('essential = false');
  });
  it('preserves ECS initialization and secret boundaries on the supported host mount', () => {
    const template = Template.fromStack(buildBottlerocketTrial(trial, { service: true, runtime: true }).stack).toJSON();
    const resources = Object.values(template.Resources) as any[];
    const task = resources.find(r => r.Type === 'AWS::ECS::TaskDefinition').Properties;
    expect(task.TaskRoleArn).toBeUndefined();
    expect(task.ContainerDefinitions).toHaveLength(3);
    const initializer = task.ContainerDefinitions.find((c: any) => c.Name === 'gateway-config');
    expect(initializer.DisableNetworking).toBe(true);
    expect(initializer.Secrets.map((s: any) => s.ValueFrom)).toEqual(['xray', 'awg'].map(name =>
      `arn:aws:ssm:eu-north-1:757999402784:parameter${bottlerocketParameterPrefix}/server/${name}`));
    for (const engine of task.ContainerDefinitions.filter((c: any) => c.Name !== 'gateway-config')) {
      expect(engine.DependsOn).toEqual([{ ContainerName: 'gateway-config', Condition: 'SUCCESS' }]);
      expect(engine.Secrets).toBeUndefined();
      expect(engine.Privileged).not.toBe(true);
      expect(engine.MountPoints).toEqual([expect.objectContaining({ ReadOnly: true })]);
      expect(engine.Image).toBe(trial.images[engine.Name as 'awg' | 'xray']);
    }
    expect(task.Volumes.map((v: any) => v.Host.SourcePath)).toEqual([
      '/mnt/ghostline/config', '/mnt/ghostline/config/xray', '/mnt/ghostline/config/awg']);
    const host = resources.find(r => r.Type === 'AWS::EC2::Instance').Properties;
    expect(host.BlockDeviceMappings.map((d: any) => [d.DeviceName, d.Ebs.Encrypted])).toEqual([
      ['/dev/xvda', true], ['/dev/xvdb', true]]);
    expect(resources.filter(r => r.Type === 'AWS::EC2::EIP').every(r => r.DeletionPolicy === 'Delete')).toBe(true);
    expect(JSON.stringify(resources.filter(r => r.Type === 'AWS::IAM::Policy'))).not.toContain('parameter/ghostline/prod');
    // Management images need explicit pulls too; keep host authority out of unrelated registries/parameters.
    const pulls = bottlerocketPlatform(bottlerocketConfig(trial.amiId), trial.supportImage).pullRepositoryArns;
    expect(pulls).toContain('arn:aws:ecr:eu-north-1:328549459982:repository/bottlerocket-control');
    expect(pulls.every(arn => !arn.includes('*'))).toBe(true);
    expect(resources.some(r => r.Type === 'AWS::Lambda::Function')).toBe(false);
  });

  it('requires immutable owned platform images and reconstructs RAM on every boot', () => {
    const config = bottlerocketConfig(trial.amiId);
    expect(() => bottlerocketPlatform(config, `${registry}/ghostline/experiments/bottlerocket-host:latest`)).toThrow();
    const data = bottlerocketPlatform(config, trial.supportImage).userData;
    expect(data).toContain('mode = "always"');
    expect(data).toContain('essential = true');
    expect(data).toContain('allow-privileged-containers = false');
    expect(data).toContain('[settings.kernel.modules.br_netfilter]\nallowed = true\nautoload = true');
    expect(data).toContain('"net.bridge.bridge-nf-call-iptables" = "1"');
    expect(data).not.toContain('@@');
  });

  it('withdraws old identity before reconciling and refreshes stable kernel leases', () => {
    const fixture = new URL('./fixtures/bottlerocket-lease.py', import.meta.url);
    const result = spawnSync('python3', ['-B', fixture.pathname], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('qualifies listener-derived discovery without a Docker socket or engine-writable metadata', () => {
    const result = spawnSync('python3', ['-B', new URL('./fixtures/bottlerocket-discovery.py', import.meta.url).pathname], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('confines the network daemon and accounts for its memory once', () => {
    const resources = Template.fromStack(buildBottlerocketTrial(trial, { service: true, runtime: true }).stack).toJSON().Resources;
    const task = resources.NetworkTask.Properties;
    expect(task.NetworkMode).toBe('host');
    expect(task.Memory).toBe('64');
    expect(task.TaskRoleArn).toBeUndefined();
    expect(task.PidMode).toBeUndefined();
    expect(task.Volumes).toBeUndefined();
    const container = task.ContainerDefinitions[0];
    expect(container.LinuxParameters.Capabilities).toEqual({ Drop: ['ALL'], Add: ['NET_ADMIN', 'NET_RAW'] });
    expect(container.LinuxParameters.Devices).toBeUndefined();
    expect(container.MountPoints).toBeUndefined();
    expect(container.Secrets).toBeUndefined();
    expect(container.Privileged).toBe(false);
    expect(container.ReadonlyRootFilesystem).toBe(true);
    expect(container.DockerSecurityOptions).toEqual(['no-new-privileges']);
    expect(resources.NetworkService.Properties.SchedulingStrategy).toBe('DAEMON');
    expect(resources.NetworkService.Properties.DesiredCount).toBeUndefined();
    expect(resources.GatewayService.DependsOn).toContain('NetworkService');
    const data = bottlerocketPlatform(bottlerocketConfig(trial.amiId), trial.supportImage).userData;
    expect(data).toContain('reserved-memory = 602');
    expect(data).not.toContain('ghostline-network');
    expect(data).toContain('[settings.host-containers.ghostline-diagnostics]');
    expect(data).not.toContain('enabled = true');
  });
});

// Park must preserve CloudFormation EIP identities without leaving daemon or host resources behind.
it('parks the trial to exactly its existing address resources', () => {
  const active = Template.fromStack(buildBottlerocketTrial(trial, { service: true, runtime: true }).stack).toJSON();
  const parked = Template.fromStack(buildBottlerocketTrial(trial, { service: true, runtime: true }, undefined, 'parked').stack).toJSON();
  expect(Object.keys(parked.Resources).sort()).toEqual(['awgAddress', 'xrayAddress']);
  for (const key of Object.keys(parked.Resources)) expect(parked.Resources[key]).toEqual(active.Resources[key]);
});
