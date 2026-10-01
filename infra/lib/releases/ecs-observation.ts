import { DescribeTasksCommand, ListTasksCommand, type ECSClient, type Task, type ListTasksCommandOutput } from '@aws-sdk/client-ecs';

export async function readServiceTasks(client: Pick<ECSClient, 'send'>, cluster: string, serviceName: string): Promise<Task[]> {
  // A task whose desired status is STOPPED may still be stopping. Include both lists before asserting termination.
  const arns = new Set<string>();
  let nextToken: string | undefined;
  for (const desiredStatus of ['RUNNING', 'STOPPED'] as const) {
    nextToken = undefined;
    do {
      const page: ListTasksCommandOutput = await client.send(new ListTasksCommand({ cluster, serviceName, desiredStatus, maxResults: 100, nextToken }));
      page.taskArns?.forEach(arn => arns.add(arn)); nextToken = page.nextToken;
    } while (nextToken);
  }
  const tasks: Task[] = [];
  const all = [...arns];
  for (let offset = 0; offset < all.length; offset += 100) {
    const detail = await client.send(new DescribeTasksCommand({ cluster, tasks: all.slice(offset, offset + 100) }));
    // A missing task is not proof that it stopped; retry the complete observation on the next invocation.
    if (detail.failures?.length || detail.tasks?.length !== Math.min(100, all.length - offset)) throw new Error('Task observation is incomplete.');
    for (const task of detail.tasks) {
      if (!task.taskArn || !task.lastStatus || task.group !== `service:${serviceName}`) throw new Error('Unexpected task ownership or status.');
      if (task.lastStatus !== 'STOPPED') tasks.push(task);
    }
  }
  return tasks;
}
