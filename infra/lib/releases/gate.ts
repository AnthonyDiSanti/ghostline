import { artifacts, releaseRepository, production, releaseSelector, repository } from './model.js';
import { readRelease, type Registry, type ReleaseRecord } from './registry.js';
import type { Rollout } from './blue-green.js';
import type { LifecycleState } from './lifecycle.js';

export async function readiness(registry: Registry): Promise<{ current?: ReleaseRecord; ready: boolean; reason?: string }> {
  const current = await readRelease(registry, releaseRepository, releaseSelector);
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

export async function assertStartReady(ports: { registry: Registry; record<T>(key: string): Promise<T | undefined> }): Promise<void> {
  // Deliberate activation requires coherent local intent. Unexpected native boot does not call this preflight.
  const ready = await readiness(ports.registry);
  if (!ready.ready || !ready.current?.release.os.targetVersion) throw new Error(`Release is not ready: ${ready.reason ?? 'qualified OS target missing'}`);
  const attempt = await ports.record<Rollout>('rollout/current');
  const lifecycle = await ports.record<LifecycleState>('lifecycle');
  const resumingPreparation = lifecycle?.operation && ['deploy', 'unpark'].includes(lifecycle.operation.kind)
    && attempt && ['network', 'addresses', 'wire', 'host', 'daemon', 'placement', 'force'].includes(attempt.phase) && !attempt.deployment;
  if (attempt && !['complete', 'cleaned', 'retired'].includes(attempt.phase) && !resumingPreparation) {
    throw new Error('Regional intent has an unresolved action; inspect, explicitly retry or publish a correction first.');
  }
}
