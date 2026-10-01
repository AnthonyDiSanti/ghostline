import { expect, it, vi } from 'vitest';
import { reconcileRollout, type BlueGreenPorts } from '../lib/releases/rollout-controller.js';
import { artifacts, digest, releaseManifest, releaseRepository, type Release } from '../lib/releases/model.js';
import type { Generation, Rollout, RolloutObservation } from '../lib/releases/blue-green.js';

function fixture() {
  const hash = digest('new'); let present = true, observed = true, time = 1000;
  const release: Release = { schemaVersion: 3, promotionId: 'release-12345', promotedAt: '2026-09-28T00:00:00Z', origin: 'us-east-1', platform: 'linux/arm64', history: [],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.66.0'], targetVersion: '1.66.0' },
    images: Object.fromEntries(artifacts.map(name => [name, { repository: `ghostline/prod/${name}`, digest: hash, runtimeDigest: hash, buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'] };
  const generation: Generation = { slot: 'a', stack: 'stack-a', instance: 'host-a', interface: 'eni-a', revision: 'revision-a', boot: 'boot-a', os: '1.66.0', template: 'template',
    images: Object.fromEntries(artifacts.map(name => [name, hash])) };
  const state = new Map<string, unknown>(); const text = releaseManifest(release);
  const observation = { mode: 'active', aliasesReady: true, sourceHealthy: true } as RolloutObservation;
  const ports: BlueGreenPorts = { registry: { get: async repo => present ? { digest: repo === releaseRepository ? digest(text) : hash,
    manifest: repo === releaseRepository ? text : '{}', mediaType: 'application/vnd.oci.image.manifest.v1+json' } : undefined,
    put: async () => { throw new Error('No publication authority'); }, removeTag: async () => { throw new Error('No tag authority'); } },
    template: 'template', now: () => time, record: async <T>(id: string) => state.get(id) as T | undefined,
    put: async (id, record) => { state.set(id, record); }, replace: async (id, next, previous) => {
      if ((state.get(id) as Rollout | undefined)?.version !== previous?.version) return false; state.set(id, next); return true;
    }, generation: async () => observed ? generation : undefined, progress: vi.fn(async () => {}), alert: vi.fn(async () => {}),
    observe: async () => observation, save: async (next, previous) => { expect((state.get('rollout/current') as Rollout).version).toBe(previous.version); state.set('rollout/current', next); },
    effect: vi.fn(async () => {}) };
  return { ports, generation, state, tick: (action?: 'retry' | 'prepare') => reconcileRollout(ports, action),
    absent: () => { present = false; }, pending: () => { observed = false; }, advance: (ms: number) => { time += ms; } };
}
it('makes repeated unchanged releases and hourly events no-ops', async () => {
  const f = fixture(); expect((await f.tick()).status).toBe('already-running'); expect((await f.tick()).status).toBe('already-running');
  expect(f.ports.effect).not.toHaveBeenCalled(); expect(f.ports.progress).toHaveBeenLastCalledWith(false);
});
it.each(['xray', 'bootstrap', 'network-daemon', 'os', 'template'])('selects one green generation for a meaningful %s change', async change => {
  const f = fixture();
  if (change === 'os') f.generation.os = '1.65.0'; else if (change === 'template') f.generation.template = 'old'; else f.generation.images[change] = digest('old');
  expect((await f.tick()).status).toBe('action-in-progress');
  const first = f.state.get('rollout/current') as Rollout;
  expect(first).toMatchObject({ green: 'b', phase: 'network' });
  await f.tick(); expect((f.state.get('rollout/current') as Rollout).id).toBe(first.id);
  expect(f.ports.effect).toHaveBeenCalledWith({ kind: 'network' }, expect.objectContaining({ id: first.id }));
});
it('prepares a host for an IaC task-definition change even when executable bytes are unchanged', async () => {
  const f = fixture(); expect((await f.tick('prepare')).status).toBe('action-in-progress');
});
it('bounds missing source observations and never launches from absent release metadata', async () => {
  const f = fixture(); f.pending(); expect((await f.tick()).status).toBe('observation-pending');
  f.advance(900_001); expect((await f.tick()).status).toBe('paused-observation');
  f.absent(); expect((await f.tick()).status).toBe('waiting-for-release'); expect(f.ports.effect).not.toHaveBeenCalled();
});
it('requires explicit retry after failed-generation cleanup', async () => {
  const f = fixture(); await f.tick('prepare'); const first = f.state.get('rollout/current') as Rollout; first.phase = 'cleaned';
  expect((await f.tick()).status).toBe('retry-required');
  f.generation.images.xray = digest('old'); f.advance(1000);
  expect((await f.tick('retry')).status).toBe('action-in-progress');
  expect((f.state.get('rollout/current') as Rollout).id).not.toBe(first.id);
});
