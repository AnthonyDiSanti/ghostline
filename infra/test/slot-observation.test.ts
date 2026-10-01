import { expect, it, vi } from 'vitest';
import { SlotObserver } from '../lib/releases/slot-observation.js';
import type { SlotStacks } from '../lib/releases/slot-stacks.js';

it('keeps an owned terminating host visible while CloudFormation inventory catches up', async () => {
  const stack = { id: 'stack-a', status: 'UPDATE_IN_PROGRESS', resources: { Instance: 'i-host', NetworkInterface: 'eni-host' } };
  const instance = { InstanceId: 'i-host', State: { Name: 'terminated' }, Tags: [{ Key: 'aws:cloudformation:stack-id', Value: 'stack-a' }], NetworkInterfaces: [] };
  const ecs = { send: vi.fn() };
  const observer = new SlotObserver({ observe: async () => stack, config: { account: '000000000000' } } as unknown as SlotStacks,
    'cluster', { ecs, ec2: { send: vi.fn(async command => command.constructor.name === 'DescribeNetworkInterfacesCommand'
      ? { NetworkInterfaces: [{ NetworkInterfaceId: 'eni-host', OwnerId: '000000000000', TagSet: instance.Tags,
        PrivateIpAddresses: [{ PrivateIpAddress: '10.79.0.10' }, { PrivateIpAddress: '10.79.0.11' }] }] }
      : { Reservations: [{ Instances: [instance] }] }) } } as any);
  expect((await observer.read('a')).instance).toBe(instance);
  expect(ecs.send).not.toHaveBeenCalled();
  stack.status = 'UPDATE_COMPLETE';
  await expect(observer.read('a')).rejects.toThrow('ownership changed');
  stack.status = 'UPDATE_IN_PROGRESS'; instance.State.Name = 'running';
  await expect(observer.read('a')).rejects.toThrow('ownership changed');
  instance.State.Name = 'terminated'; instance.Tags[0]!.Value = 'foreign';
  await expect(observer.read('a')).rejects.toThrow('ownership');
});

it('accepts retired task uncertainty only after stopped-host ownership and absent registration are proven', async () => {
  const tags = [{ Key: 'aws:cloudformation:stack-id', Value: 'stack-a' }];
  const instance = { InstanceId: 'i-host', State: { Name: 'stopped' }, Tags: tags, NetworkInterfaces: [{ NetworkInterfaceId: 'eni-host' }] };
  const stack = { id: 'stack-a', status: 'UPDATE_COMPLETE', resources: { Instance: 'i-host', NetworkInterface: 'eni-host',
    NetworkService: 'arn:aws:ecs:eu-north-1:000000000000:service/cluster/cluster-network' } };
  const ecs = { send: vi.fn(async (command: any) => {
    if (command.constructor.name === 'ListContainerInstancesCommand') return { containerInstanceArns: [] };
    throw new Error('Unregistered running host still needs task observation');
  }) };
  const observer = new SlotObserver({ observe: async () => stack, config: { account: '000000000000', region: 'eu-north-1' } } as unknown as SlotStacks,
    'cluster', { ecs, ec2: { send: vi.fn(async command => command.constructor.name === 'DescribeNetworkInterfacesCommand'
      ? { NetworkInterfaces: [{ NetworkInterfaceId: 'eni-host', OwnerId: '000000000000', TagSet: tags,
        PrivateIpAddresses: [{ PrivateIpAddress: '10.79.0.10' }, { PrivateIpAddress: '10.79.0.11' }] }] }
      : { Reservations: [{ Instances: [instance] }] }) } } as any);
  const stopped = await observer.read('a');
  expect(stopped.container).toBeUndefined(); expect(stopped.tasks).toEqual([]);
  instance.State.Name = 'running'; await expect(observer.read('a')).rejects.toThrow('still needs task observation');
  instance.State.Name = 'stopped'; instance.Tags = [{ Key: 'aws:cloudformation:stack-id', Value: 'foreign' }];
  await expect(observer.read('a')).rejects.toThrow('ownership changed');
});
