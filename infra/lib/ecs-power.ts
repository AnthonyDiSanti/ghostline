function registeredHost(cluster: string, id: string, aws: (args: string[]) => any) {
  // Drained instances disappear from ECS's default ACTIVE-only listing but must be resumed/deregistered.
  const arns = [...new Set(['ACTIVE', 'DRAINING'].flatMap(status =>
    aws(['ecs', 'list-container-instances', '--cluster', cluster, '--status', status]).containerInstanceArns))];
  if (!arns.length) return undefined;
  const instances = aws(['ecs', 'describe-container-instances', '--cluster', cluster, '--container-instances', ...arns]).containerInstances;
  if (instances.some((instance: any) => instance.ec2InstanceId !== id) || instances.length !== 1) throw new Error('Unexpected host in endpoint cluster.');
  return instances[0];
}

function until<T>(label: string, read: () => T | undefined): T {
  // AWS lacks a container-instance connection/health waiter; bound this local read-only poll.
  for (let attempt = 0; attempt < 90; attempt++) {
    const value = read();
    if (value !== undefined) return value;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

export function setEcsPower(action: 'start' | 'stop', stackName: string, outputs: Record<string, string>, aws: (args: string[]) => any) {
  // Select one CloudFormation-owned host and its exact services; never operate on a regional fleet.
  const { InstanceId: id, ClusterName: cluster, GatewayServiceName: gateway, NetworkDaemonServiceName: daemon } = outputs;
  if (!id || !cluster || !gateway) throw new Error('Active ECS stack outputs are required.');
  const instance = aws(['ec2', 'describe-instances', '--instance-ids', id]).Reservations[0].Instances[0];
  if (!instance.Tags?.some((tag: any) => tag.Key === 'aws:cloudformation:stack-name' && tag.Value === stackName)) throw new Error('Instance ownership mismatch.');
  let state = instance.State.Name;
  if (!['running', 'pending', 'stopping', 'stopped'].includes(state)) throw new Error('Host is not startable/stoppable.');
  const services = [gateway];
  const waitServices = () => aws(['ecs', 'wait', 'services-stable', '--cluster', cluster, '--services', ...services]);
  const scale = (count: string) => {
    for (const service of services) aws(['ecs', 'update-service', '--cluster', cluster, '--service', service, '--desired-count', count]);
  };
  // Finish an in-flight EC2 transition before attempting the opposite operation.
  if (state === 'pending') { aws(['ec2', 'wait', 'instance-running', '--instance-ids', id]); state = 'running'; }
  if (state === 'stopping') { aws(['ec2', 'wait', 'instance-stopped', '--instance-ids', id]); state = 'stopped'; }
  if (action === 'stop') {
    // Desired/running service counts can reach zero before the agent reports actual task termination.
    const tasks: string[] = state === 'stopped' ? []
      : aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', gateway]).taskArns;
    scale('0'); waitServices();
    if (tasks.length) aws(['ecs', 'wait', 'tasks-stopped', '--cluster', cluster, '--tasks', ...tasks]);
    if (daemon && state !== 'stopped') {
      const host = registeredHost(cluster, id, aws);
      if (!host?.agentConnected) throw new Error('Connected ECS host required before daemon drain.');
      const daemons = aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', daemon]).taskArns;
      aws(['ecs', 'update-container-instances-state', '--cluster', cluster,
        '--container-instances', host.containerInstanceArn, '--status', 'DRAINING']);
      if (daemons.length) aws(['ecs', 'wait', 'tasks-stopped', '--cluster', cluster, '--tasks', ...daemons]);
    }
    if (state !== 'stopped') aws(['ec2', 'stop-instances', '--instance-ids', id]);
    aws(['ec2', 'wait', 'instance-stopped', '--instance-ids', id]);
  } else {
    if (state !== 'running') aws(['ec2', 'start-instances', '--instance-ids', id]);
    aws(['ec2', 'wait', 'instance-status-ok', '--instance-ids', id]);
    if (daemon) {
      const host = until('ECS host registration', () => {
        const current = registeredHost(cluster, id, aws);
        return current?.agentConnected ? current : undefined;
      });
      if (host.status !== 'ACTIVE') aws(['ecs', 'update-container-instances-state', '--cluster', cluster,
        '--container-instances', host.containerInstanceArn, '--status', 'ACTIVE']);
      // An empty daemon service can appear stable while the host registers; require one healthy task on this host.
      until('network daemon health', () => {
        const arns = aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', daemon]).taskArns;
        if (!arns.length) return undefined;
        if (arns.length !== 1) throw new Error('Expected one network daemon.');
        const task = aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...arns]).tasks[0];
        if (task.containerInstanceArn !== host.containerInstanceArn) throw new Error('Daemon host ownership mismatch.');
        return task.lastStatus === 'RUNNING' && task.healthStatus === 'HEALTHY' ? task : undefined;
      });
    }
    // A stopped service can retain yesterday's captured digests. Resolve the ready local production set on resume.
    const service = aws(['ecs', 'describe-services', '--cluster', cluster, '--services', gateway]).services?.[0];
    if (!service || service.status !== 'ACTIVE') throw new Error('Expected an active gateway service before start.');
    if (service.desiredCount === 0 || state !== 'running') aws(['ecs', 'update-service', '--cluster', cluster, '--service', gateway, '--desired-count', '1', '--force-new-deployment']);
    waitServices();
  }
}

export function prepareEcsRemoval(outputs: Record<string, string>, aws: (args: string[]) => any) {
  // Running agents deregister on termination; stopped/disconnected hosts require explicit cleanup.
  if (!outputs.ClusterName || !outputs.InstanceId) return; // Already parked.
  const cluster = outputs.ClusterName;
  const arns = [...new Set(['ACTIVE', 'DRAINING'].flatMap(status =>
    aws(['ecs', 'list-container-instances', '--cluster', cluster, '--status', status]).containerInstanceArns))];
  if (!arns.length) return;
  const instances = aws(['ecs', 'describe-container-instances', '--cluster', outputs.ClusterName, '--container-instances', ...arns]).containerInstances;
  if (instances.some((instance: any) => instance.ec2InstanceId !== outputs.InstanceId)) throw new Error('Unexpected host in endpoint cluster.');
  for (const instance of instances) if (!instance.agentConnected || (outputs.NetworkDaemonServiceName && instance.status === 'DRAINING')) {
    if (instance.runningTasksCount || instance.pendingTasksCount) throw new Error('Disconnected ECS host still has tasks; reconcile service state before removal.');
    aws(['ecs', 'deregister-container-instance', '--cluster', outputs.ClusterName, '--container-instance', instance.containerInstanceArn]);
  }
}
