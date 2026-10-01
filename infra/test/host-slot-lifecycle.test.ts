import { expect, it, vi } from 'vitest';
import { assertNativeDeploymentSettled, removeRegionalHosts, stopRegionalHosts } from '../lib/host-slot-lifecycle.js';
import { getDeployment } from '../lib/config.js';
import { slotStackName, transitionAddressStackName } from '../lib/host-slot-model.js';

function fixture() {
  const config = getDeployment('stockholm-ecs');
  const name = slotStackName(config.stackName, 'a');
  const stack = { StackName: name, StackId: `arn:aws:cloudformation:${config.region}:${config.account}:stack/${name}/generation`, StackStatus: 'UPDATE_COMPLETE',
    Tags: Object.entries(config.globalTags).map(([Key, Value]) => ({ Key, Value })) };
  let stacks: any[] = [stack], resources: any[] = [], addresses: any[] = [];
  const aws = vi.fn((args: string[]): any => {
    const operation = args.slice(0, 2).join(' ');
    switch (operation) {
      case 'cloudformation describe-stacks': return { Stacks: stacks };
      case 'cloudformation list-stack-resources': return { StackResourceSummaries: resources };
      case 'ecs describe-clusters': return { clusters: [], failures: [{ reason: 'MISSING' }] };
      case 'ec2 describe-instances': return { Reservations: [{ Instances: [{ State: { Name: 'running' }, Tags: [{ Key: 'aws:cloudformation:stack-id', Value: stack.StackId }] }] }] };
      case 'ec2 describe-addresses': return { Addresses: addresses };
      case 'cloudformation delete-stack': stacks = stacks.filter(s => s.StackId !== args[3]); return {};
      case 'cloudformation wait': case 'ec2 stop-instances': case 'ec2 wait': return {};
      default: throw new Error(`Unexpected effect ${operation}`);
    }
  });
  return { config, stack, aws, resources, addresses, stacks };
}
it('deletes an already empty retired slot without recreating network resources', () => {
  const f = fixture(); removeRegionalHosts(f.config, {}, f.aws);
  expect(f.aws.mock.calls.some(([args]) => args[1] === 'update-stack')).toBe(false);
  expect(f.aws).toHaveBeenCalledWith(['cloudformation', 'delete-stack', '--stack-name', f.stack.StackId]);
  f.aws.mockClear(); removeRegionalHosts(f.config, {}, f.aws);
  expect(f.aws.mock.calls.some(([args]) => args[1] === 'delete-stack')).toBe(false);
});
it('uses exact-owner stopped EC2 evidence if the shared cluster has already disappeared', () => {
  const f = fixture(); const host = `i-${'a'.repeat(17)}`;
  f.resources.push({ LogicalResourceId: 'Instance', PhysicalResourceId: host, ResourceStatus: 'CREATE_COMPLETE' });
  expect(stopRegionalHosts(f.config, {}, f.aws)).toBe(false);
  expect(f.aws).toHaveBeenCalledWith(['ec2', 'stop-instances', '--instance-ids', host]);
  expect(f.aws).toHaveBeenCalledWith(['ec2', 'wait', 'instance-stopped', '--instance-ids', host]);
  expect(f.aws.mock.calls.some(([args]) => args[1] === 'disassociate-address')).toBe(false);
});
it('refuses to delete a temporary allocation stack while an address has been reused', () => {
  const f = fixture(); const name = transitionAddressStackName(f.config.stackName);
  f.stacks.push({ ...f.stack, StackName: name, StackId: `arn:aws:cloudformation:${f.config.region}:${f.config.account}:stack/${name}/temporary` });
  f.addresses.push({ AssociationId: 'association', NetworkInterfaceId: 'unrelated' });
  expect(() => removeRegionalHosts(f.config, {}, f.aws)).toThrow('still attached');
  expect(f.aws.mock.calls.filter(([args]) => args[1] === 'delete-stack')).toHaveLength(1);
});

it('refuses unfinished native deployments through read-only preflight instead of the unsupported ABORT API', () => {
  const config = getDeployment('stockholm-ecs');
  const prefix = `arn:aws:ecs:${config.region}:${config.account}:service-deployment/${config.resourceName}/${config.resourceName}-gateway/`;
  let status = 'IN_PROGRESS';
  const aws = vi.fn((args: string[]): any => {
    switch (args.slice(0, 2).join(' ')) {
      case 'ecs describe-clusters': return { clusters: [{ status: 'ACTIVE' }] };
      case 'ecs describe-services': return { services: [{ status: 'ACTIVE' }] };
      case 'ecs list-service-deployments': return { serviceDeployments: [{ serviceDeploymentArn: prefix + 'deployment', status }] };
      default: throw new Error('Preflight attempted a mutation');
    }
  });
  for (status of ['PENDING', 'IN_PROGRESS', 'ROLLBACK_IN_PROGRESS', 'ROLLBACK_REQUESTED', 'STOP_REQUESTED', 'UNKNOWN']) {
    expect(() => assertNativeDeploymentSettled(config, aws)).toThrow('unfinished');
  }
  for (status of ['SUCCESSFUL', 'ROLLBACK_SUCCESSFUL', 'ROLLBACK_FAILED', 'STOPPED']) {
    expect(() => assertNativeDeploymentSettled(config, aws)).not.toThrow();
  }
});
it('tolerates confirmed absent ECS infrastructure but rejects unreadable preflight inventory', () => {
  const config = getDeployment('stockholm-ecs');
  expect(() => assertNativeDeploymentSettled(config, () => ({ clusters: [], failures: [{ reason: 'MISSING' }] }))).not.toThrow();
  expect(() => assertNativeDeploymentSettled(config, () => ({}))).toThrow('unavailable');
  expect(() => assertNativeDeploymentSettled(config, () => ({ clusters: [], failures: [{ reason: 'ACCESS_DENIED' }] }))).toThrow('unavailable');
});
