import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { App, LegacyStackSynthesizer, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import { CfnRepository } from 'aws-cdk-lib/aws-ecr';
import cdkConfig from '../cdk.json' with { type: 'json' };
import inputs from '../platform-inputs.json' with { type: 'json' };
import type { DeploymentConfig } from './config.js';

export const platformRepository = 'ghostline/platform/host';
export const platformStackName = 'GhostlinePlatform';
export const platformInputs = inputs;

export function platformImage(config: DeploymentConfig): string {
  // Host privileges are tied to an explicitly qualified digest, independent of application release aliases.
  if (inputs.schema !== 1 || !/^sha256:[a-f0-9]{64}$/.test(inputs.digest)
    || !/^[a-f0-9]{64}$/.test(inputs.sourceSha256)) throw new Error('Invalid platform image selection.');
  return `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${platformRepository}@${inputs.digest}`;
}

export function platformSourceHash(): string {
  // Use the same complete source set as the qualified trial, including shared network fixtures.
  const directory = new URL('../../runtime/ecs/', import.meta.url);
  const files = ['network.py', 'network-probe.py', 'bottlerocket/host.Dockerfile',
    ...readdirSync(new URL('bottlerocket/', directory)).filter(name => name.endsWith('.py')).sort().map(name => `bottlerocket/${name}`)];
  return createHash('sha256').update(Buffer.concat(files.map(name => readFileSync(new URL(name, directory))))).digest('hex');
}

export function buildPlatformRepository(config: DeploymentConfig) {
  // This durable stack survives endpoint park/destroy; no lifecycle rule may expire a selected host digest.
  const app = new App({ context: cdkConfig.context });
  for (const [key, value] of Object.entries({ ...config.globalTags, System: 'shared' })) Tags.of(app).add(key, value);
  const stack = new Stack(app, platformStackName, { env: { account: config.account, region: config.region },
    synthesizer: new LegacyStackSynthesizer() });
  const repository = new CfnRepository(stack, 'Repository', { repositoryName: platformRepository,
    imageTagMutability: 'IMMUTABLE', imageScanningConfiguration: { scanOnPush: true },
    encryptionConfiguration: { encryptionType: 'AES256' } });
  repository.applyRemovalPolicy(RemovalPolicy.RETAIN);
  return { app, stack };
}
