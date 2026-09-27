import { applicationArtifacts } from '../image-artifacts.js';
import { acceptsBootstrapRecovery, bootstrapRecoveryIssue } from '../bootstrap-recovery.js';
import { componentMatches, selectStackAction, type StackIntent, type StackObservation, type StackAction } from './stack-action.js';

export type Step = 'quiesce' | 'drain' | 'daemon-cold' | 'gateway-cold' | 'daemon' | 'reboot' | 'activate' | 'daemon-ready' | 'gateway' | 'restore' | 'verify';
type ActiveAction = Extract<StackAction, { kind: 'gateway' | 'daemon' | 'reboot' }>;
export interface ActionObservation extends StackObservation {
  host?: NonNullable<StackObservation['host']> & { agentConnected: boolean; registration: 'ACTIVE' | 'DRAINING' };
  gateway?: NonNullable<StackObservation['gateway']> & { tasks: string[]; deployments: string[]; failedDeployments?: string[]; latestFailureAt?: number };
  daemon?: NonNullable<StackObservation['daemon']> & { tasks: string[]; deployments: string[]; failedDeployments?: string[]; latestFailureAt?: number };
}
export interface StackAttempt {
  release: string; version: number; intent: StackIntent; action: ActiveAction;
  host: string; bootId: string; gatewayDeployments: string[]; daemonDeployments: string[];
  steps: Step[]; index: number; state: 'planned' | 'waiting' | 'completed' | 'paused' | 'cancelled';
  stepStarted: number; reason?: string;
  sourceOsVersion?: string;
  rebootAcknowledged?: boolean;
  recovery?: { issue: string; requestedAt: number; acknowledged: boolean; recoveredAt?: number };
}
export interface StackPorts {
  now(): number;
  observe(): Promise<ActionObservation>;
  stillReady(release: string): Promise<boolean>;
  save(next: StackAttempt, previous?: StackAttempt): Promise<boolean>;
  request(step: Exclude<Step, 'verify' | 'daemon-ready'>, host: string): Promise<void>;
  alert(key: string, reason: string): Promise<void>;
}

export function actionSteps(action: ActiveAction): Step[] {
  // One strongest action covers a combined change. A reboot restores the gateway only once after daemon readiness.
  if (action.kind === 'gateway') return ['gateway', 'verify'];
  if (action.kind === 'daemon') return ['daemon', ...(action.refreshGateway ? ['gateway' as const] : []), 'verify'];
  return ['quiesce', 'drain', ...(action.refreshDaemon ? ['daemon-cold' as const] : []),
    ...(action.refreshGateway ? ['gateway-cold' as const] : []), 'reboot', 'activate', 'daemon-ready', 'restore', 'verify'];
}

