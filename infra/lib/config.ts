import { isIP } from 'node:net';
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
  runtime?: {
    awgEnabled: boolean;
  };
}

export interface LaunchInputs {
  operatorSshCidr: string;
  sshPublicKey: string;
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
  if (!/^ami-[a-f0-9]{17}$/.test(config.amiId) || !/^t3\.[a-z0-9]+$/.test(config.instanceType)
    || !Number.isInteger(config.rootVolumeGiB) || config.rootVolumeGiB < 8) {
    throw new Error('Deployment requires a pinned AMI, t3 instance and root disk of at least 8 GiB.');
  }
  if (config.runtime && (typeof config.runtime.awgEnabled !== 'boolean' || Object.hasOwn(config.runtime, 'stage'))) {
    throw new Error('Migration stages are retired; runtime requires an explicit awgEnabled boolean.');
  }
  return { ...config, globalTags: validateGlobalTags(config.globalTags) };
}

export function validateLaunchInputs(input: LaunchInputs): LaunchInputs {
  // SSH always targets one operator address; moving networks must not widen the access rule.
  const cidr = input.operatorSshCidr.trim();
  const [address, prefix, extra] = cidr.split('/');
  if (!address || isIP(address) !== 4 || prefix !== '32' || extra !== undefined || address === '0.0.0.0') {
    throw new Error('operatorSshCidr must be a single IPv4 address with /32.');
  }
  const publicKey = input.sshPublicKey.trim();
  if (!/^ssh-rsa [A-Za-z0-9+/]+={0,2}(?: [^\r\n]+)?$/.test(publicKey)) {
    throw new Error('sshPublicKey must be a single OpenSSH RSA public key; never provide a private key.');
  }
  return { operatorSshCidr: cidr, sshPublicKey: publicKey };
}
