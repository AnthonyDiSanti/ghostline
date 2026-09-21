import { artifacts, production, releaseSelector, repository, type Artifact, type Release } from './model.js';
import { readRelease, type Registry, type ReleaseRecord } from './registry.js';

export interface ServiceSnapshot {
  incarnation: string;
  desired: number;
  stable: boolean;
  busy: boolean;
  images: Partial<Record<Artifact, string>>;
  deployments: Array<{ id: string; status: string; createdAt: number }>;
}
export type AttemptState = 'claimed' | 'requested' | 'completed' | 'failed' | 'ambiguous' | 'cancelled';
export interface Attempt {
  release: string;
  version: number;
  state: AttemptState;
  incarnation: string;
  startedAt: number;
  baseline: string[];
  reason?: string;
}
export interface GatePorts {
  registry: Registry;
  service(): Promise<ServiceSnapshot | undefined>;
  attempt(release: string): Promise<Attempt | undefined>;
  save(next: Attempt, previous?: Attempt): Promise<boolean>;
  force(): Promise<void>;
  alert(key: string, message: string): Promise<void>;
  now(): number;
}

export async function readiness(registry: Registry): Promise<{ current?: ReleaseRecord; ready: boolean; reason?: string }> {
  const current = await readRelease(registry, repository('gateway-config'), releaseSelector);
  if (!current) return { ready: false, reason: 'No production release document.' };
  for (const name of artifacts) {
    const expected = current.release.images[name];
    const image = await registry.get(repository(name), production);
    if (!image || image.digest !== expected.digest) return { current, ready: false, reason: `${name} production alias is not ready.` };
    // A manifest index and the ARM64 child are distinct identities. Require the declared child locally.
    if (expected.runtimeDigest !== expected.digest) {
      const index = JSON.parse(image.manifest);
      const children = (index.manifests ?? []).filter((m: any) => m.platform?.os === 'linux' && m.platform?.architecture === 'arm64');
      if (children.length !== 1 || children[0].digest !== expected.runtimeDigest
        || !await registry.get(repository(name), expected.runtimeDigest)) return { current, ready: false, reason: `${name} ARM64 child is not ready.` };
    }
  }
  return { current, ready: true };
}

export function matches(images: ServiceSnapshot['images'], release: Release): boolean {
  // ECS can report the captured index digest while the engine executes its ARM64 child.
  return artifacts.every(name => [release.images[name].digest, release.images[name].runtimeDigest].includes(images[name] ?? ''));
}

