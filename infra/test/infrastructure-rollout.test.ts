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
