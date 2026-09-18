import { describe, expect, it } from 'vitest';
import { assertOfficialXray } from '../lib/ecs-images.js';
import { officialXrayImage } from '../lib/ecs-release.js';

describe('official image identity', () => {
  // Tags alone cannot establish that publication retained the upstream binary and filesystem.
  const baseline = { id: 'sha256:config', os: 'linux', architecture: 'arm64', layers: ['sha256:layer'] };
  it('accepts matching image configuration and layers under a different registry name', () => {
    expect(() => assertOfficialXray('mirror', () => JSON.stringify(baseline))).not.toThrow();
  });
  it.each([
    { ...baseline, id: 'sha256:changed' },
    { ...baseline, architecture: 'amd64' },
    { ...baseline, layers: ['sha256:changed'] },
  ])('rejects changed image content or architecture', actual => {
    expect(() => assertOfficialXray('mirror', args => JSON.stringify(args.includes(officialXrayImage) ? baseline : actual))).toThrow('differs');
  });
});
