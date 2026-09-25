import { CfnInstance, CfnLaunchTemplate } from 'aws-cdk-lib/aws-ec2';
import { Annotations, type Stack } from 'aws-cdk-lib';

export const bottlerocketOs = {
  variant: 'aws-ecs-3', architecture: 'arm64',
  latestImageParameter: '/aws/service/bottlerocket/aws-ecs-3/arm64/latest/image_id',
} as const;

export function useLatestBottlerocketOnLaunch(stack: Stack, instance: CfnInstance): CfnLaunchTemplate {
  // EC2 resolves this public parameter on each new launch. A CloudFormation dynamic reference would resolve only on stack operations.
  const template = new CfnLaunchTemplate(stack, 'HostLaunchTemplate', {
    launchTemplateData: { imageId: `resolve:ssm:${bottlerocketOs.latestImageParameter}` },
  });
  // EC2 explicitly accepts this syntax; CDK's generic AMI-ID format checker does not model it yet.
  Annotations.of(template).acknowledgeWarning('CloudFormation-Validate::E1152', 'Native EC2 launch-template SSM AMI resolution; verified in Ireland.');
  instance.imageId = undefined;
  instance.launchTemplate = { launchTemplateId: template.ref, version: template.attrLatestVersionNumber };
  return template;
}

export function verifyOfficialBottlerocketImage(image: { owner?: string; architecture?: string; state?: string; name?: string }, version: string): void {
  // Preflight validates AWS's selected metadata; an existing host's actual OS must still be observed independently.
  if (image.owner !== 'amazon' || image.architecture !== 'arm64' || image.state !== 'available'
    || !/^\d+\.\d+\.\d+-[a-f0-9]+$/.test(version) || image.name !== `bottlerocket-aws-ecs-3-aarch64-v${version}`) {
    throw new Error('Expected the official stable ECS-3 ARM64 Bottlerocket image.');
  }
}
