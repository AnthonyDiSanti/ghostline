import { expect, it } from 'vitest';
import type { ECSClient } from '@aws-sdk/client-ecs';
import { observeEcsService } from '../lib/releases/ecs-observation.js';

function fixture(kind: 'gateway' | 'daemon' = 'gateway') {
  // Model AWS desired/last-status divergence instead of mocking termination as an empty running list.
  const name = `test-${kind}`;
  const service: any = { status: 'ACTIVE', desiredCount: kind === 'daemon' ? 0 : 1, runningCount: 1, pendingCount: 0, deployments: [{}] };
  const tasks: any[] = [{ taskArn: 'task', group: `service:${name}`, desiredStatus: 'RUNNING', lastStatus: 'RUNNING', healthStatus: 'HEALTHY',
    containers: [{ name: kind === 'daemon' ? 'network' : 'xray', imageDigest: 'sha256:observed' }] }];
  let failed = false;
  const client = { send: async (command: any) => {
    switch (command.constructor.name) {
      case 'DescribeServicesCommand': return { services: [service] };
      case 'ListServiceDeploymentsCommand': return { serviceDeployments: [{ serviceDeploymentArn: 'deployment', createdAt: new Date(1000), status: failed ? 'ROLLBACK_SUCCESSFUL' : 'SUCCESSFUL' }] };
      case 'ListTasksCommand': return { taskArns: tasks.filter(t => t.desiredStatus === command.input.desiredStatus).map(t => t.taskArn) };
      case 'DescribeTasksCommand': return { tasks: tasks.filter(t => command.input.tasks.includes(t.taskArn)) };
      default: throw Error('Unexpected API');
    }
  } } as unknown as Pick<ECSClient, 'send'>;
  return { tasks, service, client, fail: () => { failed = true; }, observe: () => observeEcsService(client, 'cluster', name, kind) };
}
it('keeps stopping tasks visible until actual termination despite desired zero', async () => {
  const f = fixture(); f.service.desiredCount = 0; f.service.runningCount = 0;
  Object.assign(f.tasks[0], { desiredStatus: 'STOPPED', lastStatus: 'STOPPING' });
  expect(await f.observe()).toMatchObject({ stable: false, tasks: ['task'] });
  f.tasks[0].lastStatus = 'STOPPED';
  expect(await f.observe()).toMatchObject({ stable: true, tasks: [] });
});
it('requires a healthy daemon and ignores its nonconfigurable zero desiredCount', async () => {
  const f = fixture('daemon');
  expect(await f.observe()).toMatchObject({ stable: true, desired: 1, images: { 'network-daemon': 'sha256:observed' } });
  f.tasks[0].healthStatus = 'UNKNOWN'; expect((await f.observe())?.stable).toBe(false);
});
it('does not call overlapping or unhealthy deployments stable', async () => {
  const f = fixture(); f.service.deployments.push({}); expect((await f.observe())?.stable).toBe(false);
  f.fail(); expect((await f.observe())?.failedDeployments).toEqual(['deployment']);
});
it('rejects mismatched task ownership instead of using another service identity', async () => {
  const f = fixture(); f.tasks[0].group = 'service:unrelated'; await expect(f.observe()).rejects.toThrow('ownership');
});
it('treats missing service lookup failures as absence but propagates denied access', async () => {
  const client = { send: async () => ({ failures: [{ reason: 'MISSING' }] }) } as unknown as Pick<ECSClient, 'send'>;
  expect(await observeEcsService(client, 'cluster', 'service', 'gateway')).toBeUndefined();
  client.send = (async () => { throw Object.assign(Error(), { name: 'AccessDeniedException' }); }) as typeof client.send;
  await expect(observeEcsService(client, 'cluster', 'service', 'gateway')).rejects.toThrow();
});
it('observes immediate service deployment identity while the gateway remains scaled to zero', async () => {
  const f = fixture(); f.service.desiredCount = 0; f.service.runningCount = 0; f.tasks.length = 0;
  f.service.deployments = [{ id: 'new-cold-selection', rolloutState: 'IN_PROGRESS' }];
  expect(await f.observe()).toMatchObject({ desired: 0, tasks: [], deployments: ['ecs:new-cold-selection', 'deployment'] });
});
