import { expect, it } from 'vitest';
import { bootstrapRecoveryIssue } from '../lib/bootstrap-recovery.js';
import { imageArtifacts } from '../lib/image-artifacts.js';
import { actionSteps, reconcileStack, type ActionObservation, type StackAttempt, type StackPorts } from '../lib/releases/stack-reconcile.js';
import type { StackIntent } from '../lib/releases/stack-action.js';
function fixture(change: 'app' | 'daemon' | 'bootstrap' | 'all' = 'app') {
  const intent: StackIntent = { components: Object.fromEntries(imageArtifacts.map(n => [n, { digest: `${n}-new`, runtimeDigest: `${n}-child` }])) as StackIntent['components'],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'], knownLimitations: [bootstrapRecoveryIssue] } };
  const actual: ActionObservation = { mode: 'active',
    host: { id: 'host', state: 'running', bootId: 'boot-1', version: '1.65.0', variant: 'aws-ecs-3', architecture: 'arm64', agentConnected: true, registration: 'ACTIVE' },
    bootstrap: { digest: ['bootstrap','all'].includes(change) ? 'bootstrap-old' : 'bootstrap-new', bootId: 'boot-1' },
    daemon: { stable: true, digest: ['daemon','all'].includes(change) ? 'daemon-old' : 'network-daemon-new', tasks: ['daemon-task'], deployments: ['daemon-1'] },
    gateway: { desired: 1, stable: true, images: { xray: ['app','all'].includes(change) ? 'xray-old' : 'xray-new', awg: 'awg-new', 'gateway-config': 'gateway-config-new' },
      tasks: ['gateway-task'], deployments: ['gateway-1'] } };
  let saved: StackAttempt | undefined; let time = 0; let failRequest = false;
  const calls: string[] = [];
  const ports: StackPorts = { now: () => time, observe: async () => structuredClone(actual), stillReady: async () => true,
    save: async (next, before) => { expect(saved?.version).toBe(before?.version); saved = structuredClone(next); calls.push(`save:${next.state}`); return true; },
    request: async step => { calls.push(step); if (failRequest) throw Error('transport'); }, alert: async () => { calls.push('alert'); } };
  return { actual, ports, calls, intent, tick: (release = 'release-1') => reconcileStack(ports, { release, intent }, saved),
    saved: () => saved!, advance: () => { time += 16 * 60_000; }, fail: () => { failRequest = true; } };
}
it('persists before one application deployment and treats duplicate events as observation only', async () => {
  const f = fixture(); await f.tick(); expect(f.calls).toEqual(['save:planned','save:waiting','gateway']);
  await f.tick(); await f.tick(); expect(f.calls.filter(c => c === 'gateway')).toHaveLength(1);
  f.actual.gateway!.images.xray = 'xray-child'; f.actual.gateway!.deployments.push('gateway-2');
  await f.tick(); await f.tick(); expect(f.saved().state).toBe('completed');
  await f.tick(); expect(f.calls.filter(c => c === 'gateway')).toHaveLength(1);
});
it('refreshes only the daemon while keeping the gateway and host running', async () => {
  const f = fixture('daemon'); await f.tick();
  f.actual.daemon!.digest = 'network-daemon-new'; f.actual.daemon!.deployments.push('daemon-2');
  await f.tick(); await f.tick(); expect(f.saved().state).toBe('completed');
  expect(f.calls.filter(c => !c.startsWith('save:'))).toEqual(['daemon']);
});
it('orders a combined release through real task termination, one reboot and one gateway restoration', async () => {
  const f = fixture('all'); await f.tick();
  expect(f.saved().steps).toEqual(['quiesce','drain','daemon-cold','gateway-cold','reboot','activate','daemon-ready','restore','verify']);
  f.actual.gateway!.desired = 0; await f.tick(); expect(f.saved().index).toBe(0);
  f.actual.gateway!.tasks = []; await f.tick(); await f.tick(); expect(f.calls.at(-1)).toBe('drain');
  f.actual.host!.registration = 'DRAINING'; await f.tick(); expect(f.saved().index).toBe(1);
  f.actual.daemon!.tasks = []; await f.tick(); await f.tick(); expect(f.calls.at(-1)).toBe('daemon-cold');
  f.actual.daemon!.deployments.push('daemon-2'); await f.tick(); await f.tick(); expect(f.calls.at(-1)).toBe('gateway-cold');
  f.actual.gateway!.deployments.push('gateway-2'); await f.tick(); await f.tick(); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(1);
  f.actual.bootstrap!.digest = 'bootstrap-new'; await f.tick(); expect(f.saved().index).toBe(4);
  f.actual.host!.bootId = 'boot-2'; f.actual.bootstrap!.bootId = 'boot-2';
  await f.tick(); await f.tick(); expect(f.calls.at(-1)).toBe('activate');
  f.actual.host!.registration = 'ACTIVE'; await f.tick(); await f.tick(); expect(f.saved().steps[f.saved().index]).toBe('daemon-ready');
  f.actual.daemon!.tasks = ['daemon-new']; f.actual.daemon!.digest = 'network-daemon-new';
  await f.tick(); await f.tick(); expect(f.calls.at(-1)).toBe('restore');
  f.actual.gateway!.desired = 1; f.actual.gateway!.tasks = ['gateway-new']; f.actual.gateway!.images.xray = 'xray-new'; f.actual.gateway!.deployments.push('gateway-2');
  await f.tick(); await f.tick(); expect(f.saved().state).toBe('completed');
  expect(f.calls.filter(c => c === 'reboot')).toHaveLength(1);
  expect(f.calls.filter(c => c === 'gateway-cold')).toHaveLength(1); expect(f.calls).not.toContain('gateway');
});
it('observes an uncertain acknowledgement without reissuing and accepts late success', async () => {
  const f = fixture(); f.fail(); await f.tick(); expect(f.saved().reason).toContain('uncertain');
  await f.tick(); expect(f.calls.filter(c => c === 'gateway')).toHaveLength(1);
  f.actual.gateway!.images.xray = 'xray-new'; f.actual.gateway!.deployments.push('gateway-2');
  f.advance(); await f.tick(); await f.tick(); expect(f.saved().state).toBe('completed');
});
it('pauses an unobserved request after a bounded deadline without an automatic retry', async () => {
  const f = fixture(); await f.tick(); f.advance(); await f.tick(); await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.calls.filter(c => c === 'gateway')).toHaveLength(1);
});
it.each(['stopped','parked','destroying'] as const)('preserves %s state on arrival', async mode => {
  const f = fixture(); f.actual.mode = mode; expect(await f.tick()).toMatchObject({kind:'deferred'}); expect(f.calls).toEqual([]);
});
it('rejects changed aliases immediately before intentional mutation', async () => {
  const f = fixture(); f.ports.stillReady = async () => false; await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.calls).not.toContain('gateway');
});
it('refuses a replacement host while resuming an older action', async () => {
  const f = fixture('bootstrap'); await f.tick(); f.actual.host!.id = 'replacement'; await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.calls).not.toContain('reboot');
});
it('chooses the smallest ordered action for each change set', () => {
  expect(actionSteps({kind:'gateway'})).toEqual(['gateway','verify']);
  expect(actionSteps({kind:'daemon',refreshGateway:true})).toEqual(['daemon','gateway','verify']);
  expect(actionSteps({kind:'reboot',refreshDaemon:false,refreshGateway:false})).not.toContain('daemon-cold');
  expect(actionSteps({kind:'reboot',refreshDaemon:false,refreshGateway:false})).toContain('restore');
});

