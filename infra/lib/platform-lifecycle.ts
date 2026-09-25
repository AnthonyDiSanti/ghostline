import type { DeploymentConfig } from './config.js';
import { parse } from 'yaml';
import { gatewayPlatform } from './gateway-platform.js';
import { bottlerocketOs } from './bottlerocket-os.js';

export function assertHostPlatform(config: DeploymentConfig, aws: (args: string[]) => any): void {
  // A normal task deploy cannot replay Bottlerocket's first-boot settings. Require an explicit cold rebuild.
  const stack = aws(['cloudformation', 'list-stacks']).StackSummaries
    .find((item: any) => item.StackName === config.stackName && item.StackStatus !== 'DELETE_COMPLETE');
  if (!stack) return;
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus)) {
    throw new Error('Endpoint stack must be stable before deployment.');
  }
  const body = aws(['cloudformation', 'get-template', '--stack-name', stack.StackId, '--template-stage', 'Processed']).TemplateBody;
  // CloudFormation returns deployed CDK templates as YAML, even when the original synth was JSON.
  const template = typeof body === 'string' ? parse(body, { prettyErrors: false }) : body;
  if (!template?.Resources) throw new Error('Missing deployed endpoint template.');
  const host = template.Resources.Instance?.Properties;
  if (!host) return; // A parked/new endpoint has no bootstrap state to preserve.
  const expected = gatewayPlatform(config, false);
  const launch = template.Resources.HostLaunchTemplate?.Properties?.LaunchTemplateData;
  if (host.ImageId || launch?.ImageId !== `resolve:ssm:${bottlerocketOs.latestImageParameter}`
    || JSON.stringify(host.LaunchTemplate?.LaunchTemplateId) !== JSON.stringify({ Ref: 'HostLaunchTemplate' })
    || host.InstanceType !== config.instanceType
    || host.UserData?.['Fn::Base64'] !== expected.userData
    || host.BlockDeviceMappings?.find((disk: any) => disk.DeviceName === '/dev/xvdb')?.Ebs?.VolumeSize !== config.dataVolumeGiB) {
    throw new Error('Host platform settings changed: park this target, then unpark it to apply a coherent cold rebuild.');
  }
}
