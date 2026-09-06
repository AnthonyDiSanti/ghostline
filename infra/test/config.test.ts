import { describe, expect, it } from 'vitest';
import { validateGlobalTags, validateLaunchInputs } from '../lib/config.js';
import { launch } from './fixture.js';

describe('launch configuration', () => {
  it('accepts a single operator address and an RSA public key', () => {
    expect(validateLaunchInputs(launch)).toEqual({ ...launch, sshPublicKey: launch.sshPublicKey.trim() });
  });
  it.each(['0.0.0.0/0', '10.0.0.0/24', '0.0.0.0/32', '203.0.113.1', '256.1.1.1/32', '::1/32', '203.0.113.1/32/0'])('rejects unsafe or malformed SSH range %s', (operatorSshCidr) => {
    expect(() => validateLaunchInputs({ ...launch, operatorSshCidr })).toThrow('/32');
  });
  it.each(['', 'not a public key', '-----BEGIN RSA PRIVATE KEY-----', `${launch.sshPublicKey}\nssh-rsa AAAA`])('rejects invalid key input without echoing it', (sshPublicKey) => {
    expect(() => validateLaunchInputs({ ...launch, sshPublicKey })).toThrow('public key');
  });
});

describe('cost tags', () => {
  const tags = { Project: 'ghostline', Environment: 'prod' };
  it('preserves global dimensions and allows additional descriptive tags', () => {
    expect(validateGlobalTags({ ...tags, Owner: 'Anthony' })).toEqual({ ...tags, Owner: 'Anthony' });
  });
  it.each(['System', 'system', 'SYSTEM', 'aws:thing', ''])('rejects reserved or empty key %s', (key) => {
    expect(() => validateGlobalTags({ ...tags, [key]: 'override' })).toThrow('tag key');
  });
  it('requires exact billing dimensions and nonempty values', () => {
    expect(() => validateGlobalTags({ project: 'ghostline', Environment: 'prod' })).toThrow('Project');
    expect(() => validateGlobalTags({ ...tags, Project: ' ' })).toThrow('non-empty');
  });
});
