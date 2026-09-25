import { expect, it, vi } from 'vitest';
import { reconcileController, type ControllerPorts } from '../lib/releases/controller.js';
import { artifacts, digest, releaseManifest, releaseRepository, type Release } from '../lib/releases/model.js';
import type { Registry } from '../lib/releases/registry.js';
import type { ActionObservation, StackAttempt } from '../lib/releases/stack-reconcile.js';

function fixture() {
  const hash = digest('new');
  const release: Release = { schemaVersion: 2, promotionId: 'release-12345', promotedAt: '2026-09-22T00:00:00Z', origin: 'us-east-1',
    platform: 'linux/arm64', history: [], os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'] },
    images: Object.fromEntries(artifacts.map(n => [n, { repository: `ghostline/prod/${n}`, digest: hash, runtimeDigest: hash, buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'] };
  let present = true, ready = true, time = 1000, attempt: StackAttempt | undefined;
  const state = new Map<string, unknown>();
  const actual: ActionObservation = { mode: 'active',
    host: { id: 'host', bootId: 'boot', state: 'running', version: '1.65.0', variant: 'aws-ecs-3', architecture: 'arm64', agentConnected: true, registration: 'ACTIVE' },
    bootstrap: { digest: hash, bootId: 'boot' }, daemon: { stable: true, digest: hash, tasks: ['d'], deployments: ['d1'] },
    gateway: { desired: 1, stable: true, tasks: ['g'], deployments: ['g1'], images: { xray: digest('old'), awg: hash, 'gateway-config': hash } } };
  const text = releaseManifest(release);
  const registry = { get: async (repo: string) => present ? { digest: repo === releaseRepository ? digest(text) : hash,
    manifest: repo === releaseRepository ? text : '{}', mediaType: 'application/vnd.oci.image.manifest.v1+json' } : undefined,
    put: async () => { throw new Error('Controller must not publish images.'); },
    removeTag: async () => { throw new Error('Controller must not move aliases.'); } } satisfies Registry;
  const ports: ControllerPorts = { registry, now: () => time, attempt: async () => attempt,
    refresh: async () => ready ? 'ready' : 'pending', observe: async () => structuredClone(actual), stillReady: async () => present,
    save: async (next, previous) => { expect(attempt?.version).toBe(previous?.version); attempt = structuredClone(next); return true; },
    request: vi.fn(async () => {}), alert: vi.fn(async () => {}), progress: vi.fn(async () => {}),
    record: async <T>(key: string) => state.get(key) as T | undefined, put: async (key, value) => { state.set(key, value); } };
  return { ports, actual, hash, attempt: () => attempt!, tick: (retry = false) => reconcileController(ports, retry),
    missing: () => { present = false; }, pending: () => { ready = false; }, advance: () => { time += 16 * 60_000; } };
}
it('continues only pending observations/actions and disables its minute rule after completion', async () => {
  const f = fixture(); expect(await f.tick()).toBe('action-in-progress');
  expect(f.ports.progress).toHaveBeenLastCalledWith(true);
  f.actual.gateway!.images.xray = f.hash; f.actual.gateway!.deployments.push('g2');
  await f.tick(); expect(await f.tick()).toBe('completed');
  expect(f.ports.progress).toHaveBeenLastCalledWith(false);
  await f.tick(); expect(f.ports.request).toHaveBeenCalledTimes(1);
});
it('observes an issued effect if release metadata disappears without repeating the effect', async () => {
  const f = fixture(); await f.tick(); f.missing();
  f.actual.gateway!.images.xray = f.hash; f.actual.gateway!.deployments.push('g2');
  await f.tick(); expect(await f.tick()).toBe('completed');
  expect(f.ports.request).toHaveBeenCalledTimes(1);
});
it('blocks intentional action on missing metadata without mutating the host', async () => {
  const f = fixture(); f.missing(); expect(await f.tick()).toBe('waiting-for-release');
  expect(f.ports.request).not.toHaveBeenCalled(); expect(f.ports.progress).toHaveBeenLastCalledWith(false);
});
it('bounds missing observation during a pending action and leaves it paused', async () => {
  const f = fixture(); await f.tick(); f.pending(); expect(await f.tick()).toBe('observation-pending');
  f.advance(); expect(await f.tick()).toBe('paused-observation');
  expect(f.attempt().state).toBe('paused'); expect(f.ports.request).toHaveBeenCalledTimes(1);
  expect(f.ports.progress).toHaveBeenLastCalledWith(false);
});
it('rejects explicit retry during an uncertain in-flight operation', async () => {
  const f = fixture(); await f.tick(); await expect(f.tick(true)).rejects.toThrow('in progress');
  expect(f.ports.request).toHaveBeenCalledTimes(1);
});
it('respects an external native rollback until the operator explicitly retries', async () => {
  const f = fixture(); f.actual.gateway!.latestFailureAt = Date.parse('2026-09-22T01:00:00Z');
  expect(await f.tick()).toBe('paused-external-failure'); expect(f.ports.request).not.toHaveBeenCalled();
  expect(await f.tick(true)).toBe('action-in-progress'); expect(f.ports.request).toHaveBeenCalledTimes(1);
});
