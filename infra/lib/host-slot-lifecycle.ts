import type { DeploymentConfig } from './config.js';
import { setEcsPower, prepareEcsRemoval } from './ecs-power.js';
import { regionalHosts, type MetadataCall, type RegionalHost } from './regional-hosts.js';
import { transitionAddressStackName } from './host-slot-model.js';

export function assertNativeDeploymentSettled(config: DeploymentConfig, aws: MetadataCall): void {
  // Stop/park/destroy must not strand a native traffic hook by changing power intent or freezing its controller.
  const clusters = aws(['ecs', 'describe-clusters', '--clusters', config.resourceName]);
  if (!Array.isArray(clusters.clusters) || clusters.failures?.some((f: any) => f.reason !== 'MISSING')) throw new Error('Cluster observation is unavailable.');
  if (!clusters.clusters.some((c: any) => c.status === 'ACTIVE')) return;
  const name = `${config.resourceName}-gateway`;
  const services = aws(['ecs', 'describe-services', '--cluster', config.resourceName, '--services', name]);
  if (!Array.isArray(services.services) || services.failures?.some((f: any) => f.reason !== 'MISSING')) throw new Error('Gateway observation is unavailable.');
  if (!services.services.some((s: any) => s.status === 'ACTIVE')) return;
  const deployments = aws(['ecs', 'list-service-deployments', '--cluster', config.resourceName, '--service', name]).serviceDeployments;
  if (!Array.isArray(deployments)) throw new Error('Native deployment inventory is unavailable.');
  const prefix = `arn:aws:ecs:${config.region}:${config.account}:service-deployment/${config.resourceName}/${name}/`;
  for (const deployment of deployments) {
    if (!deployment.serviceDeploymentArn?.startsWith(prefix)) throw new Error('Unexpected native deployment ownership.');
    // AWS explicitly rejects ABORT. Diagnose/request native rollback while the controller is active, then retry power changes.
    if (!['SUCCESSFUL', 'ROLLBACK_SUCCESSFUL', 'ROLLBACK_FAILED', 'STOPPED'].includes(deployment.status)) {
      throw new Error('A native deployment is unfinished. Let it finish or resolve its rollback before stop, park or destroy.');
    }
  }
}

export function stopRegionalHosts(config: DeploymentConfig, outputs: Record<string, string>, aws: MetadataCall): boolean {
  const hosts = regionalHosts(config, aws);
  const allowed = hosts.flatMap(h => h.instance ? [h.instance] : []);
  const clusters = aws(['ecs', 'describe-clusters', '--clusters', config.resourceName]);
  if (!Array.isArray(clusters.clusters) || clusters.failures?.some((failure: any) => failure.reason !== 'MISSING')) throw new Error('Cluster observation is unavailable.');
  const cluster = clusters.clusters?.find((value: any) => value.status === 'ACTIVE');
  if (!cluster) {
    // A partially deleted root has no ECS authority left. Stopped EC2 is then the authoritative proof that all host processes ended.
    for (const host of hosts) if (host.instance) {
      const actual = aws(['ec2', 'describe-instances', '--instance-ids', host.instance]).Reservations?.flatMap((r: any) => r.Instances ?? []);
      if (actual?.length !== 1 || !actual[0].Tags?.some((tag: any) => tag.Key === 'aws:cloudformation:stack-id' && tag.Value === host.stackId)) throw new Error('Orphan host ownership mismatch.');
      if (!['stopped', 'stopping', 'running', 'pending'].includes(actual[0].State?.Name)) throw new Error('Unexpected orphan host state.');
      if (actual[0].State.Name === 'pending') aws(['ec2', 'wait', 'instance-running', '--instance-ids', host.instance]);
      if (!['stopped', 'stopping'].includes(actual[0].State.Name)) aws(['ec2', 'stop-instances', '--instance-ids', host.instance]);
      aws(['ec2', 'wait', 'instance-stopped', '--instance-ids', host.instance]);
    }
    return false;
  }
  if (cluster.clusterArn !== `arn:aws:ecs:${config.region}:${config.account}:cluster/${config.resourceName}`) throw new Error('Unexpected cluster identity.');
  const services = aws(['ecs', 'describe-services', '--cluster', config.resourceName, '--services', `${config.resourceName}-gateway`]);
  if (services.failures?.some((failure: any) => failure.reason !== 'MISSING')) throw new Error('Gateway observation is unavailable.');
  const gateway = services.services?.find((value: any) => value.status === 'ACTIVE');
  if (!gateway && !allowed.length) return true;
  assertNativeDeploymentSettled(config, aws);
  for (const host of hosts) if (host.instance) {
    setEcsPower('stop', host.stackName, { ...outputs, InstanceId: host.instance, HostStackName: host.stackName,
      ClusterName: config.resourceName, GatewayServiceName: gateway ? `${config.resourceName}-gateway` : '', NetworkDaemonServiceName: host.daemon ?? '' }, aws, allowed);
  }
  if (!allowed.length) {
    // Initial provisioning can fail before any host exists while ECS still has desired tasks waiting for capacity.
    aws(['ecs', 'update-service', '--cluster', config.resourceName, '--service', `${config.resourceName}-gateway`, '--desired-count', '0']);
    aws(['ecs', 'wait', 'services-stable', '--cluster', config.resourceName, '--services', `${config.resourceName}-gateway`]);
  }
  return true;
}

