import type { DeploymentConfig } from './config.js';
import { daemonServiceName, hostSlots, slotAddresses, slotStackName, type HostSlot } from './host-slot-model.js';

export type MetadataCall = (args: string[]) => any;
export interface RegionalHost { slot: HostSlot; stackId: string; stackName: string; status: string; instance?: string; interface?: string; daemon?: string }
export function regionalHosts(config: DeploymentConfig, aws: MetadataCall): RegionalHost[] {
  // Exact stack identities, not arbitrary instances sharing a Project tag, define the complete regional host inventory.
  const stacks = aws(['cloudformation', 'describe-stacks']).Stacks;
  if (!Array.isArray(stacks)) throw new Error('Regional stack inventory is unavailable.');
  return hostSlots.flatMap(slot => {
    const stackName = slotStackName(config.stackName, slot);
    const matches = stacks.filter((s: any) => s.StackName === stackName && s.StackStatus !== 'DELETE_COMPLETE');
    if (!matches.length) return [];
    const stack = matches[0];
    if (matches.length !== 1 || !stack.StackId?.startsWith(`arn:aws:cloudformation:${config.region}:${config.account}:stack/${stackName}/`)
      || Object.entries(config.globalTags).some(([k, v]) => !stack.Tags?.some((t: any) => t.Key === k && t.Value === v))) throw new Error('Host-slot stack ownership mismatch.');
    const resources = aws(['cloudformation', 'list-stack-resources', '--stack-name', stack.StackId]).StackResourceSummaries;
    if (!Array.isArray(resources)) throw new Error('Host-slot resource inventory is unavailable.');
    const physical = (logical: string) => resources.find((r: any) => r.LogicalResourceId === logical && r.ResourceStatus !== 'DELETE_COMPLETE')?.PhysicalResourceId;
    const instance = physical('Instance'), network = physical('NetworkInterface'), daemon = physical('NetworkService');
    if (instance && !/^i-[a-f0-9]{17}$/.test(instance) || network && !/^eni-[a-f0-9]{17}$/.test(network)
      || daemon && daemon !== `arn:aws:ecs:${config.region}:${config.account}:service/${config.resourceName}/${daemonServiceName(config.resourceName, slot)}`) {
      throw new Error('Host-slot resource identity mismatch.');
    }
    return [{ slot, stackId: stack.StackId, stackName, status: stack.StackStatus, instance, interface: network,
      ...(daemon ? { daemon: daemonServiceName(config.resourceName, slot) } : {}) }];
  });
}
export function regionalOutputs(config: DeploymentConfig, outputs: Record<string, string>, aws: MetadataCall): Record<string, string> {
  if (!outputs.ClusterName) return outputs; // Park retains only allocations and credential storage.
  if (outputs.InstanceId) throw new Error('Shared endpoint outputs must not own a host; resolve the regional host slots.');
  const hosts = regionalHosts(config, aws);
  if (!hosts.some(h => h.instance)) return outputs;
  const allocations = [outputs.EipAllocationId, outputs.AwgEipAllocationId];
  if (allocations.some(a => !a)) throw new Error('Production address coordinates are missing.');
  const addresses = aws(['ec2', 'describe-addresses', '--allocation-ids', ...allocations as string[]]).Addresses;
  if (addresses?.length !== 2) throw new Error('Production address observation is incomplete.');
  const selected = hosts.filter(host => host.instance && (['xray', 'awg'] as const).every((protocol, i) => {
    const binding = addresses.find((a: any) => a.AllocationId === allocations[i]);
    return binding?.NetworkInterfaceId === host.interface && binding.PrivateIpAddress === slotAddresses(host.slot)[protocol];
  }));
  if (selected.length !== 1) throw new Error('Production handoff is incomplete; inspect release status before targeting a host.');
  const host = selected[0]!;
  return { ...outputs, InstanceId: host.instance!, NetworkInterfaceId: host.interface!, HostStackName: host.stackName,
    HostStackId: host.stackId, HostSlot: host.slot, NetworkDaemonServiceName: host.daemon!,
    XrayPrivateIp: slotAddresses(host.slot).xray, AwgPrivateIp: slotAddresses(host.slot).awg };
}
