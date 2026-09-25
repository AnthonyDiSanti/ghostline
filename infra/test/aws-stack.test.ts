import { expect, it } from 'vitest';
import { AwsStackGate, type StackClients } from '../lib/releases/aws-stack.js';
import type { Registry } from '../lib/releases/registry.js';

function fixture() {
  const calls: Array<{ name: string; input: any }> = [];
  let host: string | undefined = 'i-0123456789abcdef0';
  let denial = false;
  const client = { send: async (command: any) => {
    const name = command.constructor.name; calls.push({ name, input: command.input });
    if (name === 'DescribeStackResourceCommand') {
      if (denial) throw Object.assign(Error('not authorized'), { name: 'AccessDenied' });
      if (!host) throw Object.assign(Error('Stack with id Test does not exist'), { name: 'ValidationError' });
      return { StackResourceDetail: { ResourceType: 'AWS::EC2::Instance', PhysicalResourceId: host, ResourceStatus: 'CREATE_COMPLETE' } };
    }
    return {};
  } };
  const gate = new AwsStackGate({} as Registry, { stack: 'Test', cluster: 'cluster', service: 'gateway', daemon: 'daemon', table: 'table',
    topic: 'topic', observerDocument: 'FixedReadOnly', progressRule: 'progress' },
  Object.fromEntries(['cfn','ec2','ecs','db','ssm','sns','events'].map(k => [k, client])) as unknown as StackClients, 'active');
  return { gate, calls, replace: () => { host = 'i-11111111111111111'; }, remove: () => { host = undefined; }, deny: () => { denial = true; } };
}
it('rechecks exact CloudFormation physical ownership before every host effect', async () => {
  const f = fixture(); await f.gate.request('reboot', 'i-0123456789abcdef0');
  expect(f.calls.map(c => c.name)).toEqual(['DescribeStackResourceCommand','RebootInstancesCommand']);
  expect(f.calls[1]!.input).toEqual({ InstanceIds: ['i-0123456789abcdef0'] });
  f.replace(); await expect(f.gate.request('reboot', 'i-0123456789abcdef0')).rejects.toThrow('changed');
  expect(f.calls.filter(c => c.name === 'RebootInstancesCommand')).toHaveLength(1);
});
it('updates only static service deployment/power fields and never a task definition', async () => {
  const f = fixture();
  for (const step of ['quiesce','gateway','daemon','gateway-cold','restore'] as const) await f.gate.request(step, 'i-0123456789abcdef0');
  expect(f.calls.filter(c => c.name === 'UpdateServiceCommand').map(c => c.input)).toEqual([
    { cluster: 'cluster', service: 'gateway', desiredCount: 0 },
    { cluster: 'cluster', service: 'gateway', forceNewDeployment: true, desiredCount: 1 },
    { cluster: 'cluster', service: 'daemon', forceNewDeployment: true },
    { cluster: 'cluster', service: 'gateway', forceNewDeployment: true },
    { cluster: 'cluster', service: 'gateway', desiredCount: 1 },
  ]);
});
it('does not interpret denied ownership reads as an absent host', async () => {
  const f = fixture(); f.deny(); await expect(f.gate.exactHost()).rejects.toThrow('authorized');
  const absent = fixture(); absent.remove(); expect(await absent.gate.exactHost()).toBeUndefined();
});
it('preserves conditional progression when another actor has changed the action version', async () => {
  const f = fixture();
  f.gate.clients.db.send = (async () => { throw Object.assign(Error('conflict'), { name: 'ConditionalCheckFailedException' }); }) as typeof f.gate.clients.db.send;
  expect(await f.gate.save({ version: 2 } as any, { version: 1 } as any)).toBe(false);
});
