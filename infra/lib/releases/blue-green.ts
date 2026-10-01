import type { HostSlot } from '../host-slot-model.js';
import type { LifecycleMode } from './lifecycle.js';
import type { Release } from './model.js';
import { trafficDestination, validateDeploymentHook, type DeploymentIdentity, type DeploymentHook } from './deployment-hook.js';
import { nextAssociationChange, productionOn, type AddressObservation, type HandoffAddresses, type AssociationChange } from './eip-handoff.js';

export type RolloutPhase = 'network' | 'addresses' | 'wire' | 'host' | 'daemon' | 'placement' | 'force'
  | 'deployment' | 'drain' | 'remove-host' | 'unwire' | 'remove-network' | 'release-addresses' | 'complete' | 'held' | 'cleaned' | 'retired';
export interface Generation {
  slot: HostSlot; stack: string; instance: string; interface: string; boot: string;
  revision: string; images: Record<string, string>; os: string; template?: string;
}
export interface Rollout {
  schema: 1; id: string; version: number; release: string; intent: Release; template: string;
  source: Generation; green: HostSlot; phase: RolloutPhase; phaseStarted: number; started: number;
  effectIssued?: number; deployment?: DeploymentIdentity; addresses?: HandoffAddresses;
  direction?: 'blue' | 'green'; handoffStarted?: number; rollbackRequested?: number;
  retiring?: HostSlot; failure?: string; healthFailures?: number; healthObservedAt?: number;
}
export interface RolloutObservation {
  mode: LifecycleMode;
  aliasesReady: boolean;
  networkReady: boolean;
  addressesReady: boolean;
  wired: boolean;
  hostCreated: boolean;
  daemonReady: boolean;
  placementReady: boolean;
  greenReady: boolean;
  sourceHealthy: boolean;
  sourceStopped?: boolean;
  greenFailure: boolean;
  sourceFailure?: string;
  deployment?: DeploymentIdentity & { status: string; stage?: string };
  addresses?: HandoffAddresses;
  bindings?: AddressObservation;
  retiredTasksStopped: boolean;
  retiredHostAbsent: boolean;
  retiredAddressesDetached: boolean;
  retiredNetworkAbsent: boolean;
  temporaryAddressesAbsent: boolean;
}
export type RolloutEffect =
  | { kind: 'network' | 'addresses' | 'wire' | 'host' | 'placement' | 'restore-placement' | 'force' | 'rollback' | 'drain' | 'remove-host' | 'unwire' | 'remove-network' | 'release-addresses' }
  | { kind: 'associate'; change: Exclude<AssociationChange, { kind: 'complete' }> };
