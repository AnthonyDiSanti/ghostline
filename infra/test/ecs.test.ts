import { afterAll, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { hostTemplates } from '../lib/host-slot.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { imageArtifacts, officialXrayImage, releaseFiles, releaseTag } from '../lib/ecs-release.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
// Keep the six-image migration baseline explicit; DERP's seven-image security contract has its own integration tests.
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000', derp: undefined };
const { app, stack } = buildApp(config);
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
  const slot = JSON.parse(hostTemplates(config).a).Resources;
  const host = slot.Instance.Properties;
  expect(host.KeyName).toBeUndefined();
  expect(resources.xrayAssociation).toBeUndefined(); expect(resources.awgAssociation).toBeUndefined();
  expect(host.ImageId).toBeUndefined();
  expect(JSON.stringify(slot.HostLaunchTemplate.Properties)).toContain('OsVersion');
  expect(slot.HostLaunchTemplate.Properties.LaunchTemplateData.MetadataOptions)
    .toEqual({ HttpTokens: 'required', HttpPutResponseHopLimit: 1, InstanceMetadataTags: 'enabled' });
  expect(host.MetadataOptions).toBeUndefined();
  expect(host.BlockDeviceMappings[0]).toMatchObject({ DeviceName: '/dev/xvda', Ebs: { Encrypted: true, VolumeSize: 2, DeleteOnTermination: true } });
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::SecurityGroup').Properties.SecurityGroupIngress.map((r: any) => r.FromPort)).toEqual([443, 443]);
});

it('retains SSM and omits gateway agent installation and telemetry resources', () => {
  expect(resources.GuardDutyEndpoint).toBeUndefined();
  expect(resources.GuardDutySecurityGroup).toBeUndefined();
  const hostPolicy = Object.entries(resources).find(([id]) => id.startsWith('HostRoleDefaultPolicy'))![1];
  const statements = JSON.stringify(hostPolicy.Properties.PolicyDocument.Statement);
  expect(statements).toContain('ssmmessages:OpenDataChannel');
  expect(statements).toContain('repository/bottlerocket-control');
  expect(statements).not.toMatch(/ssm:GetManifest|ssm:DescribeDocument|ssm:GetDocument|aws-guardduty-agent/);
});

