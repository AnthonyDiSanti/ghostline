import { AssociateAddressCommand, DescribeAddressesCommand } from '@aws-sdk/client-ec2';
import { UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { readiness } from './releases/gate.js';
import { bootstrapReady, daemonReady } from './releases/generation-proof.js';
import { slotAddresses } from './host-slot-model.js';
import type { AwsBlueGreen } from './releases/aws-blue-green.js';
import type { SlotInputs } from './releases/slot-stacks.js';
import { randomUUID } from 'node:crypto';

export interface Activation { id: string; started: number; release: string; stack?: string; phase: 'network' | 'host' | 'gateway' | 'complete' }

export async function activateHost(gate: AwsBlueGreen, outputs: Record<string, string>,
  beforeStart: () => Promise<void>, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<void> {
  const ready = await readiness(gate.registry);
  if (!ready.ready || !ready.current?.release.os.targetVersion) throw new Error('First activation requires a complete local release and selected OS.');
  const release = ready.current, os = release.release.os.targetVersion!;
  const initial = await Promise.all([gate.observer.read('a'), gate.observer.read('b')]);
  let journal = await gate.record<Activation>('activation/current');
  if (!journal || journal.phase === 'complete') {
    if (initial.some(s => s.instance || s.interface)) throw new Error('An existing host/network requires its original activation journal or explicit cleanup.');
    journal = { id: randomUUID(), started: gate.now(), release: release.digest, phase: 'network' };
    await gate.put('activation/current', journal);
  }
  if (journal.release !== release.digest || journal.stack && initial[0]?.stack?.id !== journal.stack) throw new Error('Interrupted activation identity changed; inspect before resuming.');
  if (initial.some(s => s.slot === 'b' && s.interface)) throw new Error('An unfinished second slot requires cleanup before activation.');
  const inputs: SlotInputs = { subnet: outputs.SubnetId!, security: outputs.SecurityGroupId!, profile: outputs.InstanceProfileName!, execution: outputs.NetworkExecutionRoleArn! };
  if (outputs.SlotProvisionerRoleArn !== gate.config.role) throw new Error('Slot provisioning authority differs from shared infrastructure.');
  const coherent = async () => {
    // First launch is deliberate deployment, not unexpected recovery: aliases must still match the selected local candidate.
    const current = await readiness(gate.registry);
    if (!current.ready || current.current?.digest !== release.digest) throw new Error('Release changed during first activation.');
  };
  const until = async <T>(name: string, read: () => Promise<T | undefined>): Promise<T> => {
    for (let n = 0; n < 360; n++) {
      const value = await read(); if (value !== undefined) return value;
      await wait(5_000);
    }
    throw new Error(`${name} remains pending; resume this activation without duplicating its resources.`);
  };
  if (journal.phase === 'network') await gate.stacks.ensure('a', 'network-only', os, inputs, `${journal.id}/network`, true);
  const network = await until('Host-slot network', async () => {
    const value = await gate.observer.read('a');
    if (value.stack?.status.endsWith('_FAILED') && journal!.phase === 'network') throw new Error('Host-slot creation failed; inspect the preserved CloudFormation resources before resuming.');
    // A failed host launch may retain a complete network; an explicit deploy resumes it with the newly reviewed template.
    return value.interface && ['CREATE_COMPLETE', 'UPDATE_COMPLETE', ...(journal!.phase !== 'network' ? ['UPDATE_FAILED', 'UPDATE_ROLLBACK_COMPLETE'] : [])].includes(value.stack?.status ?? '') ? value : undefined;
  });
  journal = { ...journal, stack: network.stack!.id, phase: journal.phase === 'network' ? 'host' : journal.phase };
  await gate.put('activation/current', journal);
  await coherent();
  const allocations = { xray: outputs.EipAllocationId!, awg: outputs.AwgEipAllocationId! };
  const binding = await gate.observer.addresses(Object.values(allocations));
  for (const protocol of ['xray', 'awg'] as const) {
    const current = binding[allocations[protocol]], ip = slotAddresses('a')[protocol];
    if (current && (current.networkInterfaceId !== network.interface || current.privateIpAddress !== ip)) throw new Error('Production address is already bound elsewhere.');
    if (!current) await gate.clients.ec2.send(new AssociateAddressCommand({ AllocationId: allocations[protocol], NetworkInterfaceId: network.interface,
      PrivateIpAddress: ip, AllowReassociation: false }));
  }
  // Readback precedes host launch so its native bootstrap/control/agent pulls have deterministic management reachability.
  const addresses = (await gate.clients.ec2.send(new DescribeAddressesCommand({ AllocationIds: Object.values(allocations) }))).Addresses;
  if (addresses?.length !== 2 || (['xray', 'awg'] as const).some(protocol => {
    const address = addresses.find(a => a.AllocationId === allocations[protocol]);
    return !address || address.NetworkInterfaceId !== network.interface || address.PrivateIpAddress !== slotAddresses('a')[protocol];
  })) throw new Error('First-activation address readback failed.');
  await gate.stacks.ensure('a', 'running', os, inputs, `${journal.id}/host`, true);
  await until('Bootstrap and cold network daemon', async () => {
    const host = await gate.observer.read('a');
    if (host.stack?.status.endsWith('_FAILED')) throw new Error('Host-slot launch failed; retain it for diagnosis.');
    if (!host.instance?.InstanceId || !host.container?.containerInstanceArn || !host.container.agentConnected || host.tasks.length !== 1) return undefined;
    const probe = await gate.probe.read(host.instance.InstanceId);
    return bootstrapReady(probe, release.release, {}) && daemonReady(host.tasks[0], host.container.containerInstanceArn, release.release, {}) ? host : undefined;
  });
  await coherent();
  journal = { ...journal, phase: 'gateway' }; await gate.put('activation/current', journal);
  // Remove the initial empty-service parameter while it is still empty; later IaC updates omit desiredCount entirely.
  await beforeStart();
  for (let attempt = 0; ; attempt++) {
    try {
      // Setting desiredCount is idempotent, unlike forceNewDeployment. A stale socket after CDK may lose its acknowledgement.
      await gate.clients.ecs.send(new UpdateServiceCommand({ cluster: gate.config.cluster, service: gate.config.service, desiredCount: 1 }));
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 2 || !['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(code ?? '')) throw error;
      await wait(1_000 * (attempt + 1));
      await coherent();
    }
  }
  await until('Fresh gateway generation', () => gate.generation());
  await gate.put('activation/current', { ...journal, phase: 'complete' });
}
