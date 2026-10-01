import { type ImageArtifact } from '../image-artifacts.js';
import type { LifecycleMode } from './lifecycle.js';

export interface ComponentIdentity { digest: string; runtimeDigest: string }
export interface StackObservation {
  mode: LifecycleMode;
  resolvedDigests?: Record<string, string>;
  host?: { id: string; state: string; bootId?: string; version?: string; variant?: string; architecture?: string };
  bootstrap?: { digest: string; bootId: string };
  gateway?: { desired: number; stable: boolean; images: Partial<Record<ImageArtifact, string>> };
  daemon?: { stable: boolean; digest?: string };
}
export function componentMatches(expected: ComponentIdentity, observed?: string, resolved: Record<string, string> = {}): boolean {
  // Provenance can change an index without changing executable bytes. The adapter resolves observed indexes before comparison.
  return observed !== undefined && ([expected.digest, expected.runtimeDigest].includes(observed)
    || resolved[observed] === expected.runtimeDigest);
}

