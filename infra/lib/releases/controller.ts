import { readiness } from './gate.js';
import type { Registry } from './registry.js';
import { reconcileStack, type StackAttempt, type StackPorts } from './stack-reconcile.js';

export interface ControllerPorts extends StackPorts {
  registry: Registry;
  refresh(): Promise<'ready' | 'pending'>;
  attempt(): Promise<StackAttempt | undefined>;
  record<T>(id: string): Promise<T | undefined>;
  put(id: string, record: unknown): Promise<void>;
  progress(enabled: boolean): Promise<void>;
}

export async function reconcileController(ports: ControllerPorts, retry = false): Promise<string> {
  let attempt = await ports.attempt();
  const active = attempt && ['planned', 'waiting'].includes(attempt.state);
  // Observation is asynchronous. A pending/failed read must not replay a previously issued lifecycle effect.
  if (await ports.refresh() === 'pending') {
    const pending = await ports.record<{ since: number }>('observation/pending');
    const since = pending?.since || ports.now();
    if (!pending?.since) await ports.put('observation/pending', { since });
    if (ports.now() - (active ? Math.min(since, attempt!.stepStarted) : since) > 15 * 60_000) {
      if (active && !await ports.save({ ...attempt!, version: attempt!.version + 1, state: 'paused',
        reason: 'Host observation timed out; inspect the unfinished action before retrying.' }, attempt)) throw new Error('Concurrent action change.');
      await ports.alert('observation-timeout', 'Host observation timed out. No further lifecycle action was requested.');
      await ports.progress(false);
      return 'paused-observation';
    }
    await ports.progress(true);
    return 'observation-pending';
  }
  await ports.put('observation/pending', { since: 0 });
  if (retry && active) throw new Error('An action is still in progress; inspect it before retrying.');
  if (retry && attempt) {
    // Explicit retries may replace a closed attempt, but never erase its uncertain in-flight effects.
    const cancelled = { ...attempt, version: attempt.version + 1, state: 'cancelled' as const };
    if (!await ports.save(cancelled, attempt)) throw new Error('Concurrent action change.');
    attempt = cancelled;
  }
  const ready = await readiness(ports.registry);
  if (!active && !ready.ready) {
    await ports.alert(`incomplete/${ready.current?.digest ?? 'missing'}`, `No intentional promotion: ${ready.reason}`);
    await ports.progress(false);
    return 'waiting-for-release';
  }
  // An in-flight action retains its recorded intent even if newer/out-of-order events arrive.
  // The core observes issued effects and rechecks the current aliases before each new effect.
  const desired = active ? { release: attempt!.release, intent: attempt!.intent }
    : { release: ready.current!.digest, intent: { components: ready.current!.release.images, os: ready.current!.release.os } };
  if (!active && !retry) {
    // A CloudFormation/operator rollout can fail before the controller creates an attempt. Respect native rollback too.
    const actual = await ports.observe();
    if ([actual.gateway?.latestFailureAt, actual.daemon?.latestFailureAt].some(at => at !== undefined
      && at >= Date.parse(ready.current!.release.promotedAt))) {
      await ports.alert(`external-failure/${desired.release}`, 'A newer external ECS deployment failed or rolled back; inspect before an explicit retry.');
      await ports.progress(false);
      return 'paused-external-failure';
    }
  }
  const result = await reconcileStack(ports, desired, attempt);
  if ('kind' in result) {
    if (result.kind === 'blocked') await ports.alert(`blocked/${desired.release}`, result.reason);
    await ports.progress(false);
    return result.kind === 'none' ? 'already-running' : result.kind;
  }
  const pending = ['planned', 'waiting'].includes(result.state);
  await ports.progress(pending);
  return pending ? 'action-in-progress' : result.state;
}
