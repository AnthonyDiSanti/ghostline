import { expect, it } from 'vitest';
import { advanceRollout, type Rollout, type RolloutObservation, type RolloutEffect, type RolloutPorts } from '../lib/releases/blue-green.js';
import { artifacts, repository, type Release } from '../lib/releases/model.js';
import type { DeploymentHook } from '../lib/releases/deployment-hook.js';
import type { AddressObservation, HandoffAddresses } from '../lib/releases/eip-handoff.js';

function fixture() {
  // Nonsecret regional model: the adapter's observation proofs are independently tested against real ECS/EC2-shaped data.
  let time = 100_000;
  const hash = `sha256:${'a'.repeat(64)}`;
  const intent: Release = { schemaVersion: 3, promotionId: 'release-test', promotedAt: new Date(time).toISOString(), origin: 'us-east-1', platform: 'linux/arm64',
    images: Object.fromEntries(artifacts.map(name => [name, { repository: repository(name), digest: hash, runtimeDigest: hash, buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.66.0'], targetVersion: '1.66.0' }, history: [] };
  let state: Rollout = { schema: 1, id: 'rollout-one', version: 1, release: hash, intent, template: hash,
    source: { slot: 'a', stack: 'stack-a', instance: 'host-a', interface: 'nic-a', boot: 'boot-a', revision: 'revision/blue', images: {}, os: '1.66.0' },
    green: 'b', phase: 'network', phaseStarted: time, started: time };
  const addresses = Object.fromEntries(['xray', 'awg'].map((name, i) => [name, { production: `eipalloc-${String(i + 1).repeat(17)}`, temporary: `eipalloc-${String(i + 3).repeat(17)}`,
    blue: { networkInterfaceId: `eni-${'a'.repeat(17)}`, privateIpAddress: `10.79.0.${11 - i}` }, green: { networkInterfaceId: `eni-${'b'.repeat(17)}`, privateIpAddress: `10.79.0.${21 - i}` } }])) as HandoffAddresses;
  const bindings: AddressObservation = Object.fromEntries(Object.values(addresses).flatMap(pair => [
    [pair.production, { ...pair.blue, associationId: `eipassoc-${'1'.repeat(17)}` }],
    [pair.temporary, { ...pair.green, associationId: `eipassoc-${'2'.repeat(17)}` }],
  ]));
  const observation: RolloutObservation = { mode: 'active', aliasesReady: true, networkReady: false, addressesReady: false, wired: false, hostCreated: false,
    daemonReady: false, placementReady: false, greenReady: false, sourceHealthy: true, greenFailure: false, addresses, bindings,
    retiredTasksStopped: false, retiredHostAbsent: false, retiredAddressesDetached: false, retiredNetworkAbsent: false, temporaryAddressesAbsent: false };
  const effects: RolloutEffect[] = [], alerts: string[] = [];
  const ports: RolloutPorts = { now: () => time, observe: async () => observation,
    save: async (next, previous) => { expect(previous.version).toBe(state.version); state = next; },
    alert: async key => { alerts.push(key); }, effect: async effect => {
      effects.push(effect);
      if (effect.kind === 'associate') {
        const change = effect.change;
        if (change.kind === 'disassociate') bindings[change.allocationId] = undefined;
        else bindings[change.allocationId] = { ...change.target, associationId: `eipassoc-${'3'.repeat(17)}` };
      }
    } };
  const deploy = () => {
    state.phase = 'deployment';
    state.deployment = { service: 'service/test', deployment: 'deployment/one', blueRevision: 'revision/blue', greenRevision: 'revision/green' };
    observation.deployment = { ...state.deployment, status: 'IN_PROGRESS', stage: 'BAKE_TIME' };
  };
  const hook = (direction: 'blue' | 'green'): DeploymentHook => ({ executionId: 'execution-one', resourceArn: state.deployment!.deployment,
    lifecycleStage: 'PRODUCTION_TRAFFIC_SHIFT', executionDetails: { serviceArn: state.deployment!.service, targetServiceRevisionArn: 'revision/green',
      productionTrafficWeights: { 'revision/blue': direction === 'blue' ? 100 : 0, 'revision/green': direction === 'green' ? 100 : 0 } } });
  return { state: () => state, observation, effects, alerts, ports, deploy, hook, tick: (ms: number) => { time += ms; },
    step: (event?: DeploymentHook, cleanup = false) => advanceRollout(ports, state, event, cleanup) };
}

it('journals an uncertain force once and observes its native identity instead of repeating it', async () => {
  const f = fixture(); f.state().phase = 'force';
  f.ports.effect = async effect => { f.effects.push(effect); throw new Error('Lost acknowledgement'); };
  await expect(f.step()).rejects.toThrow('Lost acknowledgement');
  expect(f.state().effectIssued).toBeDefined();
  await f.step(); expect(f.effects).toEqual([{ kind: 'force' }]);
  f.tick(1_800_001); await f.step(); expect(f.state().phase).toBe('held');
});
it('preserves stopped/parked intent and refuses aliases that changed before launch', async () => {
  const f = fixture(); f.observation.mode = 'parked'; await f.step(); expect(f.effects).toEqual([]);
  f.observation.mode = 'active'; f.observation.aliasesReady = false; await f.step();
  expect(f.state().phase).toBe('held'); expect(f.effects).toEqual([]);
});
it('gates the first EIP move, completes management restoration while SSM reconnects, and reverses once', async () => {
  const f = fixture(); f.deploy();
  expect((await f.step(f.hook('green'))).hookStatus).toBe('IN_PROGRESS'); expect(f.effects).toEqual([]);
  f.observation.greenReady = true; await f.step(f.hook('green'));
  f.observation.greenReady = false; // Moving primary EIPs can temporarily interrupt SSM; finish the recorded swap.
  for (let i = 0; i < 6; i++) await f.step(f.hook('green'));
  expect((await f.step(f.hook('green'))).hookStatus).toBe('SUCCEEDED');
  for (let i = 0; i < 7; i++) await f.step(f.hook('blue'));
  expect((await f.step(f.hook('blue'))).hookStatus).toBe('SUCCEEDED');
  const before = f.effects.length;
  expect((await f.step(f.hook('green'))).hookStatus).toBe('FAILED'); expect(f.effects).toHaveLength(before);
});
it.each(['PRODUCTION_TRAFFIC_SHIFT', 'POST_PRODUCTION_TRAFFIC_SHIFT', 'BAKE_TIME'])('requires spaced verified failures and one rollback during %s', async stage => {
  const f = fixture(); f.deploy(); f.observation.deployment!.stage = stage; f.observation.greenFailure = true;
  await f.step(); await f.step(); expect(f.effects).toEqual([]);
  f.tick(15_000); await f.step(); expect(f.effects).toEqual([{ kind: 'rollback' }]);
  f.tick(15_000); await f.step(); expect(f.effects).toHaveLength(1);
});
it('holds failed green until explicit cleanup and preserves blue when health is unknown', async () => {
  const f = fixture(); f.deploy(); f.observation.greenFailure = true; f.observation.sourceHealthy = false;
  await f.step(); f.tick(15_000); await f.step();
  expect(f.state().phase).toBe('held'); expect(f.effects).toEqual([]);
  f.tick(86_400_000); await f.step(); expect(f.alerts.at(-1)).toContain('/cost/');
  await expect(f.step(undefined, true)).rejects.toThrow('rollback must complete');
  f.observation.deployment!.status = 'ROLLBACK_SUCCESSFUL'; f.observation.sourceHealthy = true; await f.step(undefined, true);
  expect(f.state()).toMatchObject({ phase: 'drain', retiring: 'b' });
});
it('allows a held deployment to finish native return-to-blue hooks without resuming forward action', async () => {
  const f = fixture(); f.deploy(); f.state().phase = 'held'; f.state().addresses = f.observation.addresses;
  expect((await f.step(f.hook('blue'))).hookStatus).toBe('SUCCEEDED');
  expect(f.state().phase).toBe('held'); expect(f.effects).toEqual([{ kind: 'restore-placement' }]);
  f.observation.bindings = undefined; f.observation.deployment!.status = 'ROLLBACK_SUCCESSFUL';
  await expect(f.step(undefined, true)).rejects.toThrow('Restore both production addresses');
});
it('allows explicit cleanup after stop only with stopped blue and both production addresses preserved there', async () => {
  const f = fixture(); f.deploy(); f.state().phase = 'held'; f.observation.mode = 'stopped';
  f.observation.deployment!.status = 'STOPPED'; f.observation.sourceHealthy = false;
  await f.step(); expect(f.state().phase).toBe('held'); expect(f.effects).toEqual([]);
  await expect(f.step(undefined, true)).rejects.toThrow('explicit stopped state');
  f.observation.sourceStopped = true;
  await f.step(undefined, true); expect(f.state()).toMatchObject({ phase: 'drain', retiring: 'b' });
  await f.step(); expect(f.effects).toEqual([{ kind: 'drain' }]);
});
it('retires blue only after authoritative success and performs drain, host, association, ENI and allocation cleanup in order', async () => {
  const f = fixture(); f.deploy(); f.observation.greenReady = true;
  for (let i = 0; i < 7; i++) await f.step(f.hook('green'));
  await f.step(); expect(f.state().phase).toBe('deployment');
  f.observation.deployment!.status = 'SUCCESSFUL'; await f.step(); expect(f.state().phase).toBe('drain');
  const conditions = ['retiredTasksStopped', 'retiredHostAbsent', 'retiredAddressesDetached', 'retiredNetworkAbsent', 'temporaryAddressesAbsent'] as const;
  for (const condition of conditions) { await f.step(); f.observation[condition] = true; await f.step(); }
  expect(f.effects.filter(e => e.kind !== 'associate').map(e => e.kind)).toEqual(['drain', 'remove-host', 'unwire', 'remove-network', 'release-addresses']);
  expect(f.state().phase).toBe('complete');
});
