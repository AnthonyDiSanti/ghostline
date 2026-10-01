import type { Task } from '@aws-sdk/client-ecs';
import type { HostObservation } from '../platform-observation.js';
import type { Release } from './model.js';
import { componentMatches } from './runtime-identity.js';
import { applicationArtifacts } from '../image-artifacts.js';
import type { Generation } from './blue-green.js';
import type { StackObservation } from './runtime-identity.js';

export function qualificationObservation(generation: Generation): StackObservation {
  // Only a generation already verified against fresh host/task/forwarding observations can close central qualification.
  return { mode: 'active', host: { id: generation.instance, state: 'running', bootId: generation.boot, version: generation.os, variant: 'aws-ecs-3', architecture: 'arm64' },
    bootstrap: { bootId: generation.boot, digest: generation.images.bootstrap! },
    daemon: { stable: true, digest: generation.images['network-daemon'] }, gateway: { desired: 1, stable: true, images: generation.images } };
}

export function bootstrapReady(probe: HostObservation | undefined, intent: Release, resolved: Record<string, string>): boolean {
  // Compare the boot actually observed to centrally qualified intent, never to a mutable tag alone.
  return !!probe && probe.bootstrap?.bootId === probe.bootId && probe.version === intent.os.targetVersion
    && probe.variant === intent.os.variant && probe.architecture === intent.os.architecture
    && componentMatches(intent.images.bootstrap, probe.bootstrap.digest, resolved);
}

export function daemonReady(task: Task | undefined, containerInstance: string, intent: Release, resolved: Record<string, string>): boolean {
  // A cold daemon need not have engines, but it must be healthy on the selected host with the intended bytes.
  const container = task?.containers?.find(c => c.name === 'network');
  return !!task && task.containerInstanceArn === containerInstance && task.lastStatus === 'RUNNING' && task.desiredStatus === 'RUNNING'
    && task.healthStatus === 'HEALTHY' && container?.lastStatus === 'RUNNING'
    && componentMatches(intent.images['network-daemon'], container.imageDigest, resolved);
}

export function gatewayReady(task: Task | undefined, containerInstance: string, revision: string, probe: HostObservation | undefined,
  intent: Release, resolved: Record<string, string>, now: number): boolean {
  // ECS task health does not prove initializer success, exact engine identity, or daemon forwarding leases.
  if (!task || task.lastStatus !== 'RUNNING' || task.desiredStatus !== 'RUNNING' || task.containerInstanceArn !== containerInstance
    || task.startedBy !== `ecs-svc/${revision.split('/').at(-1)}` || !task.startedAt || now - task.startedAt.getTime() < 15_000
    || !probe?.network?.healthy || Object.keys(probe.network.peers).length !== 2) return false;
  for (const name of applicationArtifacts) {
    const matches = task.containers?.filter(c => c.name === name) ?? [];
    if (matches.length !== 1) return false;
    const container = matches[0]!;
    if (!componentMatches(intent.images[name], container.imageDigest, resolved)) return false;
    if (name === 'gateway-config') {
      if (container.lastStatus !== 'STOPPED' || container.exitCode !== 0) return false;
    } else {
      const peer = probe.network.peers[name];
      if (container.lastStatus !== 'RUNNING' || container.healthStatus === 'UNHEALTHY'
        || !peer || peer.task !== task.taskArn || peer.id !== container.runtimeId) return false;
    }
  }
  return true;
}

export function failedRuntimeEvidence(instanceState: string | undefined, agentConnected: boolean | undefined,
  daemonHealthy: boolean, gatewayTasks: Task[], probe: HostObservation | undefined, ready: boolean): boolean {
  // A dead host/agent/task can also remove SSM. Count independently confirmed failure without requiring the failed observer to answer.
  if (instanceState !== undefined && instanceState !== 'running' || agentConnected === false || !daemonHealthy) return true;
  if (gatewayTasks.length !== 1 || gatewayTasks[0]?.lastStatus !== 'RUNNING' || gatewayTasks[0]?.desiredStatus !== 'RUNNING'
    || gatewayTasks[0]?.healthStatus === 'UNHEALTHY') return true;
  if (gatewayTasks[0].containers?.some(c => ['xray', 'awg'].includes(c.name ?? '')
    && (c.lastStatus !== 'RUNNING' || c.healthStatus === 'UNHEALTHY'))) return true;
  // Only missing SSM, with otherwise healthy EC2/ECS observations, remains uncertainty rather than an invented failure.
  return !!probe && !ready;
}