function daemonReady(intent: StackIntent, actual: ActionObservation): boolean {
  // Health alone cannot attest which mutable tag ECS resolved.
  return !!actual.daemon?.stable && actual.daemon.tasks.length === 1
    && componentMatches(intent.components['network-daemon'], actual.daemon.digest, actual.resolvedDigests);
}
function gatewayReady(intent: StackIntent, actual: ActionObservation): boolean {
  // Compare every initializer/engine descriptor as one application release.
  return !!actual.gateway?.stable && actual.gateway.desired === 1 && actual.gateway.tasks.length === 1
    && applicationArtifacts.every(name => componentMatches(intent.components[name], actual.gateway!.images[name], actual.resolvedDigests));
}
function bootReady(intent: StackIntent, actual: ActionObservation): boolean {
  // A prior successful bootstrap record is stale after a new kernel boot.
  const host = actual.host;
  return !!host?.bootId && actual.bootstrap?.bootId === host.bootId && host.state === 'running'
    && host.agentConnected && componentMatches(intent.components.bootstrap, actual.bootstrap.digest, actual.resolvedDigests)
    && host.variant === intent.os.variant && host.architecture === intent.os.architecture
    && !!host.version && intent.os.compatibleVersions.includes(host.version);
}
function observed(step: Step, attempt: StackAttempt, actual: ActionObservation): boolean {
  // Service counts alone do not prove termination. Adapters include pending/stopping tasks until they really stop.
  const newDaemon = actual.daemon?.deployments.some(id => !attempt.daemonDeployments.includes(id));
  switch (step) {
    case 'quiesce': return actual.gateway?.desired === 0 && actual.gateway.tasks.length === 0;
    case 'drain': return actual.host?.registration === 'DRAINING' && actual.daemon?.tasks.length === 0;
    case 'daemon-cold': return !!newDaemon && actual.daemon?.tasks.length === 0;
    case 'gateway-cold': return !!actual.gateway?.deployments.some(id => !attempt.gatewayDeployments.includes(id))
      && actual.gateway.desired === 0 && actual.gateway.tasks.length === 0;
    case 'daemon': return !!newDaemon && daemonReady(attempt.intent, actual);
    case 'reboot': return actual.host?.bootId !== attempt.bootId && bootReady(attempt.intent, actual);
    case 'activate': return actual.host?.agentConnected === true && actual.host.registration === 'ACTIVE';
    case 'daemon-ready': return daemonReady(attempt.intent, actual);
    case 'gateway': return gatewayReady(attempt.intent, actual)
      && !!actual.gateway?.deployments.some(id => !attempt.gatewayDeployments.includes(id));
    case 'restore': return gatewayReady(attempt.intent, actual);
    case 'verify': return bootReady(attempt.intent, actual) && daemonReady(attempt.intent, actual) && gatewayReady(attempt.intent, actual);
  }
}

