import { App, LegacyStackSynthesizer, Tags, type AppProps } from 'aws-cdk-lib';
import cdkConfig from '../cdk.json' with { type: 'json' };
import { validateDeployment, validateGlobalTags, type DeploymentConfig } from './config.js';
import { EcsEndpointStack, type GatewayInputs } from './ecs-stack.js';

export function buildApp(config: DeploymentConfig,
  appProps: AppProps = {}, lifecycle: 'active' | 'parked' = 'active', gateway?: GatewayInputs) {
  // CLI and offline tests use the same graph and committed CDK feature flags.
  config = validateDeployment(config);
  const app = new App({ ...appProps, context: { ...cdkConfig.context, ...appProps.context } });
  for (const [key, value] of Object.entries(validateGlobalTags(config.globalTags))) {
    Tags.of(app).add(key, value);
  }
  Tags.of(app).add('System', 'shared');
  const stack = new EcsEndpointStack(app, config.stackName, {
    env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(),
    // explicitStackTags keeps resource aspects from tagging the CloudFormation owner itself.
    tags: { ...config.globalTags, System: 'shared' },
    deployment: config, lifecycle, gateway,
  });
  return { app, stack };
}
