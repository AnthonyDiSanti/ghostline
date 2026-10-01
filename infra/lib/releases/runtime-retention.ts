import { artifacts, digestPattern, releaseRepository, repository } from './model.js';
import type { Generation, Rollout } from './blue-green.js';
import type { ArtifactReference } from './retention.js';

export function generationReferences(generation: Generation): ArtifactReference[] | undefined {
  return runtimeImageReferences(generation.images);
}

export interface RuntimeImages { at: number; images: Record<string, string> }
export function runtimeImageReferences(images: Record<string, string> | undefined): ArtifactReference[] | undefined {
  // Every observed component is required, including the bootstrap that only runs at host boot.
  // Parked retention needs image identities, not a fictional live host or slot after the host has been removed.
  const references = artifacts.map(name => ({ repository: repository(name), digest: images?.[name]! }));
  return references.every(r => digestPattern.test(r.digest ?? '')) ? references : undefined;
}

export function rolloutReferences(rollout?: Rollout): ArtifactReference[] | undefined {
  if (!rollout) return [];
  const source = generationReferences(rollout.source);
  const intended = artifacts.flatMap(name => {
    const image = rollout.intent.images[name];
    return [{ repository: repository(name), digest: image.digest }, { repository: repository(name), digest: image.runtimeDigest }];
  });
  if (!source || !digestPattern.test(rollout.release) || intended.some(r => !digestPattern.test(r.digest))) return undefined;
  // A held/overlapping deployment can need both sets. Keep its document even after it leaves the global MRU window.
  return [{ repository: releaseRepository, digest: rollout.release }, ...intended,
    ...(!['complete', 'cleaned', 'retired'].includes(rollout.phase) ? source : [])];
}
