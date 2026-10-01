import { expect, it } from 'vitest';
import { activateHost, type Activation } from '../lib/host-slot-activation.js';
import type { AwsBlueGreen } from '../lib/releases/aws-blue-green.js';
import { artifacts, digest, releaseManifest, releaseRepository, repository, type Release } from '../lib/releases/model.js';

function fixture() {
  const hash = digest('artifact'), order: string[] = [], bindings: Record<string, any> = {};
  let journal: Activation | undefined, phase = 'absent', acknowledged = false, refuse = false;
  const startErrors: Error[] = [];
  const intent: Release = { schemaVersion: 3, promotionId: 'activation-test', promotedAt: '2026-09-28T00:00:00Z', origin: 'eu-west-1', platform: 'linux/arm64', history: [],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.66.0'], targetVersion: '1.66.0' },
    images: Object.fromEntries(artifacts.map(name => [name, { repository: repository(name), digest: hash, runtimeDigest: hash, buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'] };
  const manifest = releaseManifest(intent);
  const gate = { config: { role: 'role', cluster: 'cluster', service: 'gateway' }, now: () => 1000,
    registry: { get: async (repo: string) => ({ digest: repo === releaseRepository ? digest(manifest) : hash, manifest: repo === releaseRepository ? manifest : '{}', mediaType: 'application/vnd.oci.image.manifest.v1+json' }) },
    record: async () => journal, put: async (_id: string, value: Activation) => { journal = value; },
    stacks: { ensure: async (_slot: string, desired: string) => { order.push(desired); phase = desired; } },
    observer: {
      read: async (slot: string) => ({ slot, ...(slot === 'a' && phase !== 'absent' ? { interface: 'eni-a', stack: { id: 'stack-a', status: 'UPDATE_COMPLETE' },
        ...(phase === 'running' ? { instance: { InstanceId: 'host-a' }, container: { containerInstanceArn: 'container-a', agentConnected: true },
          tasks: [{ containerInstanceArn: 'container-a', lastStatus: 'RUNNING', desiredStatus: 'RUNNING', healthStatus: 'HEALTHY', containers: [{ name: 'network', lastStatus: 'RUNNING', imageDigest: hash }] }] } : {}) } : {}) }),
      addresses: async () => bindings,
    },
    probe: { read: async () => ({ bootId: 'current', bootstrap: { bootId: 'current', digest: hash }, version: '1.66.0', variant: 'aws-ecs-3', architecture: 'arm64' }) },
    clients: { ec2: { send: async (command: any) => {
      if (command.constructor.name === 'AssociateAddressCommand') {
        const input = command.input; order.push(`bind-${input.AllocationId}`); bindings[input.AllocationId] = { networkInterfaceId: input.NetworkInterfaceId, privateIpAddress: input.PrivateIpAddress };
        if (refuse) { refuse = false; throw new Error('Lost EIP acknowledgement'); }
        return {};
      }
      return { Addresses: Object.entries(bindings).map(([AllocationId, value]) => ({ AllocationId, NetworkInterfaceId: value.networkInterfaceId, PrivateIpAddress: value.privateIpAddress })) };
    } }, ecs: { send: async (command: any) => { order.push('gateway'); expect(acknowledged).toBe(true); expect(command.input).toEqual({ cluster: 'cluster', service: 'gateway', desiredCount: 1 });
      if (startErrors.length) throw startErrors.shift(); return {}; } } },
    generation: async () => { order.push('verify'); return {}; },
  } as unknown as AwsBlueGreen;
  const outputs = { SlotProvisionerRoleArn: 'role', EipAllocationId: 'xray', AwgEipAllocationId: 'awg', SubnetId: 'subnet', SecurityGroupId: 'security', InstanceProfileName: 'profile', NetworkExecutionRoleArn: 'execution' };
  return { order, startErrors, run: () => activateHost(gate, outputs, async () => { acknowledged = true; order.push('shared'); }, async () => {}),
    failBinding: () => { refuse = true; }, journal: () => journal, bindings };
}
it('establishes management before boot and cold daemon readiness before starting the gateway', async () => {
  const f = fixture(); await f.run();
  expect(f.order).toEqual(['network-only', 'bind-xray', 'bind-awg', 'running', 'shared', 'gateway', 'verify']);
  expect(f.journal()?.phase).toBe('complete');
});
it('retries only bounded transport failures of the idempotent desired count update', async () => {
  const f = fixture(); f.startErrors.push(Object.assign(new Error('lost acknowledgement'), { code: 'ECONNRESET' }));
  await f.run();
  expect(f.order.filter(step => step === 'gateway')).toHaveLength(2);
  expect(f.journal()?.phase).toBe('complete');
  const denied = fixture(); denied.startErrors.push(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }));
  await expect(denied.run()).rejects.toThrow('denied');
  expect(denied.order.filter(step => step === 'gateway')).toHaveLength(1);
  const unavailable = fixture();
  unavailable.startErrors.push(...Array.from({ length: 3 }, () => Object.assign(new Error('reset'), { code: 'ECONNRESET' })));
  await expect(unavailable.run()).rejects.toThrow('reset');
  expect(unavailable.order.filter(step => step === 'gateway')).toHaveLength(3);
});
it('resumes after a lost EIP acknowledgement without allocating or reassigning the completed binding', async () => {
  const f = fixture(); f.failBinding(); await expect(f.run()).rejects.toThrow('Lost EIP');
  expect(f.journal()?.phase).toBe('host'); await f.run();
  expect(f.order.filter(step => step === 'network-only')).toHaveLength(1);
  expect(f.order.filter(step => step === 'bind-xray')).toHaveLength(1);
  expect(f.journal()?.phase).toBe('complete');
});
it('refuses a production EIP already moved onto an unrecorded interface', async () => {
  const f = fixture(); f.bindings.xray = { networkInterfaceId: 'unowned', privateIpAddress: '10.79.0.11' };
  await expect(f.run()).rejects.toThrow('already bound elsewhere');
  expect(f.order).not.toContain('running');
});
