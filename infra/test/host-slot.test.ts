import { afterAll, expect, it } from 'vitest';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { Template } from 'aws-cdk-lib/assertions';
import { buildApp } from '../lib/app.js';
import { hostTemplates } from '../lib/host-slot.js';
import { getDeployment } from '../lib/config.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { repository } from '../lib/releases/model.js';
import { dnsReleaseArtifacts } from '../lib/image-artifacts.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const templates = hostTemplates(config, true);
it('separates network preparation from host launch and stops daemon before terminating its host', () => {
  // The controller can wire public addresses before boot and retain management connectivity during drain/termination.
  for (const slot of ['a', 'b'] as const) {
    const template = JSON.parse(templates[slot]);
    const r = template.Resources;
    expect(template.Parameters.Phase.AllowedValues).toEqual(['absent', 'network-only', 'running']);
    expect(r.NetworkInterface.Condition).toBe('HasNetwork');
    for (const name of ['Instance', 'HostLaunchTemplate', 'NetworkTask', 'NetworkService']) expect(r[name].Condition).toBe('IsRunning');
    expect(r.NetworkService.DependsOn).toContain('Instance');
    expect(r.NetworkService.Properties.PlacementConstraints).toEqual([{ Type: 'memberOf', Expression: `attribute:ghostline_slot == ${slot}` }]);
    expect(r.Instance.Properties.MetadataOptions.HttpTokens).toBe('required');
    expect(r.HostLaunchTemplate.Properties.TagSpecifications).toEqual([{ ResourceType: 'launch-template',
      Tags: Object.entries({ ...config.globalTags, System: 'shared', GhostlineHostStack: `${config.stackName}-Host-${slot}` }).map(([Key, Value]) => ({ Key, Value })) }]);
    expect(JSON.stringify(r.HostLaunchTemplate)).toContain('OsVersion');
    expect(JSON.stringify(r.HostLaunchTemplate)).not.toContain('/latest/');
    const daemon = r.NetworkTask.Properties.ContainerDefinitions[0];
    expect(daemon.Image).toMatch(/network-daemon:keep-production$/);
    expect(daemon.LinuxParameters.Capabilities).toEqual({ Add: ['NET_ADMIN', 'NET_RAW'], Drop: ['ALL'] });
    expect(r.NetworkTask.Properties.TaskRoleArn).toBeUndefined();
    expect(daemon.MountPoints).toBeUndefined();
    expect(r.Instance.Properties.UserData['Fn::Base64']).toContain('ghostline_candidate = "eligible"');
    expect(Object.values(r).some((resource: any) => resource.Type === 'AWS::EC2::EIP')).toBe(false);
  }
});
it('gives each host a distinct address pair and owns temporary allocations separately from associations', () => {
  const a = JSON.parse(templates.a).Resources.NetworkInterface.Properties.PrivateIpAddresses;
  const b = JSON.parse(templates.b).Resources.NetworkInterface.Properties.PrivateIpAddresses;
  expect(new Set([...a, ...b].map((ip: any) => ip.PrivateIpAddress)).size).toBe(4);
  expect(a[0]).toEqual({ PrivateIpAddress: '10.79.0.10', Primary: true });
  expect(b[0]).toEqual({ PrivateIpAddress: '10.79.0.20', Primary: true });
  const resources = Object.values(JSON.parse(templates.addresses).Resources) as any[];
  expect(resources.filter(r => r.Type === 'AWS::EC2::EIP')).toHaveLength(2);
  expect(resources.some(r => r.Type === 'AWS::EC2::EIPAssociation')).toBe(false);
  expect(resources.some(r => r.DeletionPolicy === 'Retain')).toBe(false);
});

it('renders an isolated six-image native candidate through the common endpoint and host templates', () => {
  // Qualification binds exact regional manifests and trial secrets without moving production aliases.
  const trial = { ...config, dnsRequired: true };
  const image = (name: (typeof dnsReleaseArtifacts)[number]) =>
    `${trial.account}.dkr.ecr.${trial.region}.amazonaws.com/${repository(name)}@sha256:${'a'.repeat(64)}`;
  const images = Object.fromEntries(dnsReleaseArtifacts.map(name => [name, image(name)])) as Record<(typeof dnsReleaseArtifacts)[number], string>;
  const platformImages = { bootstrap: images.bootstrap, daemon: images['network-daemon'] };
  const taskImages = { xray: images.xray, awg: images.awg, 'gateway-config': images['gateway-config'],
    'dns-policy': images['dns-policy'] };
  const platform = gatewayPlatform(trial, true, 'a', platformImages);
  const endpoint = Template.fromStack(buildApp(trial, { service: true, runtime: true }, {}, 'active', {
    platform, parameterPrefix: '/ghostline/trial/dns-native', images: taskImages,
  }).stack).toJSON();
  const containers = endpoint.Resources.GatewayTask.Properties.ContainerDefinitions;
  for (const name of ['xray', 'awg', 'gateway-config', 'dns-policy'] as const) {
    expect(containers.find((item: any) => item.Name === name).Image).toBe(taskImages[name]);
  }
  expect(containers.find((item: any) => item.Name === 'gateway-config').Secrets[0].ValueFrom)
    .toContain('parameter/ghostline/trial/dns-native/server/xray');
  const slot = JSON.parse(hostTemplates(trial, true, platformImages).a).Resources;
  expect(slot.NetworkTask.Properties.ContainerDefinitions[0].Image).toBe(images['network-daemon']);
  expect(JSON.parse(slot.NetworkTask.Properties.ContainerDefinitions[0].Environment[0].Value).dnsSource).toBe('10.79.0.10');
  const otherSlot = JSON.parse(hostTemplates(trial, true, platformImages).b).Resources;
  expect(JSON.parse(otherSlot.NetworkTask.Properties.ContainerDefinitions[0].Environment[0].Value).dnsSource).toBe('10.79.0.20');
  expect(slot.Instance.Properties.UserData['Fn::Base64']).toContain(images.bootstrap);
  expect(() => gatewayPlatform(trial, true, 'a', { ...platformImages, daemon: 'evil:latest' }))
    .toThrow('Invalid network-daemon candidate');
  expect(() => buildApp(trial, { service: true, runtime: true }, {}, 'active', {
    platform, parameterPrefix: '/ghostline/trial/dns-native', images: { ...taskImages, 'dns-policy': 'evil:latest' },
  })).toThrow('Invalid dns-policy candidate');
});