export async function reconcileStack(ports: StackPorts, desired: { release: string; intent: StackIntent }, previous?: StackAttempt): Promise<StackAttempt | StackAction> {
  let attempt = previous;
  // The caller holds the shared lifecycle claim for the whole action, not merely this invocation.
  const actual = await ports.observe();
  const replaceClosed = attempt && (attempt.state === 'cancelled'
    || (['completed', 'paused'].includes(attempt.state) && attempt.release !== desired.release));
  if (!attempt || replaceClosed) {
    const action = selectStackAction(desired.intent, actual);
    if (['none', 'deferred', 'blocked'].includes(action.kind)) return action;
    attempt = { release: desired.release, intent: desired.intent, action: action as ActiveAction,
      version: (previous?.version ?? 0) + 1, host: actual.host!.id, bootId: actual.host!.bootId!,
      gatewayDeployments: actual.gateway!.deployments, daemonDeployments: actual.daemon!.deployments,
      steps: actionSteps(action as ActiveAction), index: 0, state: 'planned', stepStarted: ports.now() };
    attempt.sourceOsVersion = actual.host!.version;
    // New release notifications and explicit retries cannot replenish an unresolved incident's budget.
    if (previous?.host === attempt.host && previous.recovery && !previous.recovery.recoveredAt) attempt.recovery = previous.recovery;
    if (!await ports.save(attempt, previous)) throw new Error('A regional action already exists.');
  }
  if (['completed', 'paused'].includes(attempt.state)) {
    // Completion never grants permission to replay a release after unrelated runtime drift.
    if (attempt.state === 'completed' && !['none', 'deferred'].includes(selectStackAction(desired.intent, actual).kind)) {
      await ports.alert(`${attempt.release}/drift`, 'Observed runtime differs from a completed release. Inspect before an explicit correction.');
    }
    return attempt;
  }
  const update = async (patch: Partial<StackAttempt>) => {
    const next = { ...attempt!, ...patch, version: attempt!.version + 1 };
    if (!await ports.save(next, attempt)) throw new Error('Regional action changed concurrently.');
    attempt = next;
  };
  const pause = async (reason: string) => {
    await update({ state: 'paused', reason });
    await ports.alert(`${attempt!.release}/${attempt!.index}/paused`, reason);
    return attempt!;
  };
  if (actual.mode !== 'active' || actual.host?.id !== attempt.host) {
    return pause('Regional power intent or exact host ownership changed. No further release action was requested.');
  }
  const step = attempt.steps[attempt.index]!;
  if (attempt.state === 'waiting' || step === 'verify' || step === 'daemon-ready') {
    // Native ECS rollback remains authoritative; never turn a failed new deployment into an autonomous retry.
    const application = ['gateway', 'gateway-cold', 'restore'].includes(step);
    const failures = application ? actual.gateway?.failedDeployments : actual.daemon?.failedDeployments;
    const baseline = application ? attempt.gatewayDeployments : attempt.daemonDeployments;
    if (['gateway', 'gateway-cold', 'restore', 'daemon', 'daemon-cold', 'daemon-ready'].includes(step)
      && failures?.some(id => !baseline.includes(id))) return pause(`ECS failed or rolled back ${step}; inspect before an explicit correction.`);
    // Observe before considering timeouts: a missed notification must not turn completed work into a retry.
    if (observed(step, attempt, actual)) {
      const index = attempt.index + 1;
      await update({ index, state: index === attempt.steps.length ? 'completed' : 'planned', stepStarted: ports.now(), reason: undefined });
      if (attempt.state === 'completed' && attempt.recovery && !attempt.recovery.recoveredAt) {
        await update({ recovery: { ...attempt.recovery, recoveredAt: ports.now() } });
        await ports.alert(`${attempt.release}/recovered`, 'The controlled bootstrap recovery completed; all release components are verified.');
      }
      return attempt;
    }
    if (ports.now() - attempt.stepStarted > 15 * 60_000) {
      // Only a known, acknowledged release reboot with still-drained workloads may retry once.
      // Missing SSM observations while ECS is connected, task failures and unexpected reboots are ineligible.
      const recoverable = step === 'reboot' && attempt.rebootAcknowledged && !attempt.recovery
        && attempt.intent.os.knownLimitations?.includes(bootstrapRecoveryIssue)
        && acceptsBootstrapRecovery(attempt.sourceOsVersion) && attempt.intent.os.compatibleVersions.includes(attempt.sourceOsVersion!)
        && actual.host?.state === 'running' && actual.host.agentConnected === false && actual.host.registration === 'DRAINING'
        && actual.gateway?.desired === 0 && actual.gateway.tasks.length === 0 && actual.daemon?.tasks.length === 0;
      if (!recoverable) return pause(`Timed out observing ${step}; inspect before an explicit retry. No additional recovery is authorized.`);
      if (!await ports.stillReady(attempt.release)) return pause('Release availability changed before bootstrap recovery; inspect before retrying.');
      // Persist consumption before the effect. A crash or lost acknowledgement cannot grant a second retry.
      await update({ recovery: { issue: bootstrapRecoveryIssue, requestedAt: ports.now(), acknowledged: false }, stepStarted: ports.now() });
      await ports.alert(`${attempt.release}/recovery`, 'Controlled bootstrap startup timed out; attempting the one temporary recovery reboot for core-kit #1059.');
      try {
        await ports.request('reboot', attempt.host);
        await update({ recovery: { ...attempt.recovery!, acknowledged: true } });
      } catch {
        return pause('Bootstrap recovery acknowledgement is uncertain. The recovery allowance is consumed; inspect before any further reboot.');
      }
      return attempt;
    }
    return attempt;
  }
  if (!await ports.stillReady(attempt.release)) return pause('The coherent local release or production aliases changed before an intentional action.');
  // Persist before every effect. A process dying here leaves an uncertain request, never authority to blindly repeat it.
  await update({ state: 'waiting', stepStarted: ports.now(), ...(step === 'reboot' ? { rebootAcknowledged: false } : {}) });
  try {
    await ports.request(step, attempt!.host);
    if (step === 'reboot') await update({ rebootAcknowledged: true });
  }
  catch {
    await update({ reason: `The ${step} request acknowledgement is uncertain; observe without repeating it.` });
    await ports.alert(`${attempt!.release}/${attempt!.index}/uncertain`, attempt!.reason!);
  }
  return attempt!;
}
