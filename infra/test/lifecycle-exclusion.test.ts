import { expect, it, vi } from 'vitest';
import { claimLifecycle, completeLifecycle, coordinatedRelease, failLifecycle, type LifecycleState, type LifecycleStore } from '../lib/releases/lifecycle.js';
function memory() {
  let state: LifecycleState | undefined;
  const store: LifecycleStore = { read: async () => structuredClone(state), replace: async (next, before) => {
    if (state?.version !== before?.version) return false;
    state = structuredClone(next); return true;
  } };
  return { store, state: () => state };
}
it('excludes release changes throughout stop/park/destroy and preserves power intent afterward', async () => {
  for (const mode of ['stopped', 'parked', 'destroying'] as const) {
    const { store } = memory(); const run = vi.fn(async () => 'deployment-requested');
    const claim = (await claimLifecycle(store, 'cli', 'operator-1', mode))!;
    expect(await coordinatedRelease(store, run)).toBe('lifecycle-held');
    await completeLifecycle(store, claim);
    expect(await coordinatedRelease(store, run)).toBe('lifecycle-held'); expect(run).not.toHaveBeenCalled();
  }
});
it('holds one release across wakeups until completion and excludes a racing CLI writer', async () => {
  const { store, state } = memory();
  expect(await coordinatedRelease(store, async () => 'deployment-requested')).toBe('deployment-requested');
  expect(await claimLifecycle(store, 'park', 'operator', 'parked')).toBeUndefined();
  expect(await coordinatedRelease(store, async () => 'deployment-in-progress')).toBe('deployment-in-progress');
  expect(await coordinatedRelease(store, async () => 'already-running')).toBe('already-running');
  expect(state()?.operation).toBeUndefined();
  expect(await claimLifecycle(store, 'park', 'operator', 'parked')).toBeDefined();
});
it('persists failed CLI ownership without time-based unlocking and resumes only the same token/kind', async () => {
  const { store, state } = memory(); const claim = (await claimLifecycle(store, 'stop', 'one', 'stopped'))!;
  await failLifecycle(store, claim, 'AWS request outcome unknown');
  expect(await claimLifecycle(store, 'destroy', 'two', 'destroying')).toBeUndefined();
  expect(await claimLifecycle(store, 'start', 'one')).toBeUndefined();
  const resumed = (await claimLifecycle(store, 'stop', 'one', 'stopped'))!;
  expect(resumed.operation?.failure).toContain('unknown');
  await completeLifecycle(store, resumed); expect(state()?.mode).toBe('stopped');
});
it('uses compare-and-swap to select only one concurrent writer', async () => {
  const { store } = memory();
  const claims = await Promise.all([claimLifecycle(store, 'start', 'a'), claimLifecycle(store, 'stop', 'b', 'stopped')]);
  expect(claims.filter(Boolean)).toHaveLength(1);
});
it('does not unlock after an interrupted release observation, but lets its sole controller resume', async () => {
  const { store } = memory();
  await expect(coordinatedRelease(store, async () => { throw new Error('network'); })).rejects.toThrow('network');
  expect(await claimLifecycle(store, 'destroy', 'cli', 'destroying')).toBeUndefined();
  expect(await coordinatedRelease(store, async () => 'paused-ambiguous')).toBe('paused-ambiguous');
  expect(await claimLifecycle(store, 'destroy', 'cli', 'destroying')).toBeDefined();
});
