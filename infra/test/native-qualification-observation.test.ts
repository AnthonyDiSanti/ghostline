import { expect, it } from 'vitest';
import { nativeQualificationObservation } from '../lib/native-qualification-observation.js';
import { qualifyNativePlatform } from '../lib/platform-qualification.js';
import { imageArtifacts } from '../lib/image-artifacts.js';
import { digest } from '../lib/releases/model.js';
import type { Generation } from '../lib/releases/blue-green.js';
import type { Registry } from '../lib/releases/registry.js';

function fixture() {
  // Rebuilt provenance differs, while both observed indexes still select the exact locally qualified ARM64 child.
  const childText = JSON.stringify({ config: { digest: `sha256:${'c'.repeat(64)}` } });
  const child = { digest: digest(childText), manifest: childText, mediaType: 'test' };
  const indexText = JSON.stringify({ manifests: [{ digest: child.digest, platform: { os: 'linux', architecture: 'arm64' } }] });
  const index = { digest: digest(indexText), manifest: indexText, mediaType: 'test' };
  let missing = false;
  const registry: Registry = { get: async (_repository, reference) => missing ? undefined : reference === index.digest ? index : reference === child.digest ? child : undefined,
    put: async () => { throw new Error('Qualification must not mutate registry'); }, removeTag: async () => { throw new Error('Qualification must not mutate registry'); } };
  const generation: Generation = { slot: 'b', stack: 'owned', instance: 'host', interface: 'interface', boot: 'current', revision: 'revision', os: '1.66.0',
    images: Object.fromEntries(imageArtifacts.map(name => [name, index.digest])) };
  const images = Object.fromEntries(imageArtifacts.map(name => [name, { imageId: `sha256:${'d'.repeat(64)}`, runtimeDigest: child.digest, buildTag: `sha-${'e'.repeat(64)}` }])) as any;
  return { registry, generation, images, missing: () => { missing = true; } };
}

it('binds observed provenance to verified executable identity without rewriting the observed digests', async () => {
  const f = fixture(), actual = await nativeQualificationObservation(f.registry, f.generation);
  expect(actual.bootstrap?.digest).toBe(f.generation.images.bootstrap);
  expect(qualifyNativePlatform(f.images, actual, '2026-11-18T00:00:00Z').images.bootstrap.runtimeDigest).toBe(f.images.bootstrap.runtimeDigest);
  f.images.bootstrap.runtimeDigest = `sha256:${'f'.repeat(64)}`;
  expect(() => qualifyNativePlatform(f.images, actual, '2026-11-18T00:00:00Z')).toThrow('differs');
});

it('refuses missing registry evidence instead of fabricating an index resolution', async () => {
  const f = fixture(); f.missing();
  await expect(nativeQualificationObservation(f.registry, f.generation)).rejects.toThrow('unavailable');
});