it('pauses on native ECS failure without changing aliases or attempting a fallback cascade', async () => {
  const f = fixture(); await f.tick();
  f.actual.gateway!.failedDeployments = ['gateway-2']; await f.tick(); await f.tick();
  expect(f.saved().state).toBe('paused');
  expect(f.saved().reason).toContain('rolled back');
  expect(f.calls.filter(c => c === 'gateway')).toHaveLength(1);
});
it('permits a distinct correction after a paused release while preserving versioned ownership', async () => {
  const f = fixture(); await f.tick(); f.advance(); await f.tick();
  const previous = f.saved().version;
  expect(f.saved().state).toBe('paused');
  await f.tick('release-2');
  expect(f.saved()).toMatchObject({release:'release-2',state:'waiting'});
  expect(f.saved().version).toBeGreaterThan(previous);
  expect(f.calls.filter(c => c === 'gateway')).toHaveLength(2);
});

// Advance through actual quiescence and draining before simulating a stalled controlled boot.
async function stalledBoot() {
  const f = fixture('bootstrap');
  await f.tick(); f.actual.gateway!.desired = 0; f.actual.gateway!.tasks = [];
  await f.tick(); await f.tick();
  f.actual.host!.registration = 'DRAINING'; f.actual.daemon!.tasks = [];
  await f.tick(); await f.tick();
  f.actual.host!.agentConnected = false;
  delete f.actual.host!.bootId; delete f.actual.bootstrap;
  return f;
}
it('reboots once more after a controlled startup timeout and completes the original release', async () => {
  const f = await stalledBoot(); f.advance(); await f.tick();
  expect(f.saved().recovery).toMatchObject({ issue: bootstrapRecoveryIssue, acknowledged: true });
  await f.tick(); await f.tick(); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(2);
  f.actual.host!.agentConnected = true; f.actual.host!.bootId = 'recovered';
  f.actual.bootstrap = { bootId: 'recovered', digest: 'bootstrap-new' };
  await f.tick(); await f.tick(); f.actual.host!.registration = 'ACTIVE';
  await f.tick(); f.actual.daemon!.tasks = ['healthy-daemon'];
  await f.tick(); await f.tick(); f.actual.gateway!.desired = 1; f.actual.gateway!.tasks = ['healthy-gateway'];
  await f.tick(); await f.tick();
  expect(f.saved().state).toBe('completed'); expect(f.saved().recovery?.recoveredAt).toBeDefined();
  await f.tick(); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(2);
});
it('pauses after the single recovery timeout across duplicate and newer release events', async () => {
  const f = await stalledBoot(); f.advance(); await f.tick(); f.advance(); await f.tick();
  expect(f.saved().state).toBe('paused'); await f.tick(); await f.tick('release-2');
  expect(f.saved().recovery?.acknowledged).toBe(true); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(2);
});
it('consumes recovery before an uncertain acknowledgement and never retries it', async () => {
  const f = await stalledBoot(); f.fail(); f.advance(); await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.saved().recovery?.acknowledged).toBe(false);
  await f.tick(); f.advance(); await f.tick(); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(2);
});
it.each(['unacknowledged', 'fixed-os', 'unrecorded-limit', 'connected-agent', 'live-task', 'changed-alias'] as const)(
  'refuses bootstrap recovery with %s evidence', async reason => {
    const f = await stalledBoot();
    // Model persisted evidence gaps and control-plane observations, not a second reboot request.
    if (reason === 'unacknowledged') f.saved().rebootAcknowledged = false;
    if (reason === 'fixed-os') f.saved().sourceOsVersion = '1.67.0';
    if (reason === 'unrecorded-limit') delete f.saved().intent.os.knownLimitations;
    if (reason === 'connected-agent') f.actual.host!.agentConnected = true;
    if (reason === 'live-task') f.actual.daemon!.tasks = ['still-running'];
    if (reason === 'changed-alias') f.ports.stillReady = async () => false;
    f.advance(); await f.tick(); expect(f.saved().state).toBe('paused');
    expect(f.calls.filter(c => c === 'reboot')).toHaveLength(1);
  });
