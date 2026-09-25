import { expect, it, vi } from 'vitest';
import { setEcsPower, prepareEcsRemoval } from '../lib/ecs-power.js';

const outputs = { InstanceId: 'i-gateway', ClusterName: 'gateway', GatewayServiceName: 'gateway' };
function mock(state: string, owner = 'gateway') {
  return vi.fn((args: string[]) => args[1] === 'describe-instances' ? { Reservations: [{ Instances: [{
    State: { Name: state }, Tags: [{ Key: 'aws:cloudformation:stack-name', Value: owner }],
  }] }] } : args[1] === 'list-tasks' ? { taskArns: ['task-selected'] } : args[1] === 'describe-services' ? { services: [{ status: 'ACTIVE', desiredCount: 0 }] } : {});
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
  const cold = calls.findIndex(c => c.endsWith('--desired-count 0 --force-new-deployment'));
  const launch = calls.findIndex(c => c.includes('start-instances'));
  const healthy = calls.findIndex(c => c.includes('instance-status-ok'));
  const restore = calls.findIndex(c => c.endsWith('--desired-count 1'));
  expect(cold).toBeLessThan(launch); expect(launch).toBeLessThan(healthy); expect(healthy).toBeLessThan(restore);
  expect(calls.some(c => c.includes('--desired-count 1 --force-new-deployment'))).toBe(false);
});

it('deregisters a stopped empty host before cluster deletion but rejects unrelated hosts', () => {
  const instance = { ec2InstanceId: outputs.InstanceId, containerInstanceArn: 'arn:gateway', agentConnected: false, runningTasksCount: 0, pendingTasksCount: 0 };
  const aws = vi.fn((args: string[]) => args[1] === 'list-container-instances' ? { containerInstanceArns: ['arn:gateway'] }
    : args[1] === 'describe-container-instances' ? { containerInstances: [instance] } : {});
  prepareEcsRemoval(outputs, aws);
  expect(aws.mock.calls.at(-1)![0]).toContain('deregister-container-instance');
  instance.ec2InstanceId = 'i-other'; aws.mockClear();
  expect(() => prepareEcsRemoval(outputs, aws)).toThrow('Unexpected host');
  expect(aws).toHaveBeenCalledTimes(3);
});

it('stops replicas before draining the daemon and reactivates it before resuming the gateway', () => {
  let instanceState = 'running', hostStatus = 'ACTIVE';
  const calls: string[][] = [];
  const aws = (args: string[]): any => {
    calls.push(args);
    if (args[1] === 'describe-instances') return { Reservations: [{ Instances: [{ State: { Name: instanceState },
      Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'gateway' }] }] }] };
    if (args[1] === 'list-container-instances') return { containerInstanceArns: args.at(-1) === hostStatus ? ['arn:host'] : [] };
    if (args[1] === 'describe-container-instances') return { containerInstances: [{ ec2InstanceId: outputs.InstanceId,
      containerInstanceArn: 'arn:host', status: hostStatus, agentConnected: true }] };
    if (args[1] === 'update-container-instances-state') hostStatus = args.at(-1)!;
    if (args[1] === 'list-tasks') return { taskArns: [args[args.indexOf('--service-name') + 1] === 'network' ? 'task-daemon' : 'task-gateway'] };
    if (args[1] === 'describe-tasks') return { tasks: [{ containerInstanceArn: 'arn:host', lastStatus: 'RUNNING', healthStatus: 'HEALTHY' }] };
    if (args[1] === 'describe-services') return { services: [{ status: 'ACTIVE', desiredCount: 0 }] };
    return {};
  };
  const withDaemon = { ...outputs, NetworkDaemonServiceName: 'network' };
  setEcsPower('stop', 'gateway', withDaemon, aws);
  let joined = calls.map(args => args.join(' '));
  const position = (part: string) => joined.findIndex(call => call.includes(part));
  expect(position('--tasks task-gateway')).toBeLessThan(position('--status DRAINING'));
  expect(position('--tasks task-daemon')).toBeLessThan(position('stop-instances'));
  expect(calls.filter(args => args[1] === 'update-service').every(args => args.includes('gateway'))).toBe(true);
  calls.length = 0; instanceState = 'stopped';
  setEcsPower('start', 'gateway', withDaemon, aws);
  joined = calls.map(args => args.join(' '));
  expect(position('update-container-instances-state')).toBeLessThan(position('describe-tasks'));
  expect(position('describe-tasks')).toBeLessThan(position('--desired-count 1'));
  expect(position('--service network --force-new-deployment')).toBeLessThan(position('start-instances'));
  expect(hostStatus).toBe('ACTIVE');
});

it('removes an empty drained registration without force but refuses one with live tasks', () => {
  // A stopped Bottlerocket host can still appear agentConnected briefly; DRAINING remains authoritative.
  const instance = { ec2InstanceId: outputs.InstanceId, containerInstanceArn: 'arn:host', status: 'DRAINING',
    agentConnected: true, runningTasksCount: 0, pendingTasksCount: 0 };
  const aws = vi.fn((args: string[]) => args[1] === 'list-container-instances'
    ? { containerInstanceArns: args.at(-1) === 'DRAINING' ? ['arn:host'] : [] }
    : args[1] === 'describe-container-instances' ? { containerInstances: [instance] } : {});
  const withDaemon = { ...outputs, NetworkDaemonServiceName: 'network' };
  prepareEcsRemoval(withDaemon, aws);
  expect(aws.mock.calls.at(-1)![0]).toEqual(['ecs', 'deregister-container-instance', '--cluster', 'gateway', '--container-instance', 'arn:host']);
  instance.runningTasksCount = 1; aws.mockClear();
  expect(() => prepareEcsRemoval(withDaemon, aws)).toThrow('still has tasks');
  expect(aws.mock.calls.some(([args]) => args[1] === 'deregister-container-instance')).toBe(false);
});

it('leaves an already-running service deployment unchanged on repeated start', () => {
  // Idempotent power requests must not interrupt working client sessions with a forced rollout.
  const base = mock('running');
  const aws = vi.fn((args: string[]) => args[1] === 'describe-services'
    ? { services: [{ status: 'ACTIVE', desiredCount: 1 }] } : base(args));
  setEcsPower('start', 'gateway', outputs, aws);
  expect(aws.mock.calls.some(([args]) => ['update-service', 'start-instances'].includes(args[1]!))).toBe(false);
});

it('waits for tasks from an interrupted stop even when the RUNNING list is already empty', () => {
  const base = mock('running');
  const aws = vi.fn((args: string[]) => args[1] === 'list-tasks'
    ? { taskArns: args.at(-1) === 'STOPPED' ? ['still-stopping'] : [] } : base(args));
  setEcsPower('stop', 'gateway', outputs, aws);
  const calls = aws.mock.calls.map(([args]) => args.join(' '));
  const wait = calls.findIndex(call => call.includes('tasks-stopped') && call.includes('still-stopping'));
  expect(wait).toBeGreaterThan(-1);
  expect(wait).toBeLessThan(calls.findIndex(call => call.includes('stop-instances')));
});
