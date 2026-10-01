import { expect, it } from 'vitest';
import { AwsBlueGreen } from '../lib/releases/aws-blue-green.js';
import type { Rollout } from '../lib/releases/blue-green.js';

function fixture() {
  // Exercise effect-time guardrails independently of the controller's earlier health/ownership snapshot.
  const calls: string[] = [];
  const snapshot: any = { inputs: {}, slots: { a: { interface: 'eni-a', tasks: [], instance: { InstanceId: 'blue' } },
    b: { interface: 'eni-b', tasks: [], container: { containerInstanceArn: 'ecs-b' } } },
    production: { xray: 'xray', awg: 'awg' }, temporary: { xray: 'temporary' },
    bindings: { xray: { networkInterfaceId: 'eni-a' }, awg: { networkInterfaceId: 'eni-a' }, temporary: { networkInterfaceId: 'eni-b', associationId: 'association' } } };
  const gate = Object.assign(Object.create(AwsBlueGreen.prototype), { mode: 'active',
    config: { cluster: 'cluster', service: 'gateway' }, inventory: async () => snapshot,
    clients: { ec2: { send: async (command: any) => { calls.push(command.constructor.name); return {}; } },
      ecs: { send: async (command: any) => { calls.push(command.constructor.name); return { taskArns: [] }; } } },
    stacks: { ensure: async () => { calls.push('ensure'); } } }) as AwsBlueGreen;
  const rollout = { id: 'one', phase: 'remove-host', source: { slot: 'a' }, green: 'b', retiring: 'b',
    intent: { os: { targetVersion: '1.66.0' } } } as Rollout;
  return { gate, rollout, snapshot, calls };
}
it('refuses host retirement after production addresses move away from the intended survivor', async () => {
  const f = fixture(); f.snapshot.bindings.awg.networkInterfaceId = 'eni-b';
  await expect(f.gate.effect({ kind: 'remove-host' }, f.rollout)).rejects.toThrow('surviving host');
  expect(f.calls).toEqual([]);
});
it('preserves host and management connectivity while a daemon is still stopping', async () => {
  const f = fixture(); f.snapshot.slots.b.tasks = [{ desiredStatus: 'STOPPED', lastStatus: 'STOPPING' }];
  await expect(f.gate.effect({ kind: 'remove-host' }, f.rollout)).rejects.toThrow('still running');
  f.snapshot.slots.b.instance = { InstanceId: 'green' };
  await expect(f.gate.effect({ kind: 'unwire' }, f.rollout)).rejects.toThrow('Terminate retired host');
  expect(f.calls).toEqual([]);
});
it('deregisters only a stopped, disconnected and empty retired host without force', async () => {
  const f = fixture();
  f.snapshot.slots.b.instance = { InstanceId: 'green', State: { Name: 'stopped' } };
  Object.assign(f.snapshot.slots.b.container, { agentConnected: false, runningTasksCount: 0, pendingTasksCount: 0 });
  const commands: any[] = [];
  f.gate.clients.ecs.send = (async (command: any) => { commands.push(command); return {}; }) as any;
  await f.gate.effect({ kind: 'drain' }, f.rollout);
  expect(commands[0].constructor.name).toBe('DeregisterContainerInstanceCommand');
  expect(commands[0].input).toEqual({ cluster: 'cluster', containerInstance: 'ecs-b', force: false });
  for (const changed of [{ agentConnected: true }, { pendingTasksCount: 1 }, { runningTasksCount: 1 }, { runningTasksCount: undefined }]) {
    Object.assign(f.snapshot.slots.b.container, { agentConnected: false, runningTasksCount: 0, pendingTasksCount: 0 }, changed);
    commands.length = 0; await f.gate.effect({ kind: 'drain' }, f.rollout); expect(commands).toEqual([]);
  }
  f.snapshot.slots.b.instance.State.Name = 'running'; commands.length = 0;
  await f.gate.effect({ kind: 'drain' }, f.rollout);
  expect(commands[0].constructor.name).toBe('UpdateContainerInstancesStateCommand');
});
it('permits stopped failed-green cleanup but never permits a stopped-region launch', async () => {
  const f = fixture(); f.gate.mode = 'stopped';
  await expect(f.gate.effect({ kind: 'host' }, f.rollout)).rejects.toThrow('Inactive');
  await f.gate.effect({ kind: 'unwire' }, f.rollout);
  expect(f.calls).toEqual(['DisassociateAddressCommand']);
});