it.each(['stopped', 'parked', 'destroying'] as const)('does not recover after intent becomes %s', async mode => {
  const f = await stalledBoot(); f.actual.mode = mode; f.advance(); await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(1);
});
it('does not recover an unexpected incomplete boot', async () => {
  const f = fixture('bootstrap'); delete f.actual.host!.bootId; delete f.actual.bootstrap;
  f.actual.host!.agentConnected = false; f.advance();
  expect(await f.tick()).toMatchObject({ kind: 'blocked' }); expect(f.calls).not.toContain('reboot');
});
it('keeps consumption durable if execution stops after saving it but before reboot', async () => {
  const f = await stalledBoot(); f.advance();
  f.ports.alert = async () => { throw Error('injected interruption after persisted consumption'); };
  await expect(f.tick()).rejects.toThrow('injected interruption');
  expect(f.saved().recovery?.acknowledged).toBe(false);
  f.ports.alert = async () => {}; await f.tick(); f.advance(); await f.tick();
  expect(f.saved().state).toBe('paused'); expect(f.calls.filter(c => c === 'reboot')).toHaveLength(1);
});
it('carries an unresolved recovery allowance into a newer release attempt', async () => {
  const f = await stalledBoot(); f.advance(); await f.tick(); f.advance(); await f.tick();
  const spent = structuredClone(f.saved().recovery);
  // An external partial recovery is not proof that the complete release succeeded.
  f.actual.host!.agentConnected = true; f.actual.host!.bootId = 'later-boot'; f.actual.host!.registration = 'ACTIVE';
  f.actual.bootstrap = { digest: 'bootstrap-old', bootId: 'later-boot' };
  f.actual.gateway!.desired = 1; f.actual.gateway!.tasks = ['g']; f.actual.daemon!.tasks = ['d'];
  await f.tick('newer-release');
  expect(f.saved().release).toBe('newer-release'); expect(f.saved().recovery).toEqual(spent);
});
