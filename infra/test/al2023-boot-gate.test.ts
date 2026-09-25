import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { renderAl2023ImageBuildUserData, renderAl2023TrialLaunchUserData } from '../lib/al2023-boot-gate.js';
import { Al2023BootGateTrialStack, al2023GateTrialAmi } from '../lib/al2023-boot-gate-stack.js';

const image = `public.ecr.aws/example/probe@sha256:${'a'.repeat(64)}`;
const asset = (name: string) => readFileSync(new URL(`../../runtime/ecs/al2023/${name}`, import.meta.url), 'utf8');

it('bakes a generic gate without a regional cluster and keeps launch enrollment separate', () => {
  const userData = renderAl2023ImageBuildUserData(image);
  expect(Buffer.byteLength(userData)).toBeLessThanOrEqual(16 * 1024);
  expect(spawnSync('bash', ['-n'], { input: userData }).status).toBe(0);
  const payload = userData.split('\n')[3]!;
  const installScript = gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
  expect(spawnSync('bash', ['-n'], { input: installScript }).status).toBe(0);
  expect(installScript).toContain("if grep -q '^ECS_CLUSTER=' /etc/ecs/ecs.config");
  expect(installScript).toContain('/opt/ghostline/al2023/v1/check-ecs-config.sh');
  expect(installScript).not.toContain('ECS_CLUSTER=ghostline-');
  expect(installScript).not.toContain('GHOSTLINE_XRAY_BUNDLE');
  expect(() => renderAl2023ImageBuildUserData('example.com/latest')).toThrow('exact bootstrap image digest');
  const launchData = renderAl2023TrialLaunchUserData('ghostline-al2023-boot-gate-trial');
  expect(spawnSync('bash', ['-n'], { input: launchData }).status).toBe(0);
  expect(launchData).not.toContain('write_asset');
  expect(launchData).toContain('systemctl --no-block start ecs.service');
  expect(() => renderAl2023TrialLaunchUserData('bad;command')).toThrow('safe cluster');
});

it('keeps quarantine and RAM before Docker, then makes finite image success a hard ECS dependency', () => {
  // These are systemd's actual unit/drop-in sources, so this guards the failure boundary rather than a TS duplicate.
  expect(asset('docker-gate.conf')).toContain('Requires=mnt-ghostline-config.mount');
  expect(asset('docker-gate.conf')).toContain('ExecStartPre=/opt/ghostline/al2023/v1/quarantine.sh');
  expect(asset('mnt-ghostline-config.mount')).toContain('size=2m,mode=0700,uid=65532,gid=65532');
  expect(asset('ghostline-bootstrap.service')).toContain('Before=ecs.service');
  expect(asset('ecs-gate.conf')).toContain('Requires=ghostline-bootstrap.service');
  expect(asset('ecs-gate.conf')).toContain('ExecStartPre=/opt/ghostline/al2023/v1/check-ecs-config.sh');
  expect(asset('bootstrap-probe.sh')).toContain('docker pull "$GHOSTLINE_BOOTSTRAP_IMAGE"');
});

it('synthesizes a builder without ECS enrollment authority and a derived host with narrow enrollment', () => {
  const app = new App();
  const common = {
    env: { account: '123456789012', region: 'eu-west-1' }, availabilityZone: 'eu-west-1a', bootstrapImage: image,
  };
  const stack = new Al2023BootGateTrialStack(app, 'Al2023Trial', { ...common, host: { phase: 'builder' } });
  const derived = new Al2023BootGateTrialStack(app, 'Al2023Derived', {
    ...common, host: { phase: 'derived', imageId: 'ami-0123456789abcdef0' },
  });
  const resources = Template.fromStack(stack).toJSON().Resources as Record<string, { Type: string; Properties: Record<string, unknown> }>;
  const derivedResources = Template.fromStack(derived).toJSON().Resources as Record<string, { Type: string; Properties: Record<string, unknown> }>;
  expect(Template.fromStack(stack).toJSON().Parameters).toBeUndefined();
  // Ireland has no CDK bootstrap: the asset-free trial must use the caller's verified CLI identity.
  const artifact = app.synth().getStackArtifact(stack.artifactId);
  expect(artifact.assumeRoleArn).toBeUndefined();
  expect(artifact.cloudFormationExecutionRoleArn).toBeUndefined();
  const ofType = (type: string) => Object.values(resources).filter(resource => resource.Type === type);
  expect(ofType('AWS::EC2::Instance')).toHaveLength(1);
  expect(ofType('AWS::ECS::Cluster')).toHaveLength(0);
  expect(ofType('AWS::ECS::Service')).toHaveLength(0);
  expect(ofType('AWS::EC2::EIP')).toHaveLength(0);
  expect(ofType('AWS::EC2::LaunchTemplate')[0]!.Properties.LaunchTemplateData).toMatchObject({
    ImageId: `resolve:ssm:${al2023GateTrialAmi}`,
  });
  expect(ofType('AWS::EC2::SecurityGroup')[0]!.Properties.SecurityGroupIngress).toEqual([]);
  const policies = JSON.stringify(ofType('AWS::IAM::Policy'));
  expect(policies).not.toContain('RegisterContainerInstance');
  expect(policies).not.toContain('ssm:GetParameters');
  const derivedOfType = (type: string) => Object.values(derivedResources).filter(resource => resource.Type === type);
  expect(derivedOfType('AWS::ECS::Cluster')).toHaveLength(1);
  expect(derivedOfType('AWS::EC2::LaunchTemplate')[0]!.Properties.LaunchTemplateData).toMatchObject({
    ImageId: 'ami-0123456789abcdef0',
  });
  const derivedPolicies = JSON.stringify(derivedOfType('AWS::IAM::Policy'));
  expect(derivedPolicies).toContain('RegisterContainerInstance');
  expect(derivedPolicies).toContain('cluster/ghostline-al2023-boot-gate-trial');
  expect(derivedPolicies).not.toContain('ssm:GetParameters');
});
