import { App, LegacyStackSynthesizer, Tags, type AppProps } from 'aws-cdk-lib';
import cdkConfig from '../cdk.json' with { type: 'json' };
import { validateDeployment, validateGlobalTags, validateLaunchInputs, type DeploymentConfig, type LaunchInputs } from './config.js';
import { EndpointStack } from './endpoint-stack.js';
import { EcsEndpointStack, EcsImagesStack } from './ecs-stack.js';

export function buildApp(launch: LaunchInputs, config: DeploymentConfig, appProps: AppProps = {}, lifecycle: 'active' | 'parked' = 'active') {
  // CLI and offline tests use the same graph and committed CDK feature flags.
  config = validateDeployment(config);
  const app = new App({ ...appProps, context: { ...cdkConfig.context, ...appProps.context } });
  for (const [key, value] of Object.entries(validateGlobalTags(config.globalTags))) {
    Tags.of(app).add(key, value);
  }
  Tags.of(app).add('System', 'shared');
  if (config.ecs) {
    // Durable images are a separate stack; endpoint park/release never deletes release artifacts.
    const images = new EcsImagesStack(app, `${config.stackName}Images`, {
      env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(), deployment: config,
    });
    const stack = new EcsEndpointStack(app, config.stackName, {
      env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(),
      deployment: config, lifecycle, repositories: images.repositories,
    });
    return { app, stack };
  }
  const stack = new EndpointStack(app, config.stackName, {
    env: { account: config.account, region: config.region },
    // This asset-free stack can use the operator's existing permissions without new bootstrap roles.
    synthesizer: new LegacyStackSynthesizer(),
    deployment: config, lifecycle, launch: validateLaunchInputs(launch),
  });
  return { app, stack };
}
