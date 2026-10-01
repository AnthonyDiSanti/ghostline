import { expect, it } from 'vitest';
import { generationReferences, runtimeImageReferences, rolloutReferences } from '../lib/releases/runtime-retention.js';
import { artifacts, digest, releaseRepository, repository, type Release } from '../lib/releases/model.js';
import type { Generation, Rollout } from '../lib/releases/blue-green.js';

it('retains a complete parked image snapshot without inventing host or slot identity', () => {
  const images = Object.fromEntries(artifacts.map(name => [name, digest(name)]));
  expect(runtimeImageReferences(images)).toEqual(artifacts.map(name => ({ repository: repository(name), digest: images[name] })));
  expect(runtimeImageReferences(undefined)).toBeUndefined();
  delete images.bootstrap;
  expect(runtimeImageReferences(images)).toBeUndefined();
  images.bootstrap = 'keep-production';
  expect(runtimeImageReferences(images)).toBeUndefined();
});

it('protects both host generations and the held document beyond the MRU window', () => {
  const generation = { images: Object.fromEntries(artifacts.map(n => [n, digest(`old-${n}`)])) } as Generation;
  const release = { images: Object.fromEntries(artifacts.map(n => [n, {
    repository: repository(n), digest: digest(`new-${n}`), runtimeDigest: digest(`child-${n}`),
  }])) } as Release;
  const rollout = { phase: 'held', source: generation, intent: release, release: digest('document') } as Rollout;
  const protectedSet = rolloutReferences(rollout)!;
  expect(protectedSet).toHaveLength(16);
  expect(protectedSet).toContainEqual({ repository: releaseRepository, digest: digest('document') });
  for (const artifact of artifacts) expect(protectedSet).toContainEqual({ repository: repository(artifact), digest: generation.images[artifact] });
  rollout.phase = 'complete'; expect(rolloutReferences(rollout)).toHaveLength(11);
  rollout.phase = 'cleaned'; expect(rolloutReferences(rollout)).toHaveLength(11);
  delete generation.images.bootstrap;
  expect(generationReferences(generation)).toBeUndefined();
  expect(rolloutReferences(rollout)).toBeUndefined();
});
