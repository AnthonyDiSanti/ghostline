import { describe, expect, it, vi } from 'vitest';
import { cleanupBenchmarkClients, handoffInterruptedDeployment } from '../lib/benchmark/cleanup.js';
import { getDeployment } from '../lib/config.js';
import type { LifecycleState, LifecycleStore } from '../lib/releases/lifecycle.js';

const config = { ...getDeployment('stockholm-ecs'), id: 'bm-test', region: 'eu-central-1' };
const receipt = { account: config.account, region: config.region, owner: 'child', benchmarkOwner: 'campaign', kind: 'deploy', pid: 123 };
function fixture() {
  let state: LifecycleState = { version: 4, mode: 'active', operation: { kind: 'deploy', owner: 'child', startedAt: 1, failure: 'interrupted' } };
  const store: LifecycleStore = { read: async () => state, replace: vi.fn(async next => { state = next; return true; }) };
  return store;
}
describe('interrupted disposable deployment cleanup', () => {
  it('removes only exact owner-labeled clients and RAM volumes, with an empty-state recheck', () => {
    const docker = vi.fn().mockReturnValueOnce('abc123\n').mockReturnValueOnce('')
      .mockReturnValueOnce('ram-volume\n').mockReturnValueOnce('').mockReturnValue('');
    cleanupBenchmarkClients('12345678-1234-1234-1234-123456789abc', '/nonexistent-fixture', docker);
    expect(docker.mock.calls).toEqual([
      ['ps', '-aq', '--filter', 'label=ghostline.benchmark.owner=12345678-1234-1234-1234-123456789abc'],
      ['rm', '-f', '-v', 'abc123'],
      ['volume', 'ls', '-q', '--filter', 'label=ghostline.benchmark.owner=12345678-1234-1234-1234-123456789abc'],
      ['volume', 'rm', 'ram-volume'],
      ['ps', '-aq', '--filter', 'label=ghostline.benchmark.owner=12345678-1234-1234-1234-123456789abc'],
      ['volume', 'ls', '-q', '--filter', 'label=ghostline.benchmark.owner=12345678-1234-1234-1234-123456789abc'],
    ].map(args => [args]));
  });
  it('hands the exact dead child claim to destroy without enabling releases, and permits replay', async () => {
    const store = fixture();
    await handoffInterruptedDeployment(config, 'campaign', receipt, store, () => false, async () => 'ROLLBACK_COMPLETE');
    expect(await store.read()).toEqual({ version: 5, mode: 'destroying' });
    await handoffInterruptedDeployment(config, 'campaign', receipt, store, () => false, async () => 'ROLLBACK_COMPLETE');
    expect(store.replace).toHaveBeenCalledOnce();
  });
  it('refuses running, foreign, production, unsettled and changed claims', async () => {
    const store = fixture();
    for (const candidate of [{ ...receipt, benchmarkOwner: 'other' }, { ...receipt, account: '000000000000' }, { ...receipt, kind: 'stop' }]) {
      await expect(handoffInterruptedDeployment(config, 'campaign', candidate, store, () => false, async () => undefined)).rejects.toThrow();
    }
    await expect(handoffInterruptedDeployment(getDeployment('stockholm-ecs'), 'campaign', receipt, store, () => false, async () => undefined)).rejects.toThrow();
    await expect(handoffInterruptedDeployment(config, 'campaign', receipt, store, () => true, async () => undefined)).rejects.toThrow();
    await expect(handoffInterruptedDeployment(config, 'campaign', receipt, store, () => false, async () => 'CREATE_IN_PROGRESS')).rejects.toThrow();
    await expect(handoffInterruptedDeployment(config, 'campaign', { ...receipt, owner: 'other' }, store, () => false, async () => undefined)).rejects.toThrow();
    expect(store.replace).not.toHaveBeenCalled();
  });
});
