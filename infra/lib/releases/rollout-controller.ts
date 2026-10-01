import { createHash } from 'node:crypto';
import { advanceRollout, type Generation, type Rollout, type RolloutPorts } from './blue-green.js';
import type { Registry } from './registry.js';
import { readiness } from './gate.js';
import { artifacts } from './model.js';
import { componentMatches } from './runtime-identity.js';
import type { DeploymentHook } from './deployment-hook.js';

export interface BlueGreenPorts extends RolloutPorts {
  registry: Registry;
  template: string;
  record<T>(id: string): Promise<T | undefined>;
  put(id: string, value: unknown): Promise<void>;
  replace<T extends { version: number }>(id: string, next: T, previous?: T): Promise<boolean>;
  generation(): Promise<Generation | undefined>;
  progress(enabled: boolean): Promise<void>;
}
export interface ControllerResult { status: string; hookStatus?: 'SUCCEEDED' | 'FAILED' | 'IN_PROGRESS' }
export async function reconcileRollout(ports: BlueGreenPorts, action?: 'retry' | 'cleanup-failed' | 'prepare', hook?: DeploymentHook): Promise<ControllerResult> {
  let current = await ports.record<Rollout>('rollout/current');
  if (hook || current && !['complete', 'cleaned', 'retired'].includes(current.phase)) {
    if (!current) throw new Error('Native deployment has no recorded regional intent; do not move production addresses.');
    if (action === 'retry') throw new Error('Inspect and clean the held generation before retrying.');
    const result = await advanceRollout(ports, current, hook, action === 'cleanup-failed');
    await ports.progress(result.pending);
    return { status: result.pending ? 'action-in-progress' : result.rollout.phase, hookStatus: result.hookStatus };
  }
  if (action === 'cleanup-failed') return { status: 'nothing-to-clean' };
  if (current?.phase === 'cleaned' && action !== 'retry' && action !== 'prepare') {
    // Cleanup is not authorization to silently retry the same failed intent on the next hourly wakeup.
    await ports.progress(false); return { status: 'retry-required' };
  }
  const ready = await readiness(ports.registry);
  if (!ready.ready || !ready.current?.release.os.targetVersion) {
    await ports.alert(`incomplete/${ready.current?.digest ?? 'missing'}`, `Intentional rollout waits for a complete qualified release: ${ready.reason ?? 'missing target OS'}`);
    await ports.progress(false); return { status: 'waiting-for-release' };
  }
  const source = await ports.generation();
  if (!source) {
    const previous = await ports.record<{ since: number }>('generation/pending');
    const since = previous?.since || ports.now();
    if (!previous?.since) await ports.put('generation/pending', { since });
    if (ports.now() - since > 900_000) {
      await ports.alert('generation-observation', 'No fresh complete source generation is available; no host or address action was requested.');
      await ports.progress(false); return { status: 'paused-observation' };
    }
    await ports.progress(true); return { status: 'observation-pending' };
  }
  await ports.put('generation/pending', { since: 0 });
  const intent = ready.current.release;
  if (action !== 'prepare' && source.os === intent.os.targetVersion && source.template === ports.template
    && artifacts.every(name => componentMatches(intent.images[name], source.images[name]))) {
    await ports.progress(false); return { status: 'already-running' };
  }
  const time = ports.now();
  // One durable identity owns the entire overlap. A restart resumes this record instead of allocating another green host.
  const id = createHash('sha256').update(JSON.stringify([ready.current.digest, ports.template, source.instance, time])).digest('hex');
  const next: Rollout = { schema: 1, id, version: (current?.version ?? 0) + 1, release: ready.current.digest, intent, template: ports.template,
    source, green: source.slot === 'a' ? 'b' : 'a', phase: 'network', phaseStarted: time, started: time };
  if (!await ports.replace('rollout/current', next, current)) throw new Error('Concurrent regional rollout selection.');
  await ports.progress(true);
  return { status: 'action-in-progress' };
}
