import { publicationProfile } from './releases/topology.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import committed from '../deployment.json' with { type: 'json' };

// A campaign uses the same recipe with an explicit private catalog; never rewrite the maintained catalog.
export const catalogPath = process.env.GHOSTLINE_CATALOG
  ? resolve(process.env.GHOSTLINE_CATALOG) : fileURLToPath(new URL('../deployment.json', import.meta.url));
const defaults: typeof committed = process.env.GHOSTLINE_CATALOG
  ? JSON.parse(readFileSync(catalogPath, 'utf8')) : committed;

export interface DeploymentConfig {
  id: string;
  stackName: string;
  resourceName: string;
  account: string;
  region: string;
  availabilityZone: string;
  instanceType: string;
  dataVolumeGiB: number;
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

// Both maintained and temporary catalogs receive the same strict validation before synthesis.
if (!defaults || Object.keys(defaults).some(k => !['account', 'instanceType', 'dataVolumeGiB', 'globalTags', 'deployments', 'imagePublication'].includes(k))
  || !defaults.deployments || Array.isArray(defaults.deployments) || !Object.keys(defaults.deployments).length) throw new Error('Invalid deployment catalog.');
export const deploymentIds = Object.keys(defaults.deployments);
for (const id of deploymentIds) getDeployment(id);
publicationProfile(defaults.imagePublication, deploymentIds.map(id => getDeployment(id).region));

export function getDeployment(id: string | undefined): DeploymentConfig {
  // Reject missing/unknown targets instead of silently deploying into the default AWS region.
  if (!id || !Object.hasOwn(defaults.deployments, id)) {
    throw new Error(`Select a deployment: ${deploymentIds.join(', ')}.`);
  }
  const { deployments, imagePublication: _publication, ...shared } = defaults;
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
  if (!/^t4g\.(small|medium|large|xlarge|2xlarge)$/.test(config.instanceType)
    || !Number.isInteger(config.dataVolumeGiB) || config.dataVolumeGiB < 30) {
    throw new Error('Deployment requires a supported t4g instance and at least 30 GiB.');
  }
  // Reject unsupported configuration instead of retaining an implicit alternative deployment mode.
  const fields = new Set(['id', 'stackName', 'resourceName', 'account', 'region', 'availabilityZone',
    'instanceType', 'dataVolumeGiB', 'globalTags']);
  if (Object.keys(config).some(key => !fields.has(key))) throw new Error('Unknown deployment configuration field.');
  return { ...config, globalTags: validateGlobalTags(config.globalTags) };
}

export function getPublication() {
  // Activation persists membership during this process; do not reuse the import cache for later reconciliation.
  const current = JSON.parse(readFileSync(catalogPath, 'utf8'));
  return publicationProfile(current.imagePublication ?? {}, deploymentIds.map(id => getDeployment(id).region));
}
