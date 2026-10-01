import { afterAll, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { hostTemplates } from '../lib/host-slot.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { imageArtifacts, officialXrayImage, releaseFiles, releaseTag } from '../lib/ecs-release.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const { app, stack } = buildApp(config, { service: true, runtime: true });
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources as Record<string, any>;

it('tags the CloudFormation owner explicitly as well as its billable resources', () => {
  // Resource-level aspects alone do not establish stack ownership with explicitStackTags enabled.
  expect(app.synth().getStackArtifact(stack.artifactId).tags).toMatchObject({ Project: 'ghostline', Environment: 'prod', System: 'shared' });
});

it('separates retained regional networking from temporary host-slot capacity without paid gateways', () => {
  template.resourceCountIs('AWS::EC2::Instance', 0);
  template.resourceCountIs('AWS::EC2::NetworkInterface', 0);
  template.resourceCountIs('AWS::EC2::EIP', 2);
  for (const type of ['AWS::EC2::KeyPair', 'AWS::EC2::NatGateway', 'AWS::ElasticLoadBalancingV2::LoadBalancer', 'AWS::AutoScaling::AutoScalingGroup']) template.resourceCountIs(type, 0);
  const slot = JSON.parse(hostTemplates(config, true).a).Resources;
  const host = slot.Instance.Properties;
  expect(host.KeyName).toBeUndefined();
  expect(resources.xrayAssociation).toBeUndefined(); expect(resources.awgAssociation).toBeUndefined();
  expect(host.ImageId).toBeUndefined();
  expect(JSON.stringify(slot.HostLaunchTemplate.Properties)).toContain('OsVersion');
  expect(host.MetadataOptions).toMatchObject({ HttpTokens: 'required', HttpPutResponseHopLimit: 1 });
  expect(host.BlockDeviceMappings[0]).toMatchObject({ DeviceName: '/dev/xvda', Ebs: { Encrypted: true, VolumeSize: 2, DeleteOnTermination: true } });
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::SecurityGroup').Properties.SecurityGroupIngress.map((r: any) => r.FromPort)).toEqual([443, 443]);
});

it('owns GuardDuty transport for the full host lifetime with private, account-scoped access', () => {
  // Dependency direction is the teardown contract, not merely a matching resource count.
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 1);
  const endpoint = resources.GuardDutyEndpoint;
  expect(endpoint.Properties).toMatchObject({ VpcId: { Ref: 'Vpc' }, VpcEndpointType: 'Interface',
    ServiceName: `com.amazonaws.${config.region}.guardduty-data`, SubnetIds: [{ Ref: 'Subnet' }],
    SecurityGroupIds: [{ 'Fn::GetAtt': ['GuardDutySecurityGroup', 'GroupId'] }],
    PrivateDnsEnabled: true, IpAddressType: 'ipv4', DnsOptions: { DnsRecordIpType: 'ipv4' },
    PolicyDocument: { Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Principal: '*', Action: '*', Resource: '*' },
      { Effect: 'Deny', Principal: '*', Action: '*', Resource: '*',
        Condition: { StringNotEquals: { 'aws:PrincipalAccount': config.account } } },
    ] } });
  expect(resources.GuardDutyEndpoint).toBeDefined(); // Shared transport outlives either host slot; CLI teardown removes slots first.
  const hostPolicy = Object.entries(resources).find(([id]) => id.startsWith('HostRoleDefaultPolicy'))![1];
  const actions = hostPolicy.Properties.PolicyDocument.Statement.flatMap((statement: any) => [].concat(statement.Action));
  expect(actions).toContain('ssm:GetManifest');
  expect(actions.some((action: string) => action.startsWith('ssm:GetParameter'))).toBe(false);
  const packageRead = hostPolicy.Properties.PolicyDocument.Statement.find((statement: any) =>
    Array.isArray(statement.Action) && statement.Action.includes('ssm:GetDocument'));
  expect(packageRead).toMatchObject({ Effect: 'Allow', Action: ['ssm:DescribeDocument', 'ssm:GetDocument'],
    Resource: `arn:aws:ssm:${config.region}::document/AmazonGuardDuty-RuntimeMonitoringSsmPlugin` });
  expect(resources.GuardDutySecurityGroup.Properties.SecurityGroupIngress).toEqual([
    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, SourceSecurityGroupId: { 'Fn::GetAtt': ['SecurityGroup', 'GroupId'] } },
  ]);
  expect(resources.GuardDutySecurityGroup.Properties.SecurityGroupEgress).toEqual([
    { IpProtocol: 'icmp', FromPort: 252, ToPort: 86, CidrIp: '255.255.255.255/32', Description: 'Disallow all traffic' },
  ]);
  for (const resource of [endpoint, resources.GuardDutySecurityGroup]) {
    expect(resource.DeletionPolicy).not.toBe('Retain');
    expect(resource.Properties.Tags).toContainEqual({ Key: 'System', Value: 'shared' });
    expect(resource.Properties.Tags).not.toContainEqual({ Key: 'GuardDutyManaged', Value: 'true' });
  }
});

