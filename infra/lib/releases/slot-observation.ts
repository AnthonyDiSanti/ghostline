import { DescribeInstancesCommand, DescribeNetworkInterfacesCommand, DescribeAddressesCommand, type EC2Client, type Instance } from '@aws-sdk/client-ec2';
import { DescribeContainerInstancesCommand, ListContainerInstancesCommand, type ContainerInstance, type ECSClient, type Task } from '@aws-sdk/client-ecs';
import { daemonServiceName, slotAddresses, type HostSlot } from '../host-slot-model.js';
import { readServiceTasks } from './ecs-observation.js';
import type { OwnedStack, SlotStacks } from './slot-stacks.js';
import type { AddressObservation } from './eip-handoff.js';
import { isIPv4 } from 'node:net';

export interface SlotObservation {
  slot: HostSlot; stack?: OwnedStack; interface?: string; instance?: Instance; container?: ContainerInstance; tasks: Task[];
}
export interface SlotReadClients { ec2: Pick<EC2Client, 'send'>; ecs: Pick<ECSClient, 'send'> }
export class SlotObserver {
  constructor(readonly stacks: SlotStacks, readonly cluster: string, readonly clients: SlotReadClients) {}
  async read(slot: HostSlot): Promise<SlotObservation> {
    const stack = await this.stacks.observe(slot);
    const found: SlotObservation = { slot, stack, tasks: [] };
    if (!stack) return found;
    // Outputs lag during partial/failed creation. Physical resource inventory still finds a host that must be drained safely.
    const nic = stack.resources.NetworkInterface;
    if (nic) {
      const result = await this.clients.ec2.send(new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [nic] }));
      const network = result.NetworkInterfaces?.[0];
      const expected = Object.values(slotAddresses(slot));
      if (result.NetworkInterfaces?.length !== 1 || network?.NetworkInterfaceId !== nic || network.OwnerId !== this.stacks.config.account
        || !network.TagSet?.some(t => t.Key === 'aws:cloudformation:stack-id' && t.Value === stack.id)
        || network.PrivateIpAddresses?.length !== 2 || expected.some(ip => !network.PrivateIpAddresses?.some(p => p.PrivateIpAddress === ip))) {
        throw new Error('Host-slot interface ownership/address identity changed.');
      }
      found.interface = nic;
    }
    const host = stack.resources.Instance;
    if (!host) return found;
    const result = await this.clients.ec2.send(new DescribeInstancesCommand({ InstanceIds: [host] }));
    const instances = result.Reservations?.flatMap(r => r.Instances ?? []) ?? [];
    const instance = instances[0];
    // EC2 removes the ENI before CloudFormation finishes deleting its Instance resource. Keep the terminal host visible until CFN catches up.
    const terminating = ['shutting-down', 'terminated'].includes(instance?.State?.Name ?? '') && stack.status.endsWith('_IN_PROGRESS');
    if (instances.length !== 1 || instance?.InstanceId !== host || !instance.Tags?.some(t => t.Key === 'aws:cloudformation:stack-id' && t.Value === stack.id)
      || !terminating && !instance.NetworkInterfaces?.some(n => n.NetworkInterfaceId === nic)) throw new Error('Host-slot instance ownership changed.');
    found.instance = instance;
    if (terminating) return found;
    const arns: string[] = [];
    for (const status of ['ACTIVE', 'DRAINING'] as const) {
      let nextToken: string | undefined;
      do {
        const page = await this.clients.ecs.send(new ListContainerInstancesCommand({ cluster: this.cluster, status,
          filter: `ec2InstanceId == ${host}`, nextToken }));
        arns.push(...page.containerInstanceArns ?? []); nextToken = page.nextToken;
      } while (nextToken);
    }
    if (arns.length) {
      const detail = await this.clients.ecs.send(new DescribeContainerInstancesCommand({ cluster: this.cluster, containerInstances: arns }));
      if (detail.failures?.length || detail.containerInstances?.length !== 1 || detail.containerInstances[0]?.ec2InstanceId !== host
        || !detail.containerInstances[0].attributes?.some(a => a.name === 'ghostline_slot' && a.value === slot)) {
        throw new Error('Ambiguous or mismatched ECS host-slot registration.');
      }
      found.container = detail.containerInstances[0];
    }
    // After explicit deregistration, stopped EC2 proves there are no processes despite stale ECS task status from its offline agent.
    if (instance.State?.Name === 'stopped' && !found.container) return found;
    // A fresh running stack owns exactly one daemon service. A disappearing host is observed again before declaring it absent.
    if (stack.resources.NetworkService) {
      const expected = daemonServiceName(this.cluster, slot);
      if (stack.resources.NetworkService !== `arn:aws:ecs:${this.stacks.config.region}:${this.stacks.config.account}:service/${this.cluster}/${expected}`) throw new Error('Unexpected daemon service ownership.');
      found.tasks = await readServiceTasks(this.clients.ecs, this.cluster, expected);
      if (found.tasks.some(t => t.containerInstanceArn !== found.container?.containerInstanceArn)) throw new Error('Daemon task escaped its recorded host slot.');
    }
    return found;
  }
  async addresses(allocations: string[]): Promise<AddressObservation> {
    if (!allocations.length) return {};
    const result = await this.clients.ec2.send(new DescribeAddressesCommand({ AllocationIds: allocations }));
    if (result.Addresses?.length !== allocations.length || new Set(allocations).size !== allocations.length) throw new Error('Incomplete address inventory.');
    return Object.fromEntries(result.Addresses.map(a => {
      if (!a.AllocationId || !allocations.includes(a.AllocationId)) throw new Error('Unexpected address identity.');
      if (!a.AssociationId && (a.NetworkInterfaceId || a.PrivateIpAddress)) throw new Error('Ambiguous address binding.');
      if (a.AssociationId && (!a.NetworkInterfaceId || !a.PrivateIpAddress)) throw new Error('Incomplete address binding.');
      return [a.AllocationId, a.AssociationId ? { associationId: a.AssociationId, networkInterfaceId: a.NetworkInterfaceId!, privateIpAddress: a.PrivateIpAddress! } : undefined];
    }));
  }
  async temporary(stack: OwnedStack | undefined): Promise<Partial<Record<'xray' | 'awg', string>>> {
    const result: Partial<Record<'xray' | 'awg', string>> = {};
    if (!stack) return result;
    for (const protocol of ['xray', 'awg'] as const) {
      const physical = stack.resources[`${protocol}Address`];
      if (!physical) continue;
      // EIP's CloudFormation physical ID is its public IPv4 address, even when stack outputs have not materialized.
      if (!isIPv4(physical)) throw new Error('Unexpected temporary-address physical identity.');
      const response = await this.clients.ec2.send(new DescribeAddressesCommand({ PublicIps: [physical] }));
      const address = response.Addresses?.[0];
      if (response.Addresses?.length !== 1 || address?.PublicIp !== physical || !address.AllocationId
        || !address.Tags?.some(t => t.Key === 'aws:cloudformation:stack-id' && t.Value === stack.id)) throw new Error('Temporary-address ownership changed.');
      result[protocol] = address.AllocationId;
    }
    return result;
  }
}