export async function reconcile(ports: GatePorts): Promise<string> {
  // Events are wakeups only. The local release selector, aliases and current ECS state decide every action.
  const ready = await readiness(ports.registry);
  if (!ready.current) return 'waiting-for-release';
  const { digest: hash, release } = ready.current;
  const service = await ports.service();
  if (!service || service.desired === 0) return 'stopped-or-absent';
  let attempt = await ports.attempt(hash);
  const update = async (state: AttemptState, reason?: string) => {
    const next: Attempt = { ...attempt!, version: attempt!.version + 1, state, ...(reason ? { reason } : {}) };
    if (!await ports.save(next, attempt)) throw new Error('Release attempt changed concurrently.');
    attempt = next;
    if (state === 'failed' || state === 'ambiguous') await ports.alert(`${hash}/${state}`, reason!);
  };
  if (attempt && ['claimed', 'requested'].includes(attempt.state)) {
    if (attempt.incarnation !== service.incarnation) {
      await update('ambiguous', 'Service was recreated during an unfinished release. Explicit retry or a new release is required.');
    } else {
      const observed = service.deployments.filter(d => !attempt!.baseline.includes(d.id) && d.createdAt >= attempt!.startedAt - 2000);
      if (observed.some(d => /FAILED|ROLLBACK|STOPPED/.test(d.status))) {
        await update('failed', 'ECS failed, stopped or rolled back this release. Production aliases remain unchanged.');
      } else if (service.stable && matches(service.images, release)) {
        await update('completed');
      } else if (observed.length > 1 || (!service.busy && ports.now() - attempt.startedAt > 120_000)) {
        await update('ambiguous', 'Deployment outcome is ambiguous or its completed digests differ from the release. Explicit retry is required.');
      } else return 'deployment-in-progress';
    }
  }
  if (attempt && ['failed', 'ambiguous'].includes(attempt.state)) return `paused-${attempt.state}`;
  if (service.stable && matches(service.images, release)) return 'already-running';
  if (!attempt || attempt.state === 'cancelled') {
    // An operator/CloudFormation rollout can fail without a gate claim. Do not automatically retry its intent.
    const latest = [...service.deployments].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest && /FAILED|ROLLBACK|STOPPED/.test(latest.status)
      && latest.createdAt >= Math.max(Date.parse(release.promotedAt), attempt?.startedAt ?? 0)) {
      const unresolved: Attempt = { release: hash, version: (attempt?.version ?? 0) + 1, state: 'ambiguous', incarnation: service.incarnation,
        startedAt: latest.createdAt, baseline: [], reason: 'A newer external deployment failed or rolled back. Inspect its image selection before explicitly retrying.' };
      if (await ports.save(unresolved, attempt)) await ports.alert(`external-failure/${hash}`, unresolved.reason!);
      return 'paused-ambiguous';
    }
  }
  // A stopped task can remain outside the window: alert without extending app-level retention.
  if (service.stable && artifacts.every(n => service.images[n])) {
    const retained = [release];
    for (const hash of release.history) {
      const item = await readRelease(ports.registry, repository('gateway-config'), hash);
      if (item) retained.push(item.release);
    }
    if (!retained.some(r => matches(service.images, r))) await ports.alert(`outside-history/${Object.values(service.images).join('/')}`,
      'Running gateway images are outside production plus three retained releases. Debug this region; older cold-recovery artifacts may expire.');
  }
  if (service.busy) return 'deployment-in-progress';
  if (!ready.ready) {
    await ports.alert(`incomplete/${hash}`, `Release is incomplete locally: ${ready.reason} No deployment requested.`);
    return 'waiting-for-images';
  }
  if (attempt?.state === 'completed' && attempt.incarnation === service.incarnation) {
    await ports.alert(`drift/${hash}`, 'A completed release differs from the current runtime. No automatic repeated deployment.');
    return 'runtime-drift';
  }
  const claimed: Attempt = { release: hash, version: (attempt?.version ?? 0) + 1, state: 'claimed',
    incarnation: service.incarnation, startedAt: ports.now(), baseline: service.deployments.map(d => d.id) };
  if (!await ports.save(claimed, attempt)) return 'attempt-already-claimed';
  attempt = claimed;
  // Re-read just before the sole mutation. This narrows, but intentionally does not eliminate, the tag race.
  const latest = await ports.service();
  const final = await readiness(ports.registry);
  if (!final.ready || final.current?.digest !== hash || !latest || latest.desired === 0 || latest.busy
    || latest.incarnation !== service.incarnation || latest.deployments.some(d => !claimed.baseline.includes(d.id))) {
    await update('cancelled'); return 'state-changed';
  }
  try {
    await ports.force();
    await update('requested');
    return 'deployment-requested';
  } catch {
    // A timeout can follow an accepted request. Never blindly replay the non-idempotent force call.
    await update('ambiguous', 'Force-deployment request or its acknowledgement failed. Inspect ECS, then explicitly retry if appropriate.');
    return 'paused-ambiguous';
  }
}

export async function assertStartReady(ports: GatePorts): Promise<void> {
  const ready = await readiness(ports.registry);
  if (!ready.ready || !ready.current) throw new Error(`Release is not ready: ${ready.reason}`);
  const attempt = await ports.attempt(ready.current.digest);
  if (attempt && ['failed', 'ambiguous', 'claimed', 'requested'].includes(attempt.state)) {
    throw new Error('Production intent has an unresolved regional attempt; reconcile, explicitly retry or publish a correction first.');
  }
}