export interface RolloutPorts {
  now(): number;
  observe(rollout: Rollout): Promise<RolloutObservation>;
  save(next: Rollout, previous: Rollout): Promise<void>;
  effect(effect: RolloutEffect, rollout: Rollout): Promise<void>;
  alert(key: string, message: string): Promise<void>;
}
export interface RolloutResult { rollout: Rollout; hookStatus?: 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED'; pending: boolean }
const closed = new Set<RolloutPhase>(['complete', 'held', 'cleaned', 'retired']);

export async function advanceRollout(ports: RolloutPorts, initial: Rollout, hook?: DeploymentHook, cleanup = false): Promise<RolloutResult> {
  let rollout = initial;
  const observed = await ports.observe(rollout);
  const save = async (patch: Partial<Rollout>) => {
    // The lifecycle claim excludes CLI writers; version CAS also rejects stale callbacks/observations.
    const next = { ...rollout, ...patch, version: rollout.version + 1 };
    await ports.save(next, rollout); rollout = next;
  };
  const result = (hookStatus?: RolloutResult['hookStatus']): RolloutResult => ({ rollout, hookStatus, pending: !closed.has(rollout.phase) });
  const phase = async (next: RolloutPhase) => save({ phase: next, phaseStarted: ports.now(), effectIssued: undefined });
  const hold = async (reason: string) => {
    await save({ phase: 'held', failure: reason });
    await ports.alert(`${rollout.id}/held`, `${reason} Green is retained for explicit cleanup; compute, disks and temporary addresses may still be billed.`);
    return result(hook ? 'IN_PROGRESS' : undefined);
  };
  const effect = async (kind: RolloutEffect['kind']) => {
    if (kind === 'associate') throw new Error('An address effect requires its exact observed binding.');
    // Force has no client token. Once journaled, observe its deployment identity instead of replaying an uncertain request.
    if (kind === 'force' && rollout.effectIssued !== undefined) return;
    if (rollout.effectIssued === undefined) await save({ effectIssued: ports.now() });
    await ports.effect({ kind }, rollout);
  };

  const stoppedCleanup = observed.mode === 'stopped' && !hook
    && (cleanup && rollout.phase === 'held' || rollout.retiring === rollout.green && ['drain', 'remove-host', 'unwire', 'remove-network', 'release-addresses'].includes(rollout.phase));
  if (observed.mode !== 'active' && !stoppedCleanup) return result(hook ? 'IN_PROGRESS' : undefined);
  if (hook && rollout.deployment) validateDeploymentHook(hook, rollout.deployment);
  // A safety hold blocks forward progress, but must not deadlock ECS's already-started return to verified blue.
  const returning = hook?.lifecycleStage === 'PRODUCTION_TRAFFIC_SHIFT' && rollout.deployment
    && trafficDestination(hook, rollout.deployment) === 'blue';
  if (rollout.phase === 'held') {
    if (!cleanup && !returning) {
      await ports.alert(`${rollout.id}/cost/${Math.floor(ports.now() / 86_400_000)}`, 'A failed green generation remains held. Use release cleanup-failed after diagnosis; subsequent rollouts remain blocked.');
      return result(hook ? 'IN_PROGRESS' : undefined);
    }
    // An explicit cleanup may remove failed green only after ECS and both public addresses have returned to blue.
    if (cleanup) {
      if (rollout.deployment && !(observed.deployment?.status === 'ROLLBACK_SUCCESSFUL'
        || stoppedCleanup && ['STOPPED', 'ROLLBACK_FAILED'].includes(observed.deployment?.status ?? ''))) throw new Error('Native rollback must complete before failed-generation cleanup.');
      if (stoppedCleanup ? !observed.sourceStopped : !observed.sourceHealthy) throw new Error('Verify blue health or explicit stopped state before failed-generation cleanup.');
      if ((rollout.addresses || observed.addresses) && (!observed.bindings
        || !productionOn((rollout.addresses ?? observed.addresses)!, observed.bindings, 'blue'))) {
        throw new Error('Restore both production addresses before failed-generation cleanup.');
      }
      if (!stoppedCleanup) await ports.effect({ kind: 'restore-placement' }, rollout);
      await save({ retiring: rollout.green }); await phase('drain'); return result();
    }
  }
  if (closed.has(rollout.phase) && !returning) return result(hook ? 'SUCCEEDED' : undefined);

  if (rollout.phase === 'force' && observed.deployment) {
    await save({ deployment: observed.deployment }); await phase('deployment');
  }
  if (hook) {
    if (!rollout.deployment) return result('IN_PROGRESS');
    validateDeploymentHook(hook, rollout.deployment);
    if (hook.lifecycleStage !== 'PRODUCTION_TRAFFIC_SHIFT' && ports.now() - rollout.phaseStarted > 1_800_000) {
      if (!observed.sourceHealthy) return hold('Green readiness timed out and blue health is unknown; inspect before failback.');
      if (!rollout.rollbackRequested) await save({ rollbackRequested: ports.now(), failure: 'Green readiness deadline expired.' });
      return result('FAILED');
    }
    if (hook.lifecycleStage === 'PRODUCTION_TRAFFIC_SHIFT') {
      const destination = trafficDestination(hook, rollout.deployment);
      if (destination === 'green' && (rollout.direction === 'blue' || rollout.rollbackRequested)) return result('FAILED');
      if (!observed.addresses || !observed.bindings) return result('IN_PROGRESS');
      if (rollout.direction !== destination) {
        // Gate once before changing addresses. Then finish restoring management reachability even while SSM reconnects.
        if (destination === 'green' ? !observed.greenReady || !observed.aliasesReady : !observed.sourceHealthy) return result('IN_PROGRESS');
        await save({ direction: destination, handoffStarted: ports.now(), addresses: observed.addresses });
      }
      const next = nextAssociationChange(rollout.addresses!, observed.bindings, destination);
      if (next.kind === 'complete') {
        if (destination === 'blue') await ports.effect({ kind: 'restore-placement' }, rollout);
        return result('SUCCEEDED');
      }
      if (ports.now() - rollout.handoffStarted! > 300_000) {
        if (destination === 'blue') return hold('Return-to-blue address handoff timed out; inspect exact bindings before any further action.');
        if (!rollout.rollbackRequested) {
          await save({ rollbackRequested: ports.now(), failure: 'Forward address handoff timed out.' });
          await ports.effect({ kind: 'rollback' }, rollout);
        }
        return result('FAILED');
      }
      // The exact mutation is derivable from the durable handoff plus live readback; lost acknowledgements do not repeat completed swaps.
      await ports.effect({ kind: 'associate', change: next }, rollout);
      return result('IN_PROGRESS');
    }
    if (hook.lifecycleStage === 'PRE_SCALE_UP') return result(observed.daemonReady && observed.aliasesReady ? 'SUCCEEDED' : 'IN_PROGRESS');
    if (hook.lifecycleStage === 'POST_SCALE_UP') return result(observed.greenReady && observed.aliasesReady ? 'SUCCEEDED' : 'IN_PROGRESS');
    return result(observed.greenReady ? 'SUCCEEDED' : 'IN_PROGRESS');
  }

  if (rollout.phase === 'deployment') {
    const deployment = observed.deployment;
    if (!deployment || deployment.deployment !== rollout.deployment?.deployment) return hold('Native deployment identity changed or is unreadable.');
    if (deployment.status === 'ROLLBACK_SUCCESSFUL') return hold(rollout.failure ?? 'ECS rolled back the release.');
    if (/FAILED|STOPPED/.test(deployment.status)) return hold('ECS ended without a verified successful deployment or rollback.');
    if (deployment.status === 'SUCCESSFUL') {
      if (!observed.greenReady || !observed.bindings || !rollout.addresses
        || nextAssociationChange(rollout.addresses, observed.bindings, 'green').kind !== 'complete') return hold('Completed ECS deployment lacks verified green runtime/address identity.');
      await save({ retiring: rollout.source.slot }); await phase('drain'); return result();
    }
    if (rollout.rollbackRequested && ports.now() - rollout.rollbackRequested > 1_800_000) {
      return hold('Native rollback did not finish within its bounded deadline; do not repeat the request.');
    }
    // Unknown observations do not invent a failure. Two verified failures avoid rolling back on a single transient sample.
    let failures = rollout.healthFailures ?? 0;
    if (rollout.healthObservedAt === undefined || ports.now() - rollout.healthObservedAt >= 15_000) {
      failures = observed.greenFailure ? failures + 1 : 0;
      await save({ healthFailures: failures, healthObservedAt: ports.now() });
    }
    if (failures >= 2 || ports.now() - rollout.phaseStarted > 1_800_000) {
      if (!observed.sourceHealthy) return hold('Green failed or timed out, but blue is not verified healthy; automatic failback is withheld.');
      if (!rollout.rollbackRequested) {
        await save({ rollbackRequested: ports.now(), failure: 'Green failed post-cutover observation or the deployment deadline.' });
        await ports.effect({ kind: 'rollback' }, rollout);
      }
    }
    return result();
  }

  if (ports.now() - rollout.phaseStarted > 1_800_000) return hold(`Regional ${rollout.phase} deadline expired; no automatic destructive retry.`);
  if (['network', 'addresses', 'wire', 'host', 'daemon', 'placement', 'force'].includes(rollout.phase)
    && (!observed.aliasesReady || observed.sourceFailure)) return hold(observed.sourceFailure ?? 'Production aliases changed before the selected release launched; retain intent for inspection.');
  // Each external step is observed before another one starts; CloudFormation effects use the same deterministic client token on retry.
  switch (rollout.phase) {
    case 'network': if (observed.networkReady) await phase('addresses'); else await effect('network'); break;
    case 'addresses': if (observed.addressesReady) await phase('wire'); else await effect('addresses'); break;
    case 'wire': if (observed.wired) await phase('host'); else await effect('wire'); break;
    case 'host': if (observed.hostCreated) await phase('daemon'); else await effect('host'); break;
    case 'daemon': if (observed.daemonReady) await phase('placement'); break;
    case 'placement': if (observed.placementReady) await phase('force'); else await effect('placement'); break;
    case 'force': await effect('force'); break;
    case 'drain': if (observed.retiredTasksStopped) await phase('remove-host'); else await effect('drain'); break;
    case 'remove-host': if (observed.retiredHostAbsent) await phase('unwire'); else await effect('remove-host'); break;
    case 'unwire': if (observed.retiredAddressesDetached) await phase('remove-network'); else await effect('unwire'); break;
    case 'remove-network': if (observed.retiredNetworkAbsent) await phase('release-addresses'); else await effect('remove-network'); break;
    case 'release-addresses':
      if (observed.temporaryAddressesAbsent) await phase(rollout.retiring === rollout.green ? 'cleaned' : 'complete');
      else await effect('release-addresses');
      break;
  }
  return result();
}
