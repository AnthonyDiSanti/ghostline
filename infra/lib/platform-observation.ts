import { digestPattern } from './releases/model.js';
import type { StackObservation } from './releases/runtime-identity.js';
import { isIPv4 } from 'node:net';

export interface NetworkObservation {
  healthy: boolean;
  peers: Partial<Record<'xray' | 'awg', { id: string; ip: string; task: string; started: string; restarts: number }>>;
}

export interface HostObservation {
  bootId: string; version: string; variant: string; architecture: string;
  bootstrap?: StackObservation['bootstrap'];
  network?: NetworkObservation;
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
  const network = parseNetworkObservation(value.network);
  return { bootId: value.bootId, version: os.version_id, variant: os.variant_id,
    architecture: os.arch === 'aarch64' ? 'arm64' : 'amd64',
    // Missing/stale observation is reportable, never silently substituted with the current ECR alias.
    ...(fresh ? { bootstrap: { bootId: recordedBoot, digest: recordedDigest } } : {}),
    ...(network ? { network } : {}) };
}

function parseNetworkObservation(value: unknown): NetworkObservation | undefined {
  // A missing observer is not boot failure. Intentional cutover separately requires fresh, exact peers on the expected task.
  if (value === undefined || value === null) return undefined;
  const report = value as NetworkObservation & { schema: number };
  if (report.schema !== 1 || typeof report.healthy !== 'boolean' || !report.peers || Array.isArray(report.peers)
    || Object.keys(report.peers).some(name => !['xray', 'awg'].includes(name))
    || (!report.healthy && Object.keys(report.peers).length)) throw new Error('Network observation is malformed.');
  for (const peer of Object.values(report.peers)) {
    if (!peer || !/^[a-f0-9]{64}$/.test(peer.id) || !isIPv4(peer.ip)
      || !/^arn:aws:ecs:[a-z0-9-]+:\d{12}:task\/[a-z0-9-]+\/[a-f0-9]{32}$/.test(peer.task)
      || !Number.isFinite(Date.parse(peer.started)) || !Number.isSafeInteger(peer.restarts) || peer.restarts < 0) {
      throw new Error('Network peer observation is malformed.');
    }
  }
  return { healthy: report.healthy, peers: report.peers };
}
