export function setEcsPower(action: 'start' | 'stop', stackName: string, outputs: Record<string, string>, aws: (args: string[]) => any) {
  // Select one CloudFormation-owned host and its exact services; never operate on a regional fleet.
  const { InstanceId: id, ClusterName: cluster, xrayServiceName: xray, awgServiceName: awg } = outputs;
  if (!id || !cluster || !xray || !awg) throw new Error('Active ECS stack outputs are required.');
  const instance = aws(['ec2', 'describe-instances', '--instance-ids', id]).Reservations[0].Instances[0];
  if (!instance.Tags?.some((tag: any) => tag.Key === 'aws:cloudformation:stack-name' && tag.Value === stackName)) throw new Error('Instance ownership mismatch.');
  let state = instance.State.Name;
  if (!['running', 'pending', 'stopping', 'stopped'].includes(state)) throw new Error('Host is not startable/stoppable.');
  const services = [xray, awg];
  const waitServices = () => aws(['ecs', 'wait', 'services-stable', '--cluster', cluster, '--services', ...services]);
  const scale = (count: string) => {
    for (const service of services) aws(['ecs', 'update-service', '--cluster', cluster, '--service', service, '--desired-count', count]);
  };
  // Finish an in-flight EC2 transition before attempting the opposite operation.
  if (state === 'pending') { aws(['ec2', 'wait', 'instance-running', '--instance-ids', id]); state = 'running'; }
  if (state === 'stopping') { aws(['ec2', 'wait', 'instance-stopped', '--instance-ids', id]); state = 'stopped'; }
  if (action === 'stop') {
    scale('0'); waitServices();
    if (state !== 'stopped') aws(['ec2', 'stop-instances', '--instance-ids', id]);
    aws(['ec2', 'wait', 'instance-stopped', '--instance-ids', id]);
  } else {
    if (state !== 'running') aws(['ec2', 'start-instances', '--instance-ids', id]);
    aws(['ec2', 'wait', 'instance-status-ok', '--instance-ids', id]);
    scale('1'); waitServices();
  }
}

export function prepareEcsRemoval(outputs: Record<string, string>, aws: (args: string[]) => any) {
  // Running agents deregister on termination; stopped/disconnected hosts require explicit cleanup.
  if (!outputs.ClusterName || !outputs.InstanceId) return; // Already parked.
  const arns = aws(['ecs', 'list-container-instances', '--cluster', outputs.ClusterName]).containerInstanceArns;
  if (!arns.length) return;
  const instances = aws(['ecs', 'describe-container-instances', '--cluster', outputs.ClusterName, '--container-instances', ...arns]).containerInstances;
  if (instances.some((instance: any) => instance.ec2InstanceId !== outputs.InstanceId)) throw new Error('Unexpected host in endpoint cluster.');
  for (const instance of instances) if (!instance.agentConnected) {
    if (instance.runningTasksCount || instance.pendingTasksCount) throw new Error('Disconnected ECS host still has tasks; reconcile service state before removal.');
    aws(['ecs', 'deregister-container-instance', '--cluster', outputs.ClusterName, '--container-instance', instance.containerInstanceArn]);
  }
}