it('runs one bridge task with isolated engines, one secret recipient and shared memory', () => {
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  const task = resources.GatewayTask.Properties;
  expect(task).toMatchObject({ NetworkMode: 'bridge', Memory: '1126' });
  expect(task.TaskRoleArn).toBeUndefined();
  expect(task.PidMode).toBeUndefined();
  expect(task.ContainerDefinitions).toHaveLength(3);
  for (const container of task.ContainerDefinitions) {
    expect(container.VersionConsistency).toBe('enabled');
    expect(JSON.stringify(container.Image)).toContain(':keep-production');
  }
  const initializer = task.ContainerDefinitions.find((c: any) => c.Name === 'gateway-config');
  expect(initializer).toMatchObject({ Essential: false, DisableNetworking: true, User: '65532:65532',
    ReadonlyRootFilesystem: true, Memory: 64, LinuxParameters: { Capabilities: { Drop: ['ALL'] } },
    MountPoints: [{ SourceVolume: 'gateway-config', ContainerPath: '/config', ReadOnly: false }] });
  expect(initializer.RestartPolicy).toBeUndefined();
  expect(initializer.Secrets).toEqual(['xray', 'awg'].map(protocol => ({ Name: `GHOSTLINE_${protocol.toUpperCase()}_BUNDLE`,
    ValueFrom: `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${protocol}` })));
  for (const protocol of ['xray', 'awg']) {
    const engine = task.ContainerDefinitions.find((c: any) => c.Name === protocol);
    expect(engine).toMatchObject({ Essential: true, ReadonlyRootFilesystem: true,
      User: protocol === 'xray' ? '65532:65532' : '0:65532',
      RestartPolicy: { Enabled: true, RestartAttemptPeriod: 60 },
      DependsOn: [{ ContainerName: 'gateway-config', Condition: 'SUCCESS' }],
      MountPoints: [{ SourceVolume: `${protocol}-config`, ContainerPath: protocol === 'xray' ? '/usr/local/etc/xray' : '/etc/ghostline/awg', ReadOnly: true }] });
    for (const field of ['Secrets', 'Environment', 'Memory', 'MemoryReservation', 'Privileged', 'EntryPoint']) expect(engine[field]).toBeUndefined();
    expect(engine.LinuxParameters.Capabilities.Drop).toEqual(['ALL']);
    if (protocol === 'awg') expect(engine.LinuxParameters.Devices[0].HostPath).toBe('/dev/net/tun');
    else expect(engine.Command).toEqual(['run', '-config', '/usr/local/etc/xray/server.json']);
  }
  expect(task.Volumes).toEqual([{ Name: 'gateway-config', Host: { SourcePath: '/mnt/ghostline/config' } },
    ...['xray', 'awg'].map(protocol => ({ Name: `${protocol}-config`, Host: { SourcePath: `/mnt/ghostline/config/${protocol}` } }))]);
  expect(resources.GatewayService.Properties).toMatchObject({
    DesiredCount: { 'Fn::If': ['InitialGateway', 0, { Ref: 'AWS::NoValue' }] },
    DeploymentConfiguration: { Strategy: 'BLUE_GREEN', MinimumHealthyPercent: 100, MaximumPercent: 200, BakeTimeInMinutes: 5 } });
  expect(resources.GatewayService.DependsOn).toContain(Object.keys(resources).find(key => key.startsWith('GatewayExecutionRoleDefaultPolicy')));
  const statements = Object.entries(resources).filter(([id, r]) => id.startsWith('GatewayExecutionRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy').flatMap(([, r]) => r.Properties.PolicyDocument.Statement);
  const reads = statements.filter(s => [].concat(s.Action).some((a: string) => a.startsWith('ssm:GetParameter')));
  expect(reads).toHaveLength(1);
  expect(reads[0].Resource).toEqual(['awg', 'xray'].map(protocol => `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${protocol}`));
  const bootstrap = gatewayPlatform(config, true).userData;
  expect(bootstrap).toContain('reserved-memory = 602');
  expect(bootstrap).toContain('essential = true');
  expect(resources.GatewayService.Properties.PlacementConstraints).toEqual([{ Type: 'memberOf', Expression: 'attribute:ghostline_candidate == eligible' }]);
  expect(releaseFiles('xray')).toEqual({});
  expect(officialXrayImage).toMatch(/^ghcr.io\/xtls\/xray-core@sha256:[a-f0-9]{64}$/);
});

it('keeps build identities separate from static deployment aliases', () => {
  expect(gatewayPlatform(config, true).userData.length).toBeLessThan(16_384);
  expect(gatewayPlatform(config, true).userData).not.toContain('PrivateKey');
  for (const protocol of imageArtifacts) {
    expect(releaseTag(protocol)).toMatch(/^sha-[a-f0-9]{64}$/);
    expect(Object.keys(releaseFiles(protocol))).not.toContain('server.json');
  }
});
