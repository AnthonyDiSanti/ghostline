import { DescribeServiceDeploymentsCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import type { AwsBlueGreen } from './aws-blue-green.js';
import { deploymentStages, type DeploymentHook } from './deployment-hook.js';
import type { LifecycleState } from './lifecycle.js';
import type { Activation } from '../host-slot-activation.js';
import { readiness } from './gate.js';
import { bootstrapReady, daemonReady, gatewayReady } from './generation-proof.js';
import { readServiceTasks } from './ecs-observation.js';

export async function activationHook(gate: AwsBlueGreen, lifecycle: LifecycleState | undefined, hook: DeploymentHook): Promise<'SUCCEEDED' | 'IN_PROGRESS' | undefined> {
  if (!lifecycle?.operation || !['deploy', 'unpark', 'start'].includes(lifecycle.operation.kind)) return undefined;
  if (!deploymentStages.includes(hook.lifecycleStage) || !hook.executionId) throw new Error('Unsupported activation hook stage.');
  const service = `arn:aws:ecs:${gate.config.region}:${gate.config.account}:service/${gate.config.cluster}/${gate.config.service}`;
  if (hook.executionDetails?.serviceArn !== service || !hook.resourceArn?.startsWith(service.replace(':service/', ':service-deployment/') + '/')) {
    throw new Error('Unexpected activation hook service.');
  }
  const native = await gate.clients.ecs.send(new DescribeServiceDeploymentsCommand({ serviceDeploymentArns: [hook.resourceArn] }));
  const deployment = native.serviceDeployments?.[0];
  if (native.failures?.length || native.serviceDeployments?.length !== 1 || deployment?.serviceArn !== service
    || deployment.targetServiceRevision?.arn !== hook.executionDetails.targetServiceRevisionArn) throw new Error('Activation hook identity is unverified.');
  const detail = await gate.clients.ecs.send(new DescribeServicesCommand({ cluster: gate.config.cluster, services: [gate.config.service] }));
  if (detail.failures?.length || detail.services?.length !== 1) throw new Error('Activation service observation is unavailable.');
  const tasks = await readServiceTasks(gate.clients.ecs, gate.config.cluster, gate.config.service);
  // Updating an intentionally empty service may still invoke hooks. Acknowledge its empty state without moving any address or waking a host.
  if (detail.services[0]?.desiredCount === 0 && !tasks.length) return 'SUCCEEDED';
  const activation = await gate.record<Activation>('activation/current');
  if (!activation || activation.phase !== 'gateway' || !deployment.createdAt
    || deployment.createdAt.getTime() < lifecycle.operation.startedAt - 5_000
    || deployment.sourceServiceRevisions?.some(source => (source.runningTaskCount ?? 0) > 0)) return undefined;
  const ready = await readiness(gate.registry);
  if (!ready.ready || ready.current?.digest !== activation.release) return 'IN_PROGRESS';
  const host = await gate.observer.read('a');
  if (host.stack?.id !== activation.stack || !host.instance?.InstanceId || !host.container?.containerInstanceArn || !host.container.agentConnected || host.tasks.length !== 1) return 'IN_PROGRESS';
  const probe = await gate.probe.read(host.instance.InstanceId);
  const intent = ready.current.release;
  if (!bootstrapReady(probe, intent, {}) || !daemonReady(host.tasks[0], host.container.containerInstanceArn, intent, {})) return 'IN_PROGRESS';
  if (hook.lifecycleStage === 'PRE_SCALE_UP') return 'SUCCEEDED';
  return tasks.length === 1 && gatewayReady(tasks[0], host.container.containerInstanceArn, hook.executionDetails.targetServiceRevisionArn, probe, intent, {}, gate.now())
    ? 'SUCCEEDED' : 'IN_PROGRESS';
}
