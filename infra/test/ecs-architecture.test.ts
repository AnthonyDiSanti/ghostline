import { afterAll, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { assertImagePlatform } from '../lib/ecs-images.js';
import { platformInputs } from '../lib/platform-image.js';
import { assertDeploymentAmi } from '../lib/deployment-ami.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());

it('instantiates the same ARM64 gateway in independent regions without adding live catalog targets', () => {
  // Synthetic regions test reuse without retaining abandoned environments as deployable recipes.
  for (const region of ['eu-north-1', 'eu-central-1']) {
    const config = { ...getDeployment('stockholm-ecs'), account: '000000000000',
      id: `test-${region}`, region, availabilityZone: `${region}a`, stackName: 'TestGateway', resourceName: 'test-gateway' };
    const template = Template.fromStack(buildApp(config, { service: true, runtime: true }).stack);
    template.resourceCountIs('AWS::EC2::Instance', 1);
    template.resourceCountIs('AWS::EC2::EIP', 2);
    template.resourceCountIs('AWS::ECS::TaskDefinition', 2);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' }, NetworkMode: 'bridge',
    });
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain(`arn:aws:ssm:${region}:000000000000:parameter/ghostline/prod/server/`);
    expect(policies).not.toContain('ssm:PutParameter');
  }
});

it('requires available AWS-owned Bottlerocket ARM64 host images', () => {
  const image = { State: 'available', ImageOwnerAlias: 'amazon', RootDeviceName: '/dev/xvda',
    Name: `bottlerocket-aws-ecs-3-aarch64-v${platformInputs.bottlerocketVersion}`, Architecture: 'arm64' };
  expect(() => assertDeploymentAmi(image)).not.toThrow();
  for (const altered of [undefined, { ...image, ImageOwnerAlias: 'aws-marketplace' }, { ...image, State: 'pending' },
    { ...image, Name: 'other-image' }, { ...image, Architecture: 'x86_64' }]) {
    expect(() => assertDeploymentAmi(altered)).toThrow('AWS Bottlerocket ECS-3 ARM64');
  }
});

it('requires native Linux ARM64 container artifacts', () => {
  expect(() => assertImagePlatform('image', () => 'linux/arm64')).not.toThrow();
  for (const platform of ['linux/amd64', 'windows/arm64']) {
    expect(() => assertImagePlatform('image', () => platform)).toThrow('platform');
  }
});
