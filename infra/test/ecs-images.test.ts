import { describe, expect, it, vi } from 'vitest';
import { assertOfficialXray, publishImageSet } from '../lib/ecs-images.js';
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

describe('publication gate', () => {
  const fresh = `sha256:${'a'.repeat(64)}`, published = `sha256:${'b'.repeat(64)}`;
  it('tests existing registry bytes together with missing builds, then pushes exact tested IDs', async () => {
    const events: string[] = [];
    const build = vi.fn(() => fresh);
    const images = await publishImageSet({
      existing: artifact => artifact === 'xray' ? published : undefined,
      build,
      test: async images => { expect(images.xray).toBe(published); events.push('test'); },
      push: (artifact, tag, id) => { expect(tag).toMatch(/^sha-[a-f0-9]{64}$/); expect(id).toBe(fresh); events.push(artifact); },
    });
    expect(build.mock.calls).toHaveLength(2);
    expect(images.xray).toBe(published);
    expect(events).toEqual(['test', 'awg', 'gateway-config']);
  });
  it('publishes nothing when any compatibility check fails', async () => {
    const push = vi.fn();
    await expect(publishImageSet({ existing: () => undefined, build: () => fresh,
      test: async () => { throw new Error('incompatible'); }, push })).rejects.toThrow('incompatible');
    expect(push).not.toHaveBeenCalled();
  });
  it('rejects a mutable tag as a test or publication identity', async () => {
    const test = vi.fn(), push = vi.fn();
    await expect(publishImageSet({ existing: () => undefined, build: () => 'image:latest', test, push })).rejects.toThrow('exact');
    expect(test).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
  });
});
