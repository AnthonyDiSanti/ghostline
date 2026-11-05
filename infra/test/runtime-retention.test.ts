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
  images.bootstrap = digest('bootstrap'); images.unexpected = digest('unexpected');
  expect(runtimeImageReferences(images)).toBeUndefined();
});

it('protects a six-image parked runtime and a v3 blue during a v4 rollout', () => {
  // A DNS-enabled source and mixed-schema overlap must keep both exact image sets through cleanup.
  const oldImages = Object.fromEntries(artifacts.map(name => [name, digest(`old-${name}`)]));
  const newImages = { ...oldImages, 'dns-policy': digest('new-dns') };
  expect(runtimeImageReferences(newImages)).toContainEqual({ repository: repository('dns-policy'), digest: newImages['dns-policy'] });
  const intent = { schemaVersion: 4, images: Object.fromEntries(Object.keys(newImages).map(name => [name, {
    repository: repository(name as keyof typeof newImages), digest: digest(`new-${name}`), runtimeDigest: digest(`child-${name}`),
  }])) } as Release;
  const rollout = { phase: 'held', source: { images: oldImages }, intent, release: digest('v4-document') } as Rollout;
  const protectedSet = rolloutReferences(rollout)!;
  expect(protectedSet).toHaveLength(18);
  expect(protectedSet).toContainEqual({ repository: repository('dns-policy'), digest: intent.images['dns-policy']!.digest });
  expect(protectedSet).toContainEqual({ repository: repository('xray'), digest: oldImages.xray });
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
