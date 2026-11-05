import type { LifecycleState } from './lifecycle.js';
import type { RolloutPhase } from './blue-green.js';

export type ReleaseAutomationMode = 'active' | 'manual' | 'held';

export function dnsPublicationControllerMode(modes: ReleaseAutomationMode[]): 'active' | 'manual' {
  // Migration holds every region; routine publication resumes only after every controller is active.
  if (modes.length && modes.every(mode => mode === 'manual')) return 'manual';
  if (modes.length && modes.every(mode => mode === 'active')) return 'active';
  throw new Error('DNS publication requires every maintained controller in the same active or manual mode.');
}

export function allowedReleaseMode(globalAutomation: boolean, requested: ReleaseAutomationMode): ReleaseAutomationMode {
  // A global publication hold still permits an explicit, claimed regional rollout; it never enables event selection.
  return globalAutomation ? requested : requested === 'manual' ? 'manual' : 'held';
}

export function releaseAutomationMode(automation: string | undefined, operatorOnly?: string): ReleaseAutomationMode {
  // Retain the installed enabled/disabled contract; manual continuation is a separate guarded setting.
  if (operatorOnly !== undefined && operatorOnly !== 'enabled' && operatorOnly !== 'disabled') {
    throw new Error('Invalid regional release automation mode.');
  }
  if (automation === 'enabled' && operatorOnly !== 'enabled') return 'active';
  if (automation === 'disabled' && operatorOnly === 'enabled') return 'manual';
  if (automation === 'disabled' && operatorOnly !== 'enabled') return 'held';
  throw new Error('Invalid regional release automation mode.');
}

export function mayReconcileRelease(mode: ReleaseAutomationMode, hook: boolean,
  state?: LifecycleState, phase?: RolloutPhase, action?: string): boolean {
  // A stale handoff claim must not select a new release after the prior rollout closes.
  if (mode === 'active' || hook) return true;
  if (mode === 'held') return false;
  if (action === 'cleanup-failed' && phase === 'held') return true;
  if (action === 'retry' && phase === 'cleaned') return true;
  if (!phase || ['complete', 'held', 'cleaned', 'retired'].includes(phase)
    || state?.operation?.owner !== 'regional-release-controller') return false;
  // Cleanup claims may finish retirement only; they cannot authorize an unrelated new green selection.
  return state.operation.kind === 'release'
    || state.operation.kind === 'release-cleanup'
      && ['drain', 'remove-host', 'unwire', 'remove-network', 'release-addresses'].includes(phase);
}
