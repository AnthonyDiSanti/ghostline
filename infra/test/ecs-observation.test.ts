import { expect, it } from 'vitest';
import type { ECSClient } from '@aws-sdk/client-ecs';
import { readServiceTasks } from '../lib/releases/ecs-observation.js';

function fixture() {
  // Desired STOPPED does not mean the agent has terminated a task; teardown must retain its host and networking.
  const tasks: any[] = [{ taskArn: 'task', group: 'service:gateway', desiredStatus: 'STOPPED', lastStatus: 'STOPPING' }];
  let missing = false;
  const client = { send: async (command: any) => {
    switch (command.constructor.name) {
      case 'ListTasksCommand': return { taskArns: tasks.filter(t => t.desiredStatus === command.input.desiredStatus).map(t => t.taskArn) };
      case 'DescribeTasksCommand': return missing ? { tasks: [], failures: [{ reason: 'MISSING' }] } : { tasks };
      default: throw Error('Unexpected API');
    }
  } } as unknown as Pick<ECSClient, 'send'>;
  return { tasks, client, disappear: () => { missing = true; }, read: () => readServiceTasks(client, 'cluster', 'gateway') };
}
it('keeps stopping tasks visible until actual termination', async () => {
  const f = fixture(); expect(await f.read()).toHaveLength(1);
  f.tasks[0].lastStatus = 'STOPPED'; expect(await f.read()).toEqual([]);
});
it('rejects mismatched task ownership instead of using another service identity', async () => {
  const f = fixture(); f.tasks[0].group = 'service:unrelated'; await expect(f.read()).rejects.toThrow('ownership');
});
it('does not treat a disappearing task or denied lookup as confirmed termination', async () => {
  const f = fixture(); f.disappear(); await expect(f.read()).rejects.toThrow('incomplete');
  f.client.send = (async () => { throw Object.assign(Error('denied'), { name: 'AccessDeniedException' }); }) as typeof f.client.send;
  await expect(f.read()).rejects.toThrow('denied');
});
