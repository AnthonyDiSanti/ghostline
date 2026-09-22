import { App, LegacyStackSynthesizer, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import { CfnEIP, CfnSecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { CfnRepository } from 'aws-cdk-lib/aws-ecr';
import { CfnService } from 'aws-cdk-lib/aws-ecs';
import cdkConfig from '../cdk.json' with { type: 'json' };
import { getDeployment, type DeploymentConfig } from './config.js';
import { gatewayPlatform } from './gateway-platform.js';
import { platformRepository } from './platform-image.js';
export { networkDaemonMemory } from './gateway-platform.js';
import { EcsEndpointStack, type GatewayPlatform } from './ecs-stack.js';
import type { GuardDutySupport } from './guardduty-discovery.js';
import type { ImageArtifact } from './ecs-release.js';

export const bottlerocketParameterPrefix = '/ghostline/experiments/bottlerocket';
export const bottlerocketRepository = 'ghostline/experiments/bottlerocket-host';
export const bottlerocketPlatformStack = 'GhostlineBottlerocketPlatform';
export interface BottlerocketTrial {
  amiId: string;
  version: string;
  supportImage: string;
  images: Record<ImageArtifact, string>;
  diagnostic?: boolean;
}

export function buildBottlerocketRepository() {
  // Own the temporary platform artifact independently so it can be published before the host boots.
  const config = getDeployment('stockholm-ecs');
  const app = new App({ context: cdkConfig.context });
  for (const [key, value] of Object.entries(config.globalTags)) Tags.of(app).add(key, value);
  Tags.of(app).add('System', 'shared');
  Tags.of(app).add('Experiment', 'bottlerocket');
  const stack = new Stack(app, bottlerocketPlatformStack, { env: { account: config.account, region: config.region },
    synthesizer: new LegacyStackSynthesizer() });
  new CfnRepository(stack, 'Repository', { repositoryName: bottlerocketRepository,
    imageTagMutability: 'IMMUTABLE', imageScanningConfiguration: { scanOnPush: true },
    encryptionConfiguration: { encryptionType: 'AES256' }, emptyOnDelete: true });
  return { app, stack };
}

export function bottlerocketConfig(amiId: string): DeploymentConfig {
  // Keep the disposable host outside the maintained catalog and the regional release subscriber list.
  return { ...getDeployment('stockholm-ecs'), id: 'bottlerocket-trial', stackName: 'GhostlineBottlerocketTrial',
    resourceName: 'ghostline-bottlerocket-trial', amiId };
}

export function bottlerocketPlatform(config: DeploymentConfig, image: string, diagnostic = false): GatewayPlatform {
  // The validation environment exercises the exact production host recipe with an isolated repository.
  const repository = image.startsWith(`${config.account}.dkr.ecr.${config.region}.amazonaws.com/${platformRepository}@`)
    ? platformRepository : bottlerocketRepository;
  return gatewayPlatform(config, image, repository, true, diagnostic);
}

export function buildBottlerocketTrial(trial: BottlerocketTrial, guardDuty: GuardDutySupport, outdir?: string, lifecycle: 'active' | 'parked' = 'active') {
  // Reuse the exact three-container graph, with separate credentials and fixed qualified image digests.
  const config = bottlerocketConfig(trial.amiId);
  if (Object.keys(trial.images).sort().join(',') !== 'awg,gateway-config,xray') throw new Error('Incomplete trial image selection.');
  for (const [name, image] of Object.entries(trial.images)) {
    const prefix = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/ghostline/prod/${name}@sha256:`;
    if (!image.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(image.slice(prefix.length))) throw new Error('Invalid trial application image.');
  }
  const app = new App({ outdir, context: cdkConfig.context });
  for (const [key, value] of Object.entries(config.globalTags)) Tags.of(app).add(key, value);
  Tags.of(app).add('System', 'shared');
  Tags.of(app).add('Experiment', 'bottlerocket');
  const stack = new EcsEndpointStack(app, config.stackName, { deployment: config, guardDuty, lifecycle,
    env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(),
    gateway: { platform: bottlerocketPlatform(config, trial.supportImage, trial.diagnostic),
      parameterPrefix: bottlerocketParameterPrefix, images: trial.images } });
  // Parking retains the same EIP resources; explicit trial destruction still releases them.
  for (const resource of stack.node.findAll()) if (resource instanceof CfnEIP) resource.applyRemovalPolicy(RemovalPolicy.DESTROY);
  if (lifecycle === 'parked') return { app, stack };
  if (trial.diagnostic) {
    // Permit SSM diagnostics after a bootstrap failure only when no application task or public listener can run.
    (stack.node.findChild('GatewayService') as CfnService).desiredCount = 0;
    (stack.node.findChild('SecurityGroup') as CfnSecurityGroup).securityGroupIngress = [];
  }
  return { app, stack };
}
