import { digestPattern } from './releases/model.js';
import type { StackObservation } from './releases/stack-action.js';

export interface HostObservation {
  bootId: string; version: string; variant: string; architecture: string;
  bootstrap?: StackObservation['bootstrap'];
}
export function parseHostObservation(text: string): HostObservation {
  // The fixed SSM document reads current kernel/OS separately from the best-effort record left by bootstrap.
  const value = JSON.parse(text);
  const os = value?.os?.os;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value?.bootId ?? '')
    || typeof os?.version_id !== 'string' || !/^\d+\.\d+\.\d+$/.test(os.version_id)
    || typeof os.variant_id !== 'string' || !/^[a-z0-9-]+$/.test(os.variant_id)
    || !['aarch64','x86_64'].includes(os.arch)) throw new Error('Host observation is malformed.');
  const attributes = value.attributes?.settings?.ecs?.['instance-attributes'] ?? {};
  const recordedBoot = attributes.ghostline_boot_id;
  const recordedDigest = attributes.ghostline_bootstrap_digest;
  const fresh = recordedBoot === value.bootId && typeof recordedDigest === 'string' && digestPattern.test(recordedDigest);
  return { bootId: value.bootId, version: os.version_id, variant: os.variant_id,
    architecture: os.arch === 'aarch64' ? 'arm64' : 'amd64',
    // Missing/stale observation is reportable, never silently substituted with the current ECR alias.
    ...(fresh ? { bootstrap: { bootId: recordedBoot, digest: recordedDigest } } : {}) };
}
