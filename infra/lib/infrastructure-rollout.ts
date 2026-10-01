import { advanceRollout, type Rollout } from './releases/blue-green.js';
import { reconcileRollout } from './releases/rollout-controller.js';
import type { BlueGreenPorts } from './releases/rollout-controller.js';
import type { LifecycleControl } from './lifecycle-operator.js';
import { isDeepStrictEqual } from 'node:util';

interface InfrastructureTemplate {
  Resources: Record<string, { Type?: string; Properties?: unknown; Metadata?: unknown; [key: string]: unknown }>;
  Conditions?: unknown;
  Parameters?: unknown;
}
export function deploymentChanges(before: InfrastructureTemplate, after: InfrastructureTemplate): 'task' | 'infrastructure' | 'none' {
  // CDK CLI adds path/analytics metadata that offline synthesis lacks. It cannot launch an ECS revision.
  if (!isDeepStrictEqual(before.Resources.GatewayTask?.Properties, after.Resources.GatewayTask?.Properties)) return 'task';
  const resources = (template: InfrastructureTemplate) => Object.fromEntries(Object.entries(template.Resources)
    .filter(([, resource]) => resource.Type !== 'AWS::CDK::Metadata')
    .map(([name, { Metadata: _metadata, ...resource }]) => [name, resource]));
  return isDeepStrictEqual(resources(before), resources(after)) && isDeepStrictEqual(before.Conditions, after.Conditions)
    && isDeepStrictEqual(before.Parameters, after.Parameters) ? 'none' : 'infrastructure';
}

export async function deployWithGreen(gate: BlueGreenPorts, control: LifecycleControl, changes: 'task' | 'infrastructure' | 'none',
  deploy: () => Promise<void>, wake: () => Promise<void>, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<void> {
  // A prepared host precedes any CDK change that can make ECS invoke a synchronous deployment hook.
  const existing = await gate.record<Rollout>('rollout/current');
  if (existing?.phase === 'held') throw new Error('Resolve the previous failed rollout before an infrastructure deployment.');
  if (!existing || ['complete', 'cleaned', 'retired'].includes(existing.phase)) {
    const selected = await reconcileRollout(gate, changes === 'none' && existing?.phase !== 'cleaned' ? undefined : 'prepare');
    if (selected.status === 'already-running') { await deploy(); return; }
  }
  let prepared: Rollout | undefined;
  for (let attempt = 0; attempt < 360; attempt++) {
    const current = await gate.record<Rollout>('rollout/current');
    if (current?.phase === 'force') { prepared = current; break; }
    if (current?.phase === 'held') {
      await control.handoff(); await wake();
      throw new Error('Green preparation is held for diagnosis; no shared-stack deployment was requested.');
    }
    if (current && current.phase !== 'complete') await advanceRollout(gate, current);
    else await reconcileRollout(gate, changes === 'none' ? undefined : 'prepare');
    await wait(5_000);
  }
  if (!prepared) throw new Error('Green preparation is unresolved; resume this infrastructure deployment.');
  if (changes === 'task') {
    // CDK's UpdateService is the one launch effect. Journal it before transferring the lock, so Lambda never also forces it.
    await gate.save({ ...prepared, version: prepared.version + 1, effectIssued: gate.now() }, prepared);
    await control.handoff();
    await deploy();
  } else {
    // A network/IAM-only update produces no service revision; complete it under the CLI lock, then let the controller force once.
    await deploy();
    await control.handoff();
  }
  await wake();
  for (let attempt = 0; attempt < 540; attempt++) {
    const current = await gate.record<Rollout>('rollout/current');
    if (current?.id !== prepared.id) throw new Error('Regional rollout identity changed while the CLI observed completion.');
    if (current.phase === 'complete') return;
    if (current.phase === 'held') throw new Error('The regional controller retained failed green for diagnosis; inspect release status and explicit cleanup.');
    await wait(5_000);
  }
  throw new Error('The regional rollout is still running; AWS retains lifecycle ownership. Inspect release status instead of starting another deployment.');
}