it('runs one bridge task with a RAM-only initializer handoff and exact shared task authority', () => {
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  const task = resources.GatewayTask.Properties;
  expect(task).toMatchObject({ NetworkMode: 'bridge', Memory: '1126' });
  expect(task.TaskRoleArn).toEqual({ 'Fn::GetAtt': [Object.keys(resources).find(key => key.startsWith('GatewayTaskRole') && resources[key].Type === 'AWS::IAM::Role'), 'Arn'] });
  expect(task.PidMode).toBeUndefined();
  expect(task.ContainerDefinitions).toHaveLength(4);
  for (const container of task.ContainerDefinitions) {
    expect(container.VersionConsistency).toBe('enabled');
    expect(JSON.stringify(container.Image)).toContain(':keep-production');
  }
  const initializer = task.ContainerDefinitions.find((c: any) => c.Name === 'gateway-config');
  expect(initializer).toMatchObject({ Essential: false, User: '65532:65532',
    ReadonlyRootFilesystem: true, Memory: 64, LinuxParameters: { Capabilities: { Drop: ['ALL'] } },
    MountPoints: [{ SourceVolume: 'gateway-config', ContainerPath: '/config', ReadOnly: false }] });
  expect(initializer.RestartPolicy).toBeUndefined();
  expect(initializer.Secrets).toBeUndefined();
  expect(initializer.DisableNetworking).toBeUndefined();
  expect(Object.values(JSON.parse(initializer.Environment[0].Value))).toEqual(['xray', 'awg'].map(protocol =>
    `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${protocol}`));
  for (const protocol of ['xray', 'awg']) {
    const engine = task.ContainerDefinitions.find((c: any) => c.Name === protocol);
    expect(engine).toMatchObject({ Essential: true, ReadonlyRootFilesystem: true,
      User: protocol === 'xray' ? '65532:65532' : '0:65532',
      RestartPolicy: { Enabled: true, RestartAttemptPeriod: 60 },
      DependsOn: [{ ContainerName: 'gateway-config', Condition: 'SUCCESS' }, { ContainerName: 'dns-policy', Condition: 'HEALTHY' }],
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
  expect(resources.GatewayService.DependsOn).toContain(Object.keys(resources).find(key => key.startsWith('GatewayTaskRoleDefaultPolicy')));
  const executionStatements = Object.entries(resources).filter(([id, r]) => id.startsWith('GatewayExecutionRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy').flatMap(([, r]) => r.Properties.PolicyDocument.Statement);
  expect(executionStatements.filter(s => [].concat(s.Action).some((a: string) => a.startsWith('ssm:')))).toEqual([]);
  const statements = Object.entries(resources).filter(([id, r]) => id.startsWith('GatewayTaskRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy').flatMap(([, r]) => r.Properties.PolicyDocument.Statement);
  const trust = Object.entries(resources).find(([id, r]) => id.startsWith('GatewayTaskRole') && r.Type === 'AWS::IAM::Role')![1].Properties.AssumeRolePolicyDocument.Statement;
  expect(trust).toEqual([{ Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Action: 'sts:AssumeRole',
    Condition: { StringEquals: { 'aws:SourceAccount': config.account }, ArnLike: { 'aws:SourceArn': `arn:aws:ecs:${config.region}:${config.account}:*` } } }]);
  const reads = statements.filter(s => [].concat(s.Action).some((a: string) => a.startsWith('ssm:GetParameter')));
  expect(reads).toHaveLength(1);
  expect(reads[0].Resource).toEqual(['awg', 'xray'].map(protocol => `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${protocol}`));
  const bootstrap = gatewayPlatform(config).userData;
  expect(bootstrap).toContain('reserved-memory = 602');
  expect(bootstrap).toContain('essential = true');
  expect(resources.GatewayService.Properties.PlacementConstraints).toEqual([{ Type: 'memberOf', Expression: 'attribute:ghostline_candidate == eligible' }]);
  expect(releaseFiles('xray')).toEqual({});
  expect(officialXrayImage).toMatch(/^ghcr.io\/xtls\/xray-core@sha256:[a-f0-9]{64}$/);
});

it('keeps a DNS-enabled gateway in the same essential task and host lease domain', () => {
  // The maintained DNS peer must share task scheduling and the daemon's guarded lease domain.
  const enabled = config;
  const dnsResources = resources;
  const task = dnsResources.GatewayTask.Properties;
  const containers = task.ContainerDefinitions;
  expect(task.NetworkMode).toBe('bridge');
  expect(task.TaskRoleArn).toBeDefined();
  expect(task.Memory).toBe(resources.GatewayTask.Properties.Memory);
  expect(containers.map((container: any) => container.Name).sort()).toEqual(['awg', 'dns-policy', 'gateway-config', 'xray']);
  const dns = containers.find((container: any) => container.Name === 'dns-policy');
  expect(dns).toMatchObject({ Essential: true, User: '65532:65532', ReadonlyRootFilesystem: true,
    RestartPolicy: { Enabled: true, RestartAttemptPeriod: 60 },
    HealthCheck: { Command: ['CMD', '/usr/local/bin/dns-health'],
      Interval: 30, Timeout: 20, Retries: 3, StartPeriod: 30 },
    LinuxParameters: { Capabilities: { Drop: ['ALL'] } },
    PortMappings: [{ ContainerPort: 5353, HostPort: 55353, Protocol: 'tcp' },
      { ContainerPort: 5353, HostPort: 55353, Protocol: 'udp' }] });
  expect(JSON.stringify(dns.Image)).toContain('ghostline/prod/dns-policy:keep-production');
  expect(dns.Secrets).toBeUndefined();
  expect(dns.MountPoints).toBeUndefined();
  for (const name of ['xray', 'awg']) {
    expect(containers.find((container: any) => container.Name === name).DependsOn).toContainEqual(
      { ContainerName: 'dns-policy', Condition: 'HEALTHY' });
  }
  const daemon = JSON.parse(hostTemplates(enabled).a).Resources.NetworkTask.Properties.ContainerDefinitions[0];
  expect(JSON.parse(daemon.Environment[0].Value).dnsRequired).toBe(true);
  expect(JSON.stringify(dnsResources.SecurityGroup.Properties.SecurityGroupIngress)).not.toContain('55353');
});

it('limits initializer retrieval to exact server ARNs in the selected task namespace', () => {
  // Private trial identities must survive a park/unpark without reading the maintained production namespace.
  const trial = { ...config, dnsRequired: true, parameterPrefix: '/ghostline/trial/dns-native' };
  const trialResources = Template.fromStack(buildApp(trial).stack).toJSON().Resources as Record<string, any>;
  const initializer = trialResources.GatewayTask.Properties.ContainerDefinitions.find((container: any) =>
    container.Name === 'gateway-config');
  const expected = ['xray', 'awg'].map(protocol =>
    `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/trial/dns-native/server/${protocol}`);
  expect(initializer.Secrets).toBeUndefined();
  expect(Object.values(JSON.parse(initializer.Environment[0].Value))).toEqual(expected);
  const policies = Object.entries(trialResources).filter(([id, resource]) =>
    id.startsWith('GatewayTaskRoleDefaultPolicy') && (resource as any).Type === 'AWS::IAM::Policy');
  expect(policies).toHaveLength(1);
  const reads = (policies[0]![1] as any).Properties.PolicyDocument.Statement.filter((statement: any) =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes('ssm:GetParameters'));
  expect(reads).toHaveLength(1);
  expect(reads[0].Resource).toEqual([...expected].reverse());
  expect(trialResources.GatewayTask.Properties.ContainerDefinitions.filter((container: any) =>
    container.Name !== 'gateway-config').every((container: any) => container.Secrets === undefined)).toBe(true);
});

it('keeps build identities separate from static deployment aliases', () => {
  expect(gatewayPlatform(config).userData.length).toBeLessThan(16_384);
  expect(gatewayPlatform(config).userData).not.toContain('PrivateKey');
  for (const protocol of imageArtifacts) {
    expect(releaseTag(protocol)).toMatch(/^sha-[a-f0-9]{64}$/);
    expect(Object.keys(releaseFiles(protocol))).not.toContain('server.json');
  }
});
