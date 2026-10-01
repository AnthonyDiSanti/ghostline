import { expect, it } from 'vitest';
import { HostProbe } from '../lib/releases/host-probe.js';

function fixture() {
  let time = 100_000;
  let sendError: Error | undefined;
  const records = new Map<string, any>(), calls: any[] = [];
  const report = { bootId: '11111111-1111-1111-1111-111111111111', os: { os: { arch: 'aarch64', version_id: '1.66.0', variant_id: 'aws-ecs-3' } } };
  let result: any = { Status: 'Success', DocumentName: 'GhostlineObserveHost', ExecutionEndDateTime: new Date(time).toISOString(), StandardOutputContent: JSON.stringify(report) };
  const client: any = { send: async (command: any) => { calls.push(command); if (sendError) throw sendError; return command.constructor.name === 'SendCommandCommand'
    ? { Command: { CommandId: 'command-new' } } : result; } };
  const state = { now: () => time, record: async <T>(key: string) => records.get(key) as T | undefined,
    put: async (key: string, value: any) => { records.set(key, value); } };
  return { probe: new HostProbe('GhostlineObserveHost', client, state, async ms => { time += ms; }), calls, records,
    setResult: (value: any) => { result = value; }, failSend: (name: string) => { sendError = Object.assign(new Error(name), { name }); }, tick: (ms: number) => { time += ms; } };
}
it('obtains bounded fresh readiness without an entire minute of Lambda waiting', async () => {
  const f = fixture(); expect((await f.probe.read('host'))?.version).toBe('1.66.0');
  expect(f.calls.map(c => c.constructor.name)).toEqual(['SendCommandCommand', 'GetCommandInvocationCommand']);
  expect(f.calls[0].input.Parameters).toBeUndefined();
});
it('waits for SSM registration without treating an unavailable observation as healthy or suppressing denied access', async () => {
  const f = fixture(); f.failSend('InvalidInstanceId');
  expect(await f.probe.read('host')).toBeUndefined(); expect(f.records.size).toBe(0);
  f.failSend('AccessDeniedException');
  await expect(f.probe.read('host')).rejects.toThrow('AccessDeniedException');
});
it('does not reuse an old successful readiness sample during a later bake observation', async () => {
  const f = fixture(); await f.probe.read('host'); f.tick(60_000);
  expect(await f.probe.read('host')).toBeUndefined();
  expect(f.calls.filter(c => c.constructor.name === 'SendCommandCommand')).toHaveLength(2);
});
it('persists a slow observation for a later callback and rejects the wrong document', async () => {
  const f = fixture(); f.setResult({ Status: 'InProgress' });
  expect(await f.probe.read('host')).toBeUndefined(); expect(f.calls).toHaveLength(4);
  f.setResult({ Status: 'Success', DocumentName: 'Other' });
  await expect(f.probe.read('host')).rejects.toThrow('Unexpected host-observer');
});
