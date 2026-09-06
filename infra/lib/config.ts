import { isIP } from 'node:net';
import defaults from '../deployment.json' with { type: 'json' };

export interface DeploymentConfig {
  account: string;
  region: string;
  availabilityZone: string;
  amiId: string;
  instanceType: string;
  rootVolumeGiB: number;
  globalTags: Record<string, string>;
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

export const deployment: DeploymentConfig = {
  ...defaults,
  globalTags: validateGlobalTags(defaults.globalTags),
};

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
