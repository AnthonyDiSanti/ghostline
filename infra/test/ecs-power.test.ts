import { expect, it, vi } from 'vitest';
import { setEcsPower, prepareEcsRemoval } from '../lib/ecs-power.js';

const outputs = { InstanceId: 'i-gateway', ClusterName: 'gateway', GatewayServiceName: 'gateway' };
function mock(state: string, owner = 'gateway') {
  return vi.fn((args: string[]) => args[1] === 'describe-instances' ? { Reservations: [{ Instances: [{
    State: { Name: state }, Tags: [{ Key: 'aws:cloudformation:stack-name', Value: owner }],
  }] }] } : args[1] === 'list-tasks' ? { taskArns: ['task-selected'] } : {});
}
it('drains the shared service before stopping the host and does not touch another deployment', () => {
  const aws = mock('running'); setEcsPower('stop', 'gateway', outputs, aws);
  const calls = aws.mock.calls.map(([args]) => args.join(' '));
  expect(calls.findIndex(c => c.includes('services-stable'))).toBeLessThan(calls.findIndex(c => c.includes('stop-instances')));
  expect(calls.findIndex(c => c.includes('tasks-stopped'))).toBeLessThan(calls.findIndex(c => c.includes('stop-instances')));
  expect(calls.find(c => c.includes('tasks-stopped'))).toContain('--tasks task-selected');
  expect(calls.filter(c => c.includes('update-service'))).toHaveLength(1);
  expect(calls.filter(c => c.includes('update-service')).every(c => c.endsWith('--desired-count 0'))).toBe(true);
  const other = mock('running', 'other');
  expect(() => setEcsPower('stop', 'gateway', outputs, other)).toThrow('ownership mismatch');
  expect(other).toHaveBeenCalledTimes(1);
});
it('finishes stopping before starting and waits for EC2 health before scheduling services', () => {
  const aws = mock('stopping'); setEcsPower('start', 'gateway', outputs, aws);
  const calls = aws.mock.calls.map(([args]) => args.join(' '));
  expect(calls[1]).toContain('instance-stopped');
  expect(calls[2]).toContain('start-instances');
  expect(calls[3]).toContain('instance-status-ok');
  expect(calls[4]).toContain('--desired-count 1');
});

it('deregisters a stopped empty host before cluster deletion but rejects unrelated hosts', () => {
  const instance = { ec2InstanceId: outputs.InstanceId, containerInstanceArn: 'arn:gateway', agentConnected: false, runningTasksCount: 0, pendingTasksCount: 0 };
  const aws = vi.fn((args: string[]) => args[1] === 'list-container-instances' ? { containerInstanceArns: ['arn:gateway'] }
    : args[1] === 'describe-container-instances' ? { containerInstances: [instance] } : {});
  prepareEcsRemoval(outputs, aws);
  expect(aws.mock.calls.at(-1)![0]).toContain('deregister-container-instance');
  instance.ec2InstanceId = 'i-other'; aws.mockClear();
  expect(() => prepareEcsRemoval(outputs, aws)).toThrow('Unexpected host');
  expect(aws).toHaveBeenCalledTimes(2);
});
