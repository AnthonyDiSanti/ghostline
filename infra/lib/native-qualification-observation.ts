import { platformArtifacts } from './image-artifacts.js';
import { qualificationObservation } from './releases/generation-proof.js';
import { repository } from './releases/model.js';
import { runtimeManifest, type Registry } from './releases/registry.js';
import type { Generation } from './releases/blue-green.js';

export async function nativeQualificationObservation(registry: Registry, generation: Generation) {
  // Resolve the exact observed owned indexes, rather than treating changed build provenance as different executable bytes.
  const actual = qualificationObservation(generation), resolvedDigests: Record<string, string> = {};
  for (const name of platformArtifacts) {
    const observed = generation.images[name]!;
    const manifest = await registry.get(repository(name), observed);
    if (!manifest) throw new Error('Observed native platform artifact is unavailable.');
    resolvedDigests[observed] = (await runtimeManifest(registry, repository(name), manifest)).digest;
  }
  return { ...actual, resolvedDigests };
}
