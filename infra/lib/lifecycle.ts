import type { DeploymentConfig } from './config.js';

export interface ReleaseRecord {
  account: string;
  region: string;
  stackId: string;
  allocations: string[];
}
export type AwsMetadata = (args: string[]) => any;

export function captureRelease(config: DeploymentConfig, stack: any, resources: any[]): ReleaseRecord {
  // Capture CloudFormation-owned allocations before deleting the stack, never from a regional tag search.
  const prefix = `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/`;
  if (!stack.StackId?.startsWith(prefix) || !['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus)) {
    throw new Error('Release requires a stable stack in the selected account and region.');
  }
  const addresses = resources.filter(r => r.ResourceType === 'AWS::EC2::EIP').map(r => r.PhysicalResourceId);
  const outputs = Object.fromEntries((stack.Outputs ?? []).map((item: any) => [item.OutputKey, item.OutputValue]));
  // EIP PhysicalResourceId is the public IPv4, not the allocation ID; cross-check the two live views.
  const pairs = [['EndpointIp', 'EipAllocationId'], ...(config.runtime ? [['AwgEndpointIp', 'AwgEipAllocationId']] : [])];
  const allocations = pairs.map(([, allocation]) => outputs[allocation!]);
  if (addresses.length !== pairs.length || pairs.some(([ip]) => !addresses.includes(outputs[ip!]))
    || new Set(addresses).size !== addresses.length || new Set(allocations).size !== allocations.length
    || allocations.some(id => typeof id !== 'string')
    || allocations.some(id => !/^eipalloc-[a-f0-9]+$/.test(id))) throw new Error('Unexpected stack address inventory.');
  return { account: config.account, region: config.region, stackId: stack.StackId, allocations };
}

export function releaseAfterDeletion(config: DeploymentConfig, record: ReleaseRecord, aws: AwsMetadata) {
  // A persisted record supports retry after partial release, but live ownership is always revalidated.
  const prefix = `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/`;
  if (record.account !== config.account || record.region !== config.region || !record.stackId.startsWith(prefix)
    || !record.allocations.length || record.allocations.some(id => !/^eipalloc-[a-f0-9]+$/.test(id))) {
    throw new Error('Release record does not belong to the selected deployment.');
  }
  const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', record.stackId]).Stacks[0];
  if (stack.StackStatus !== 'DELETE_COMPLETE') throw new Error('Stack deletion must finish before releasing addresses.');
  const addresses = aws(['ec2', 'describe-addresses']).Addresses.filter((address: any) => record.allocations.includes(address.AllocationId));
  // Validate the entire remaining set before releasing any; never disassociate an unexpectedly reused IP.
  for (const address of addresses) {
    const tags = Object.fromEntries((address.Tags ?? []).map((tag: any) => [tag.Key, tag.Value]));
    if (address.AssociationId || address.NetworkInterfaceId || tags['aws:cloudformation:stack-id'] !== record.stackId
      || Object.entries(config.globalTags).some(([key, value]) => tags[key] !== value)) {
      throw new Error('Retained address ownership changed or address is still attached; refusing release.');
    }
  }
  for (const address of addresses) aws(['ec2', 'release-address', '--allocation-id', address.AllocationId]);
  if (aws(['ec2', 'describe-addresses']).Addresses.some((address: any) => record.allocations.includes(address.AllocationId))) {
    throw new Error('An address remains allocated; retry destroy with the saved release record.');
  }
}
