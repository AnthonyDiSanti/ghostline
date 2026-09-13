import { afterAll, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment, validateDeployment, type DeploymentConfig } from '../lib/config.js';
import { ecsUserData } from '../lib/ecs-stack.js';
import { imageArtifacts, officialXrayImage, releaseFiles, releaseTag } from '../lib/ecs-release.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const { app, stack } = buildApp({ operatorSshCidr: '', sshPublicKey: '' }, config);
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources as Record<string, any>;

it('rejects a catalog entry without a real credential source before reading local files', () => {
  expect(() => validateDeployment({ ...config, ecs: {} } as DeploymentConfig)).toThrow('credential source');
});

it('uses one SSH-free AL2023 host with retained dual addresses and no paid gateways', () => {
  template.resourceCountIs('AWS::EC2::Instance', 1);
  template.resourceCountIs('AWS::EC2::NetworkInterface', 1);
  template.resourceCountIs('AWS::EC2::EIP', 2);
  for (const type of ['AWS::EC2::KeyPair', 'AWS::EC2::NatGateway', 'AWS::ElasticLoadBalancingV2::LoadBalancer', 'AWS::AutoScaling::AutoScalingGroup']) template.resourceCountIs(type, 0);
  const host = Object.values(resources).find(r => r.Type === 'AWS::EC2::Instance').Properties;
  expect(host.KeyName).toBeUndefined();
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::Instance').DependsOn).toContain('Cluster');
  expect(host.ImageId).toBe(config.amiId);
  expect(host.MetadataOptions).toMatchObject({ HttpTokens: 'required', HttpPutResponseHopLimit: 1 });
  expect(host.BlockDeviceMappings[0]).toMatchObject({ DeviceName: '/dev/xvda', Ebs: { Encrypted: true, VolumeSize: 30, DeleteOnTermination: true } });
  expect(Object.values(resources).find(r => r.Type === 'AWS::EC2::SecurityGroup').Properties.SecurityGroupIngress.map((r: any) => r.FromPort)).toEqual([443, 443]);
});

it('runs two isolated bridge tasks with only server-secret references and bounded replacements', () => {
  template.resourceCountIs('AWS::ECS::Service', 2);
  const tasks = Object.values(resources).filter(r => r.Type === 'AWS::ECS::TaskDefinition');
  expect(tasks).toHaveLength(2);
  for (const task of tasks) {
    expect(task.Properties.NetworkMode).toBe('bridge');
    expect(task.Properties.TaskRoleArn).toBeUndefined();
    const c = task.Properties.ContainerDefinitions[0];
    expect(c.ReadonlyRootFilesystem).toBe(true);
    expect(c.Privileged).toBeUndefined();
    const recipient = c.Name === 'xray' ? task.Properties.ContainerDefinitions.find((container: any) => container.Name === 'xray-config') : c;
    expect(recipient.Secrets[0].ValueFrom).toBe(`arn:aws:ssm:eu-north-1:000000000000:parameter/ghostline/prod/server/${c.Name}`);
    expect(c.LinuxParameters.Capabilities.Drop).toEqual(['ALL']);
    if (c.Name === 'awg') expect(c.LinuxParameters.Devices[0].HostPath).toBe('/dev/net/tun');
  }
  for (const service of Object.values(resources).filter(r => r.Type === 'AWS::ECS::Service')) {
    expect(service.Properties.DesiredCount).toBe(1);
    expect(service.Properties.DeploymentConfiguration).toMatchObject({ MinimumHealthyPercent: 0, MaximumPercent: 100 });
  }
  const statements = Object.values(resources).filter(r => r.Type === 'AWS::IAM::Policy').flatMap(r => r.Properties.PolicyDocument.Statement);
  const reads = statements.filter(s => [].concat(s.Action).some((a: string) => a.startsWith('ssm:GetParameter')));
  expect(reads).toHaveLength(2);
  expect(reads.every(s => s.Resource.includes(':parameter/ghostline/prod/server/'))).toBe(true);
});

it('gates unmodified non-root Xray on an offline initializer with a private task volume', () => {
  const task = Object.values(resources).find(r => r.Type === 'AWS::ECS::TaskDefinition' && r.Properties.Family.endsWith('-xray')).Properties;
  const [engine, initializer] = task.ContainerDefinitions;
  expect(engine).toMatchObject({ User: '65532:65532', DependsOn: [{ ContainerName: 'xray-config', Condition: 'SUCCESS' }],
    Command: ['run', '-config', '/usr/local/etc/xray/server.json'],
    MountPoints: [{ SourceVolume: 'xray-config', ContainerPath: '/usr/local/etc/xray', ReadOnly: true }] });
  expect(engine.Secrets).toBeUndefined();
  expect(engine.EntryPoint).toBeUndefined();
  expect(initializer).toMatchObject({ Essential: false, DisableNetworking: true, ReadonlyRootFilesystem: true,
    Memory: 64, LinuxParameters: { Capabilities: { Drop: ['ALL'], Add: ['CHOWN'] } },
    MountPoints: [{ SourceVolume: 'xray-config', ContainerPath: '/config', ReadOnly: false }] });
  expect(initializer.PortMappings).toBeUndefined();
  expect(task.Volumes).toEqual([{ Name: 'xray-config', DockerVolumeConfiguration: { Driver: 'local', Scope: 'task' } }]);
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
