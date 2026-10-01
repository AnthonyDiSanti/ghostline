import { afterAll, expect, it } from 'vitest';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { hostTemplates } from '../lib/host-slot.js';
import { getDeployment } from '../lib/config.js';

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
  const resources = Object.values(JSON.parse(templates.addresses).Resources) as any[];
  expect(resources.filter(r => r.Type === 'AWS::EC2::EIP')).toHaveLength(2);
  expect(resources.some(r => r.Type === 'AWS::EC2::EIPAssociation')).toBe(false);
  expect(resources.some(r => r.DeletionPolicy === 'Retain')).toBe(false);
});
