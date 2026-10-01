import { expect, it } from 'vitest';
import type { Task } from '@aws-sdk/client-ecs';
import { failedRuntimeEvidence, bootstrapReady, daemonReady, gatewayReady } from '../lib/releases/generation-proof.js';
import { artifacts, repository, type Release } from '../lib/releases/model.js';
import type { HostObservation } from '../lib/platform-observation.js';

function fixture() {
  // Observed runtime identities are independent of the repository's mutable production aliases.
  const digest = `sha256:${'a'.repeat(64)}`;
  const intent: Release = { schemaVersion: 3, promotionId: 'qualified-release', origin: 'us-east-1', promotedAt: '2026-09-28T00:00:00Z',
    platform: 'linux/arm64', history: [], os: { variant: 'aws-ecs-3', architecture: 'arm64', targetVersion: '1.66.0', compatibleVersions: ['1.66.0'] },
    images: Object.fromEntries(artifacts.map(name => [name, { repository: repository(name), digest, runtimeDigest: digest, buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'] };
  const host: HostObservation = { bootId: 'this-boot', bootstrap: { bootId: 'this-boot', digest }, version: '1.66.0', variant: 'aws-ecs-3', architecture: 'arm64',
    network: { healthy: true, peers: Object.fromEntries(['xray', 'awg'].map(name => [name, { id: `${name}-runtime`, ip: '172.17.0.2', task: 'task/green', started: '2026-09-28T00:00:00Z', restarts: 0 }])) } };
  const task: Task = { taskArn: 'task/green', containerInstanceArn: 'host/green', startedBy: 'ecs-svc/green', lastStatus: 'RUNNING', desiredStatus: 'RUNNING', startedAt: new Date(0),
    containers: ['gateway-config', 'xray', 'awg'].map(name => ({ name, runtimeId: `${name}-runtime`, imageDigest: digest,
      lastStatus: name === 'gateway-config' ? 'STOPPED' : 'RUNNING', ...(name === 'gateway-config' ? { exitCode: 0 } : {}) })) };
  const ready = () => gatewayReady(task, 'host/green', 'revision/green', host, intent, {}, 20_000);
  return { digest, intent, host, task, ready };
}

it('requires the current boot and centrally selected OS, even if another version is compatible', () => {
  const f = fixture(); expect(bootstrapReady(f.host, f.intent, {})).toBe(true);
  f.host.bootstrap!.bootId = 'previous-boot'; expect(bootstrapReady(f.host, f.intent, {})).toBe(false);
  f.host.bootstrap!.bootId = f.host.bootId; f.intent.os.compatibleVersions.push('1.67.0'); f.host.version = '1.67.0';
  expect(bootstrapReady(f.host, f.intent, {})).toBe(false);
});
it('accepts a healthy cold daemon only on the expected container instance', () => {
  const f = fixture(); const task: Task = { containerInstanceArn: 'host/green', lastStatus: 'RUNNING', desiredStatus: 'RUNNING', healthStatus: 'HEALTHY',
    containers: [{ name: 'network', lastStatus: 'RUNNING', imageDigest: f.digest }] };
  expect(daemonReady(task, 'host/green', f.intent, {})).toBe(true);
  expect(daemonReady(task, 'host/blue', f.intent, {})).toBe(false);
  task.desiredStatus = 'STOPPED'; expect(daemonReady(task, 'host/green', f.intent, {})).toBe(false);
});
it('requires initializer success and both exact daemon-validated engines', () => {
  const f = fixture(); expect(f.ready()).toBe(true);
  f.task.containers![0]!.exitCode = 1; expect(f.ready()).toBe(false);
  f.task.containers![0]!.exitCode = 0; f.host.network!.peers.awg!.id = 'old-container'; expect(f.ready()).toBe(false);
  f.host.network!.peers.awg!.id = 'awg-runtime'; f.host.network!.healthy = false; expect(f.ready()).toBe(false);
});
it('rejects a healthy task belonging to the other native revision or host', () => {
  const f = fixture(); f.task.startedBy = 'ecs-svc/blue'; expect(f.ready()).toBe(false);
  f.task.startedBy = 'ecs-svc/green'; f.task.containerInstanceArn = 'host/blue'; expect(f.ready()).toBe(false);
});
it('rejects duplicated, absent or freshly started containers and mismatched executable bytes', () => {
  const f = fixture(); f.task.containers!.push({ ...f.task.containers![1]! }); expect(f.ready()).toBe(false);
  f.task.containers!.pop(); f.task.startedAt = new Date(19_000); expect(f.ready()).toBe(false);
  f.task.startedAt = new Date(0); f.task.containers![1]!.imageDigest = `sha256:${'b'.repeat(64)}`; expect(f.ready()).toBe(false);
});

it('detects independently confirmed host or task failure even when SSM cannot answer', () => {
  const tasks: any[] = [{ lastStatus: 'RUNNING', desiredStatus: 'RUNNING', containers: [{ name: 'xray', lastStatus: 'RUNNING' }] }];
  expect(failedRuntimeEvidence('stopped', false, true, tasks, undefined, false)).toBe(true);
  expect(failedRuntimeEvidence('running', false, true, tasks, undefined, false)).toBe(true);
  expect(failedRuntimeEvidence('running', true, false, tasks, undefined, false)).toBe(true);
  expect(failedRuntimeEvidence('running', true, true, [], undefined, false)).toBe(true);
  expect(failedRuntimeEvidence('running', true, true, [{ ...tasks[0], healthStatus: 'UNHEALTHY' }], undefined, false)).toBe(true);
});
it('does not turn missing SSM alone into a negative runtime observation', () => {
  const tasks: any[] = [{ lastStatus: 'RUNNING', desiredStatus: 'RUNNING' }];
  expect(failedRuntimeEvidence('running', true, true, tasks, undefined, false)).toBe(false);
});
