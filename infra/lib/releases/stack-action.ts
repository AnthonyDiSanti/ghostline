import { applicationArtifacts, type ImageArtifact } from '../image-artifacts.js';
import type { LifecycleMode } from './lifecycle.js';

export interface ComponentIdentity { digest: string; runtimeDigest: string }
export interface StackIntent {
  components: Record<ImageArtifact, ComponentIdentity>;
  os: { variant: string; architecture: string; compatibleVersions: string[] };
}
export interface StackObservation {
  mode: LifecycleMode;
  resolvedDigests?: Record<string, string>;
  host?: { id: string; state: string; bootId?: string; version?: string; variant?: string; architecture?: string };
  bootstrap?: { digest: string; bootId: string };
  gateway?: { desired: number; stable: boolean; images: Partial<Record<ImageArtifact, string>> };
  daemon?: { stable: boolean; digest?: string };
}
export type StackAction =
  | { kind: 'none' }
  | { kind: 'deferred' | 'blocked'; reason: string }
  | { kind: 'gateway' }
  | { kind: 'daemon'; refreshGateway: boolean }
  | { kind: 'reboot'; refreshDaemon: boolean; refreshGateway: boolean };

export function componentMatches(expected: ComponentIdentity, observed?: string, resolved: Record<string, string> = {}): boolean {
  // Provenance can change an index without changing executable bytes. The adapter resolves observed indexes before comparison.
  return observed !== undefined && ([expected.digest, expected.runtimeDigest].includes(observed)
    || resolved[observed] === expected.runtimeDigest);
}

export function selectStackAction(intent: StackIntent, actual: StackObservation): StackAction {
  // This plans intentional promotion only. Native recovery never calls this as a prerequisite to boot.
  if (actual.mode !== 'active' || !actual.host || actual.host.state !== 'running' || !actual.gateway?.desired) {
    return { kind: 'deferred', reason: 'Preserve the requested regional power state.' };
  }
  const host = actual.host;
  if (!host.bootId || !actual.bootstrap || actual.bootstrap.bootId !== host.bootId) {
    return { kind: 'blocked', reason: 'The current boot has no verified bootstrap observation.' };
  }
  if (host.variant !== intent.os.variant || host.architecture !== intent.os.architecture
    || !host.version || !intent.os.compatibleVersions.includes(host.version)) {
    return { kind: 'blocked', reason: 'The running OS is outside the qualified compatibility contract.' };
  }
  if (!actual.gateway.stable || !actual.daemon?.stable) {
    return { kind: 'deferred', reason: 'Observe the existing ECS transition before requesting another action.' };
  }
  const daemonChanged = !componentMatches(intent.components['network-daemon'], actual.daemon.digest, actual.resolvedDigests);
  const applicationChanged = applicationArtifacts.some(name => !componentMatches(intent.components[name], actual.gateway!.images[name], actual.resolvedDigests));
  // A single controlled reboot covers every changed component; do not queue a second gateway rollout afterward.
  if (!componentMatches(intent.components.bootstrap, actual.bootstrap.digest, actual.resolvedDigests)) {
    return { kind: 'reboot', refreshDaemon: daemonChanged, refreshGateway: applicationChanged };
  }
  if (daemonChanged) return { kind: 'daemon', refreshGateway: applicationChanged };
  if (applicationChanged) return { kind: 'gateway' };
  return { kind: 'none' };
}
