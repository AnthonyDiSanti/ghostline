import { App, LegacyStackSynthesizer, Tags, type AppProps } from 'aws-cdk-lib';
import cdkConfig from '../cdk.json' with { type: 'json' };
import { validateDeployment, validateGlobalTags, type DeploymentConfig } from './config.js';
import { EcsEndpointStack } from './ecs-stack.js';
import type { GuardDutySupport } from './guardduty-discovery.js';

export function buildApp(config: DeploymentConfig, guardDuty: GuardDutySupport,
  appProps: AppProps = {}, lifecycle: 'active' | 'parked' = 'active') {
  // CLI and offline tests use the same graph and committed CDK feature flags.
  config = validateDeployment(config);
  if (guardDuty.runtime && !guardDuty.service) throw new Error('GuardDuty runtime requires regional service availability.');
  const app = new App({ ...appProps, context: { ...cdkConfig.context, ...appProps.context } });
  for (const [key, value] of Object.entries(validateGlobalTags(config.globalTags))) {
    Tags.of(app).add(key, value);
  }
  Tags.of(app).add('System', 'shared');
  const stack = new EcsEndpointStack(app, config.stackName, {
    env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(),
    deployment: config, lifecycle, guardDuty,
  });
  return { app, stack };
}
