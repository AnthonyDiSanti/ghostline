import { expect, it, vi } from 'vitest';
import { deploymentChanges, deployWithGreen } from '../lib/infrastructure-rollout.js';
import type { BlueGreenPorts } from '../lib/releases/rollout-controller.js';
import type { Rollout } from '../lib/releases/blue-green.js';

it('does not wait for a nonexistent ECS launch when only CDK metadata differs', () => {
  const task = { Type: 'AWS::ECS::TaskDefinition', Properties: { Family: 'gateway', Memory: '640' } };
  const deployed = { Resources: { GatewayTask: { ...task, Metadata: { 'aws:cdk:path': 'Endpoint/GatewayTask' } },
    CDKMetadata: { Type: 'AWS::CDK::Metadata', Properties: { Analytics: 'old' } } } };
  expect(deploymentChanges(deployed, { Resources: { GatewayTask: task } })).toBe('none');
  expect(deploymentChanges(deployed, { Resources: { GatewayTask: { ...task, Properties: { ...task.Properties, Memory: '704' } } } })).toBe('task');
});
it('keeps service configuration and deletion policy changes separate from a task launch', () => {
  const before = { Resources: { GatewayTask: { Type: 'AWS::ECS::TaskDefinition', Properties: { Family: 'gateway' } },
    GatewayService: { Type: 'AWS::ECS::Service', Properties: { DeploymentConfiguration: { Strategy: 'ROLLING' } } } } };
  const after = structuredClone(before);
  after.Resources.GatewayService.Properties.DeploymentConfiguration.Strategy = 'BLUE_GREEN';
  expect(deploymentChanges(before, after)).toBe('infrastructure');
  expect(deploymentChanges(before, { Resources: { ...before.Resources, GatewayTask: { ...before.Resources.GatewayTask, DeletionPolicy: 'Retain' } } })).toBe('infrastructure');
});

function prepared() {
  let current = { id: 'one', version: 1, phase: 'force' } as Rollout;
  const order: string[] = [];
  const gate = { now: () => 1000, record: async () => current,
    save: async (next: Rollout, before: Rollout) => {
      expect(before).toBe(current); current = next; order.push('journal');
    } } as unknown as BlueGreenPorts;
  const handoff = async () => { order.push('handoff'); };
  const deploy = async () => { order.push('deploy'); };
  const wake = async () => { order.push('wake'); current = { ...current, phase: 'complete' }; };
  return { gate, handoff, deploy, wake, order, current: () => current };
}
it('journals the one CDK launch before transferring the claim and entering blocking ECS hooks', async () => {
  const f = prepared();
  await deployWithGreen(f.gate, { handoff: f.handoff }, 'task', f.deploy, f.wake);
  expect(f.order).toEqual(['journal', 'handoff', 'deploy', 'wake']);
  expect(f.current().effectIssued).toBe(1000);
});
it('keeps non-task IaC updates under the CLI claim and leaves the force effect to the controller', async () => {
  const f = prepared();
  await deployWithGreen(f.gate, { handoff: f.handoff }, 'infrastructure', f.deploy, f.wake);
  expect(f.order).toEqual(['deploy', 'handoff', 'wake']); expect(f.current().effectIssued).toBeUndefined();
});
it('does not fabricate a second launch after an uncertain CloudFormation submission', async () => {
  const f = prepared(); const wake = vi.fn(f.wake);
  await expect(deployWithGreen(f.gate, { handoff: f.handoff }, 'task', async () => {
    throw new Error('Connection lost after UpdateStack');
  }, wake)).rejects.toThrow('Connection lost');
  expect(f.current().effectIssued).toBe(1000); expect(wake).not.toHaveBeenCalled();
});

it('retries a throttled controller wake while preserving the one deployment and handoff', async () => {
  // A rejected Lambda Invoke does not undo the native rollout already handed to AWS.
  const f = prepared(), deploy = vi.fn(f.deploy), handoff = vi.fn(f.handoff), wait = vi.fn(async () => {});
  const busy = Object.assign(new Error('Controller busy'), { name: 'TooManyRequestsException' });
  const wake = vi.fn().mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockImplementation(f.wake);
  await deployWithGreen(f.gate, { handoff }, 'task', deploy, wake, wait);
  expect(deploy).toHaveBeenCalledTimes(1); expect(handoff).toHaveBeenCalledTimes(1);
  expect(wake).toHaveBeenCalledTimes(3); expect(wait.mock.calls).toEqual([[1000], [2000]]);
  expect(f.current().phase).toBe('complete'); expect(f.current().effectIssued).toBe(1000);
});

it('bounds controller throttling without submitting another deployment', async () => {
  // Exhaustion retains the delegated AWS operation rather than silently treating it as complete.
  const f = prepared(), deploy = vi.fn(f.deploy), handoff = vi.fn(f.handoff), wait = vi.fn(async () => {});
  const busy = Object.assign(new Error('Controller busy'), { name: 'TooManyRequestsException' });
  const wake = vi.fn(async () => { throw busy; });
  await expect(deployWithGreen(f.gate, { handoff }, 'task', deploy, wake, wait)).rejects.toBe(busy);
  expect(deploy).toHaveBeenCalledTimes(1); expect(handoff).toHaveBeenCalledTimes(1);
  expect(wake).toHaveBeenCalledTimes(7);
  expect(wait.mock.calls).toEqual([[1000], [2000], [4000], [8000], [10_000], [10_000]]);
  expect(f.current().effectIssued).toBe(1000);
});

it('preserves non-throttling wake failures without retrying or relaunching', async () => {
  // Permission and function errors still require inspection, even after a successful IaC submission.
  const f = prepared(), deploy = vi.fn(f.deploy), wait = vi.fn(async () => {}), denied = new Error('Invoke denied');
  const wake = vi.fn(async () => { throw denied; });
  await expect(deployWithGreen(f.gate, { handoff: f.handoff }, 'task', deploy, wake, wait)).rejects.toBe(denied);
  expect(deploy).toHaveBeenCalledTimes(1); expect(wake).toHaveBeenCalledTimes(1); expect(wait).not.toHaveBeenCalled();
});