function phase(host: RegionalHost, value: 'network-only' | 'absent', aws: MetadataCall) {
  let actual = aws(['cloudformation', 'describe-stacks', '--stack-name', host.stackId]).Stacks?.[0];
  if (!actual || actual.StackId !== host.stackId) throw new Error('Slot stack identity changed during removal.');
  if (actual.StackStatus.endsWith('_IN_PROGRESS')) {
    // Resume the exact submitted operation before issuing its next phase, rather than treating an interrupted waiter as failure.
    const waiter = actual.StackStatus === 'CREATE_IN_PROGRESS' ? 'stack-create-complete' : 'stack-update-complete';
    if (!['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS'].includes(actual.StackStatus)) throw new Error('Unexpected in-progress slot operation.');
    aws(['cloudformation', 'wait', waiter, '--stack-name', host.stackId]);
    actual = aws(['cloudformation', 'describe-stacks', '--stack-name', host.stackId]).Stacks?.[0];
    if (!actual || actual.StackId !== host.stackId) throw new Error('Slot disappeared during its operation.');
  }
  if (actual.Parameters?.find((p: any) => p.ParameterKey === 'Phase')?.ParameterValue === value
    && ['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(actual.StackStatus)) return;
  const parameters = (actual.Parameters ?? []).map((p: any) => p.ParameterKey === 'Phase'
    ? { ParameterKey: 'Phase', ParameterValue: value } : { ParameterKey: p.ParameterKey, UsePreviousValue: true });
  if (!parameters.some((p: any) => p.ParameterKey === 'Phase')) throw new Error('Slot is missing its reviewed lifecycle parameter.');
  // Operator cleanup reuses the exact deployed template; the automated release role instead requires an immutable TemplateURL.
  aws(['cloudformation', 'update-stack', '--stack-name', host.stackId, '--use-previous-template', '--disable-rollback', '--parameters', JSON.stringify(parameters)]);
  aws(['cloudformation', 'wait', 'stack-update-complete', '--stack-name', host.stackId]);
}

export function removeRegionalHosts(config: DeploymentConfig, outputs: Record<string, string>, aws: MetadataCall): void {
  const clusterPresent = stopRegionalHosts(config, outputs, aws);
  const before = regionalHosts(config, aws);
  const allowed = before.flatMap(h => h.instance ? [h.instance] : []);
  for (const host of before) {
    if (host.status === 'DELETE_IN_PROGRESS') {
      aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', host.stackId]); continue;
    }
    if (!host.instance && !host.interface) {
      // A retired empty slot needs no network-only transition: that would recreate an ENI solely to delete it again.
      aws(['cloudformation', 'delete-stack', '--stack-name', host.stackId]);
      aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', host.stackId]); continue;
    }
    // Both services have stopped and EC2 is stopped before either public management binding can disappear.
    if (host.instance && clusterPresent) prepareEcsRemoval({ ClusterName: config.resourceName, InstanceId: host.instance,
      NetworkDaemonServiceName: host.daemon ?? '' }, aws, allowed);
    phase(host, 'network-only', aws);
    const current = regionalHosts(config, aws).find(h => h.stackId === host.stackId);
    if (!current || current.instance) throw new Error('Host termination is not complete.');
    if (current.interface) {
      const addresses = aws(['ec2', 'describe-addresses', '--filters', `Name=network-interface-id,Values=${current.interface}`]).Addresses;
      if (!Array.isArray(addresses)) throw new Error('Association inventory is unavailable.');
      for (const address of addresses) {
        const tags = Object.fromEntries((address.Tags ?? []).map((t: any) => [t.Key, t.Value]));
        if (address.NetworkInterfaceId !== current.interface || !address.AssociationId
          || ![config.stackName, transitionAddressStackName(config.stackName)].includes(tags['aws:cloudformation:stack-name'] as string)
          || Object.entries(config.globalTags).some(([k, v]) => tags[k] !== v)) throw new Error('Unexpected public address attached to retiring slot.');
      }
      for (const address of addresses) aws(['ec2', 'disassociate-address', '--association-id', address.AssociationId]);
    }
    phase(host, 'absent', aws);
    aws(['cloudformation', 'delete-stack', '--stack-name', host.stackId]);
    aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', host.stackId]);
  }
  const transient = aws(['cloudformation', 'describe-stacks']).Stacks?.find((s: any) => s.StackName === transitionAddressStackName(config.stackName));
  if (transient) {
    if (!transient.StackId?.startsWith(`arn:aws:cloudformation:${config.region}:${config.account}:stack/${transitionAddressStackName(config.stackName)}/`)
      || Object.entries(config.globalTags).some(([k, v]) => !transient.Tags?.some((t: any) => t.Key === k && t.Value === v))) throw new Error('Transition-address stack ownership mismatch.');
    const addresses = aws(['ec2', 'describe-addresses', '--filters', `Name=tag:aws:cloudformation:stack-id,Values=${transient.StackId}`]).Addresses;
    if (!Array.isArray(addresses) || addresses.some((address: any) => address.NetworkInterfaceId || address.AssociationId)) throw new Error('Temporary addresses are still attached; refusing stack deletion.');
    // CFN owns only the disposable allocations here; permanent addresses remain in the regional root.
    aws(['cloudformation', 'delete-stack', '--stack-name', transient.StackId]);
    aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', transient.StackId]);
  }
}
