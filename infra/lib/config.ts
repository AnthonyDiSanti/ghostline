import defaults from '../deployment.json' with { type: 'json' };

export interface DeploymentConfig {
  id: string;
  stackName: string;
  resourceName: string;
  account: string;
  region: string;
  availabilityZone: string;
  amiId: string;
  instanceType: string;
  rootVolumeGiB: number;
  globalTags: Record<string, string>;
}

export function validateGlobalTags(tags: Record<string, string>): Record<string, string> {
  // Billing keys are case-sensitive; System is owned by resource roles, not deployment overrides.
  for (const [key, value] of Object.entries(tags)) {
    if (!key.trim() || key.length > 128 || /^aws:/i.test(key) || key.toLowerCase() === 'system') {
      throw new Error(`Invalid or reserved global tag key: ${key}`);
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 256) {
      throw new Error(`Global tag ${key} must contain a non-empty string of at most 256 characters.`);
    }
  }
  if (!tags.Project || !tags.Environment) {
    throw new Error('Project and Environment cost tags are required with exact capitalization.');
  }
  return { ...tags };
}

export const deploymentIds = Object.keys(defaults.deployments);

export function getDeployment(id: string | undefined): DeploymentConfig {
  // Reject missing/unknown targets instead of silently deploying into the default AWS region.
  if (!id || !Object.hasOwn(defaults.deployments, id)) {
    throw new Error(`Select a deployment: ${deploymentIds.join(', ')}.`);
  }
  const { deployments, ...shared } = defaults;
  const config = { ...shared, ...deployments[id as keyof typeof deployments], id };
  // Validate catalog JSON at the boundary before building any cloud resources.
  return validateDeployment(config as DeploymentConfig);
}

export function validateDeployment(config: DeploymentConfig): DeploymentConfig {
  // Pin regional inputs and identities; an AZ from a different region must fail before AWS calls.
  if (!/^[a-z][a-z0-9-]*$/.test(config.id) || !/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(config.stackName)
    || !/^[a-z][a-z0-9-]{0,100}$/.test(config.resourceName)) {
    throw new Error('Invalid deployment, stack or resource name.');
  }
  if (!/^\d{12}$/.test(config.account) || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(config.region)
    || !new RegExp(`^${config.region}[a-z]$`).test(config.availabilityZone)) {
    throw new Error('Deployment requires an account and matching region/availability zone.');
  }
  if (!/^ami-[a-f0-9]{17}$/.test(config.amiId) || !/^t4g\.(small|medium|large|xlarge|2xlarge)$/.test(config.instanceType)
    || !Number.isInteger(config.rootVolumeGiB) || config.rootVolumeGiB < 30) {
    throw new Error('Deployment requires an AL2023 ARM64 AMI, supported t4g instance and at least 30 GiB.');
  }
  // Reject unsupported configuration instead of retaining an implicit alternative deployment mode.
  const fields = new Set(['id', 'stackName', 'resourceName', 'account', 'region', 'availabilityZone',
    'amiId', 'instanceType', 'rootVolumeGiB', 'globalTags']);
  if (Object.keys(config).some(key => !fields.has(key))) throw new Error('Unknown deployment configuration field.');
  return { ...config, globalTags: validateGlobalTags(config.globalTags) };
}
