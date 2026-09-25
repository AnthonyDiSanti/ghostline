import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnInstance } from 'aws-cdk-lib/aws-ec2';
import { expect, it } from 'vitest';
import { bottlerocketOs, useLatestBottlerocketOnLaunch, verifyOfficialBottlerocketImage } from '../lib/bottlerocket-os.js';

it('uses native launch-time resolution rather than a stack-time dynamic reference', () => {
  const stack = new Stack(new App(), 'OsPolicy');
  const instance = new CfnInstance(stack, 'Instance', { imageId: 'ami-original' });
  useLatestBottlerocketOnLaunch(stack, instance);
  const template = Template.fromStack(stack).toJSON();
  expect(template.Resources.HostLaunchTemplate.Properties.LaunchTemplateData.ImageId).toBe(`resolve:ssm:${bottlerocketOs.latestImageParameter}`);
  expect(template.Resources.Instance.Properties.ImageId).toBeUndefined();
  expect(template.Resources.Instance.Properties.LaunchTemplate.Version).toEqual({ 'Fn::GetAtt': ['HostLaunchTemplate', 'LatestVersionNumber'] });
  expect(JSON.stringify(template)).not.toContain('{{resolve:ssm:');
});
it('accepts only official metadata for the selected stable OS variant and architecture', () => {
  const image = { owner: 'amazon', architecture: 'arm64', state: 'available', name: 'bottlerocket-aws-ecs-3-aarch64-v1.65.0-0be31b34' };
  expect(() => verifyOfficialBottlerocketImage(image, '1.65.0-0be31b34')).not.toThrow();
  for (const change of [{ owner: 'other' }, { architecture: 'x86_64' }, { name: 'unrelated' }, { state: 'pending' }]) {
    expect(() => verifyOfficialBottlerocketImage({ ...image, ...change }, '1.65.0-0be31b34')).toThrow('official');
  }
});
