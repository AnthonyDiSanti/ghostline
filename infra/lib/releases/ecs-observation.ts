import { DescribeServicesCommand, DescribeTasksCommand, ListServiceDeploymentsCommand, ListTasksCommand,
  type ECSClient, type Task, type ListTasksCommandOutput } from '@aws-sdk/client-ecs';
import { applicationArtifacts, type ImageArtifact } from '../image-artifacts.js';

export interface EcsServiceObservation {
  desired: number;
  stable: boolean;
  tasks: string[];
  images: Partial<Record<ImageArtifact, string>>;
  deployments: string[];
  failedDeployments: string[];
  latestFailureAt?: number;
}

export async function observeEcsService(client: Pick<ECSClient, 'send'>, cluster: string, serviceName: string,
  kind: 'gateway' | 'daemon'): Promise<EcsServiceObservation | undefined> {
  // Read only this service; an absent endpoint is a lifecycle state, never an instruction to recreate it.
  const result = await client.send(new DescribeServicesCommand({ cluster, services: [serviceName] }))
    .catch(error => { if (error.name === 'ClusterNotFoundException') return { services: [] }; throw error; });
  if ('failures' in result && result.failures?.some(f => f.reason !== 'MISSING')) throw new Error('Service observation failed.');
  const service = result.services?.[0];
  if (!service || service.status !== 'ACTIVE') return undefined;
  // The service's immediate deployment ID also witnesses a force while desiredCount is zero,
  // before the richer deployment-history API necessarily reports any running target revision.
  const deployments: string[] = (service.deployments ?? []).flatMap(d => d.id ? [`ecs:${d.id}`] : []);
  const failedDeployments: string[] = (service.deployments ?? []).flatMap(d => d.id && d.rolloutState === 'FAILED' ? [`ecs:${d.id}`] : []);
  let latest: { at: number; failed: boolean } | undefined;
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListServiceDeploymentsCommand({ cluster, service: serviceName, maxResults: 100, nextToken }));
    for (const deployment of page.serviceDeployments ?? []) {
      if (!deployment.serviceDeploymentArn || !deployment.status || !deployment.createdAt) throw new Error('Incomplete deployment observation.');
      deployments.push(deployment.serviceDeploymentArn);
      const failed = /FAILED|ROLLBACK|STOPPED/.test(deployment.status);
      if (failed) failedDeployments.push(deployment.serviceDeploymentArn);
      if (!latest || deployment.createdAt.getTime() > latest.at) latest = { at: deployment.createdAt.getTime(), failed };
    }
    nextToken = page.nextToken;
  } while (nextToken);

  // A task whose desired status is STOPPED may still be stopping. Include both lists before asserting termination.
  const arns = new Set<string>();
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
  const images: EcsServiceObservation['images'] = {};
  const task = tasks.length === 1 ? tasks[0] : undefined;
  if (task) for (const container of task.containers ?? []) {
    const name = kind === 'daemon' && container.name === 'network' ? 'network-daemon' : container.name;
    if (name && [...applicationArtifacts, 'network-daemon'].includes(name) && container.imageDigest) images[name as ImageArtifact] = container.imageDigest;
  }
  // DAEMON has no configurable desiredCount; readiness means one healthy task on our single eligible host.
  const desired = kind === 'daemon' ? 1 : service.desiredCount ?? 0;
  const busy = (service.deployments ?? []).some(d => d.rolloutState === 'IN_PROGRESS') || (service.deployments?.length ?? 0) > 1;
  const stable = !busy && service.pendingCount === 0 && service.runningCount === desired && tasks.length === desired
    && (desired === 0 || (task?.lastStatus === 'RUNNING' && (kind !== 'daemon' || task.healthStatus === 'HEALTHY')));
  return { desired, stable, tasks: tasks.map(t => t.taskArn!), images, deployments, failedDeployments,
    ...(latest?.failed ? { latestFailureAt: latest.at } : {}) };
}
