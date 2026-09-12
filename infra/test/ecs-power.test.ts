import { expect, it, vi } from 'vitest';
import { setEcsPower, prepareEcsRemoval } from '../lib/ecs-power.js';

const outputs = { InstanceId: 'i-trial', ClusterName: 'trial', xrayServiceName: 'xray', awgServiceName: 'awg' };
function mock(state: string, owner = 'trial') {
  return vi.fn((args: string[]) => args[1] === 'describe-instances' ? { Reservations: [{ Instances: [{
    State: { Name: state }, Tags: [{ Key: 'aws:cloudformation:stack-name', Value: owner }],
  }] }] } : {});
}
it('drains both services before stopping the host and does not touch another deployment', () => {
  const aws = mock('running'); setEcsPower('stop', 'trial', outputs, aws);
  const calls = aws.mock.calls.map(([args]) => args.join(' '));
  expect(calls.findIndex(c => c.includes('services-stable'))).toBeLessThan(calls.findIndex(c => c.includes('stop-instances')));
  expect(calls.filter(c => c.includes('update-service'))).toHaveLength(2);
  expect(calls.filter(c => c.includes('update-service')).every(c => c.endsWith('--desired-count 0'))).toBe(true);
  const other = mock('running', 'other');
  expect(() => setEcsPower('stop', 'trial', outputs, other)).toThrow('ownership mismatch');
  expect(other).toHaveBeenCalledTimes(1);
});
it('finishes stopping before starting and waits for EC2 health before scheduling services', () => {
  const aws = mock('stopping'); setEcsPower('start', 'trial', outputs, aws);
  const calls = aws.mock.calls.map(([args]) => args.join(' '));
  expect(calls[1]).toContain('instance-stopped');
  expect(calls[2]).toContain('start-instances');
  expect(calls[3]).toContain('instance-status-ok');
  expect(calls[4]).toContain('--desired-count 1');
});

it('deregisters a stopped empty host before cluster deletion but rejects unrelated hosts', () => {
  const instance = { ec2InstanceId: outputs.InstanceId, containerInstanceArn: 'arn:trial', agentConnected: false, runningTasksCount: 0, pendingTasksCount: 0 };
  const aws = vi.fn((args: string[]) => args[1] === 'list-container-instances' ? { containerInstanceArns: ['arn:trial'] }
    : args[1] === 'describe-container-instances' ? { containerInstances: [instance] } : {});
  prepareEcsRemoval(outputs, aws);
  expect(aws.mock.calls.at(-1)![0]).toContain('deregister-container-instance');
  instance.ec2InstanceId = 'i-other'; aws.mockClear();
  expect(() => prepareEcsRemoval(outputs, aws)).toThrow('Unexpected host');
  expect(aws).toHaveBeenCalledTimes(2);
});
