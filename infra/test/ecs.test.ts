import { afterAll, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { ecsUserData } from '../lib/ecs-user-data.js';
import { imageArtifacts, officialXrayImage, releaseFiles, releaseTag } from '../lib/ecs-release.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const { app, stack } = buildApp(config);
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources as Record<string, any>;

it('uses one SSH-free AL2023 host with retained dual addresses and no paid gateways', () => {
  template.resourceCountIs('AWS::EC2::Instance', 1);
  template.resourceCountIs('AWS::EC2::NetworkInterface', 1);
  template.resourceCountIs('AWS::EC2::EIP', 2);
  for (const type of ['AWS::EC2::KeyPair', 'AWS::EC2::NatGateway', 'AWS::ElasticLoadBalancingV2::LoadBalancer', 'AWS::AutoScaling::AutoScalingGroup']) template.resourceCountIs(type, 0);
  const host = Object.values(resources).find(r => r.Type === 'AWS::EC2::Instance').Properties;
  expect(host.KeyName).toBeUndefined();
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::Instance').DependsOn).toContain('Cluster');
  expect(resources.Instance.DependsOn).toContain(Object.keys(resources).find(key => key.startsWith('HostRoleDefaultPolicy')));
  expect(host.ImageId).toBe(config.amiId);
  expect(host.MetadataOptions).toMatchObject({ HttpTokens: 'required', HttpPutResponseHopLimit: 1 });
  expect(host.BlockDeviceMappings[0]).toMatchObject({ DeviceName: '/dev/xvda', Ebs: { Encrypted: true, VolumeSize: 30, DeleteOnTermination: true } });
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::SecurityGroup').Properties.SecurityGroupIngress.map((r: any) => r.FromPort)).toEqual([443, 443]);
});

it('runs one bridge task with isolated engines, one secret recipient and shared memory', () => {
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  const task = resources.GatewayTask.Properties;
  expect(task).toMatchObject({ NetworkMode: 'bridge', Memory: '1126' });
  expect(task.TaskRoleArn).toBeUndefined();
  expect(task.PidMode).toBeUndefined();
  expect(task.ContainerDefinitions).toHaveLength(3);
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
  expect(task.Volumes).toEqual([{ Name: 'gateway-config', Host: { SourcePath: '/run/ghostline-config' } },
    ...['xray', 'awg'].map(protocol => ({ Name: `${protocol}-config`, Host: { SourcePath: `/run/ghostline-config/${protocol}` } }))]);
  expect(resources.GatewayService.Properties).toMatchObject({ DesiredCount: 1,
    DeploymentConfiguration: { MinimumHealthyPercent: 0, MaximumPercent: 100 } });
  expect(resources.GatewayService.DependsOn).toContain(Object.keys(resources).find(key => key.startsWith('GatewayExecutionRoleDefaultPolicy')));
  const statements = Object.values(resources).filter(r => r.Type === 'AWS::IAM::Policy').flatMap(r => r.Properties.PolicyDocument.Statement);
  const reads = statements.filter(s => [].concat(s.Action).some((a: string) => a.startsWith('ssm:GetParameter')));
  expect(reads).toHaveLength(1);
  expect(reads[0].Resource).toEqual(['awg', 'xray'].map(protocol => `arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${protocol}`));
  const bootstrap = ecsUserData(config, 'cluster');
  expect(bootstrap).toContain('ECS_RESERVED_MEMORY=666');
  expect(bootstrap).toContain('ECS_ENABLE_TASK_CPU_MEM_LIMIT=true');
  expect(bootstrap).toContain('Before=docker.service ecs.service');
  expect(releaseFiles('xray')).toEqual({});
  expect(officialXrayImage).toMatch(/^ghcr.io\/xtls\/xray-core@sha256:[a-f0-9]{64}$/);
});

it('keeps immutable ECR repositories in a durable separate stack', () => {
  const images = app.node.findChild(`${config.stackName}Images`) as any;
  const imageResources = Template.fromStack(images).findResources('AWS::ECR::Repository');
  expect(Object.keys(imageResources)).toHaveLength(3);
  for (const repository of Object.values(imageResources)) {
    expect(repository.DeletionPolicy).toBe('Retain');
    expect(repository.Properties.ImageTagMutability).toBe('IMMUTABLE');
  }
  expect(ecsUserData(config, 'cluster').length).toBeLessThan(16_384);
  expect(ecsUserData(config, 'cluster')).not.toContain('PrivateKey');
  for (const protocol of imageArtifacts) {
    expect(releaseTag(protocol)).toMatch(/^sha-[a-f0-9]{64}$/);
    expect(Object.keys(releaseFiles(protocol))).not.toContain('server.json');
  }
});
