import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { AssociateAddressCommand, DisassociateAddressCommand } from '@aws-sdk/client-ec2';
import { DeregisterContainerInstanceCommand, DescribeServicesCommand, PutAttributesCommand, StopServiceDeploymentCommand, UpdateContainerInstancesStateCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { SlotStacks, type SlotInputs, type SlotStackConfig, type OwnedStack } from './slot-stacks.js';
import { SlotObserver, type SlotObservation } from './slot-observation.js';
import { ReleaseState } from './state.js';
import { HostProbe } from './host-probe.js';
import { readServiceTasks } from './ecs-observation.js';
import { bootstrapReady, daemonReady, failedRuntimeEvidence, gatewayReady } from './generation-proof.js';
import { readNativeDeployment } from './native-deployment.js';
import { readiness } from './gate.js';
import { artifacts, digestPattern, repository, type Release } from './model.js';
import type { Registry } from './registry.js';
import type { Generation, Rollout, RolloutEffect, RolloutObservation, RolloutPorts } from './blue-green.js';
import type { StackClients } from './clients.js';
import { slotAddresses, type HostSlot } from '../host-slot-model.js';
import type { AddressObservation, HandoffAddresses } from './eip-handoff.js';
import { nextAssociationChange } from './eip-handoff.js';
import type { LifecycleMode } from './lifecycle.js';

export interface BlueGreenConfig extends SlotStackConfig {
  table: string; topic: string; cluster: string; service: string; progressRule: string; observerDocument: string;
}
interface Snapshot {
  inputs: SlotInputs; slots: Record<HostSlot, SlotObservation>; addresses?: HandoffAddresses; bindings?: AddressObservation;
  production: Record<'xray' | 'awg', string>; temporary: Partial<Record<'xray' | 'awg', string>>; addressStack?: OwnedStack;
}
export class AwsBlueGreen extends ReleaseState implements RolloutPorts {
  readonly stacks: SlotStacks;
  readonly observer: SlotObserver;
  readonly probe: HostProbe;
  constructor(readonly config: BlueGreenConfig, readonly clients: StackClients, readonly registry: Registry, public mode: LifecycleMode) {
    super(config, clients);
    this.stacks = new SlotStacks(config, clients.cfn);
    this.observer = new SlotObserver(this.stacks, config.cluster, clients);
    this.probe = new HostProbe(config.observerDocument, clients.ssm, this);
  }
  async save(next: Rollout, previous: Rollout): Promise<void> {
    if (!await this.replace('rollout/current', next, previous)) throw new Error('Concurrent rollout state change.');
  }
  get template() { return this.stacks.template; }
  private async root() {
    // Root outputs identify shared resources; slot stack IDs/tags prove physical ownership separately.
    const response = await this.clients.cfn.send(new DescribeStacksCommand({ StackName: this.config.endpoint }));
    const root = response.Stacks?.[0];
    if (response.Stacks?.length !== 1 || !root?.StackId?.startsWith(`arn:aws:cloudformation:${this.config.region}:${this.config.account}:stack/${this.config.endpoint}/`)
      || Object.entries(this.config.tags).some(([key, value]) => !root.Tags?.some(t => t.Key === key && t.Value === value))) throw new Error('Endpoint ownership changed.');
    const outputs = Object.fromEntries((root.Outputs ?? []).map(o => [o.OutputKey!, o.OutputValue!]));
    const inputs: SlotInputs = { subnet: outputs.SubnetId!, security: outputs.SecurityGroupId!, profile: outputs.InstanceProfileName!, execution: outputs.NetworkExecutionRoleArn! };
    if (Object.values(inputs).some(v => !v)) throw new Error('Endpoint lacks shared host-slot coordinates.');
    const production = { xray: outputs.EipAllocationId!, awg: outputs.AwgEipAllocationId! };
    if (Object.values(production).some(id => !/^eipalloc-[a-f0-9]{17}$/.test(id))) throw new Error('Endpoint lacks exact production allocations.');
    return { inputs, production };
  }
  async generation(): Promise<Generation | undefined> {
    const { production } = await this.root();
    const [a, b, bindings, tasks, detail] = await Promise.all([this.observer.read('a'), this.observer.read('b'),
      this.observer.addresses(Object.values(production)), readServiceTasks(this.clients.ecs, this.config.cluster, this.config.service),
      this.clients.ecs.send(new DescribeServicesCommand({ cluster: this.config.cluster, services: [this.config.service] }))]);
    if (detail.failures?.length) throw new Error('Gateway service observation is incomplete.');
    if (detail.services?.length !== 1 || detail.services[0]?.desiredCount !== 1 || detail.services[0]?.pendingCount !== 0 || tasks.length !== 1) return undefined;
    const hosts = [a, b].filter(s => s.interface && (['xray', 'awg'] as const).every(p => bindings[production[p]]?.networkInterfaceId === s.interface
      && bindings[production[p]]?.privateIpAddress === slotAddresses(s.slot)[p]));
    if (hosts.length !== 1) throw new Error('Both production addresses must identify one owned active slot.');
    const host = hosts[0]!, task = tasks[0]!;
    if (!host.instance?.InstanceId || host.instance.State?.Name !== 'running' || !host.container?.agentConnected
      || !host.container.containerInstanceArn || host.tasks.length !== 1) return undefined;
    const probe = await this.probe.read(host.instance.InstanceId);
    if (!probe?.bootstrap || !task.startedBy?.startsWith('ecs-svc/')) return undefined;
    const images = Object.fromEntries(artifacts.map(name => [name, name === 'bootstrap' ? probe.bootstrap!.digest
      : name === 'network-daemon' ? host.tasks[0]?.containers?.find(c => c.name === 'network')?.imageDigest
        : task.containers?.find(c => c.name === name)?.imageDigest]));
    if (Object.values(images).some(d => !d || !digestPattern.test(d))) return undefined;
    const revision = `arn:aws:ecs:${this.config.region}:${this.config.account}:service-revision/${this.config.cluster}/${this.config.service}/${task.startedBy.slice('ecs-svc/'.length)}`;
    const actual: Release = { schemaVersion: 3, promotionId: 'observed', promotedAt: new Date(this.now()).toISOString(), origin: this.config.region,
      platform: 'linux/arm64', history: [], os: { variant: 'aws-ecs-3', architecture: 'arm64', targetVersion: probe.version, compatibleVersions: [probe.version] },
      images: Object.fromEntries(artifacts.map(name => [name, { repository: repository(name), digest: images[name]!, runtimeDigest: images[name]!, buildTag: 'observed' }])) as Release['images'] };
    if (!bootstrapReady(probe, actual, {}) || !daemonReady(host.tasks[0], host.container.containerInstanceArn, actual, {})
      || !gatewayReady(task, host.container.containerInstanceArn, revision, probe, actual, {}, this.now())) return undefined;
    const generation: Generation = { slot: host.slot, stack: host.stack!.id, instance: host.instance.InstanceId, interface: host.interface!,
      boot: probe.bootId, revision, images: images as Record<string, string>, os: probe.version, template: host.stack?.template };
    // Preserve all five actual runtime references for stopped/parked recovery and bounded image cleanup.
    await this.put('runtime/images', { at: this.now(), images: generation.images });
    return generation;
  }
  async inventory(rollout: Rollout): Promise<Snapshot> {
    const { inputs, production } = await this.root();
    const [a, b, addressStack] = await Promise.all([this.observer.read('a'), this.observer.read('b'), this.stacks.observe('addresses')]);
    const slots = { a, b };
    const source = slots[rollout.source.slot];
    if (source.stack && source.stack.id !== rollout.source.stack) throw new Error('Source stack was replaced during rollout.');
    // During retirement the recorded source disappears intentionally; do not silently adopt a replacement host.
    if (source.instance && source.instance.InstanceId !== rollout.source.instance) throw new Error('Source host was replaced during rollout.');
    const temporary = await this.observer.temporary(addressStack);
    const bindings = await this.observer.addresses([...Object.values(production), ...Object.values(temporary)]);
    const blueInterface = source.interface ?? rollout.source.interface;
    const greenInterface = slots[rollout.green].interface ?? rollout.addresses?.xray.green.networkInterfaceId;
    const addresses = temporary.xray && temporary.awg && greenInterface ? Object.fromEntries((['xray', 'awg'] as const).map(protocol => [protocol, {
      production: production[protocol], temporary: temporary[protocol],
      blue: { networkInterfaceId: blueInterface, privateIpAddress: slotAddresses(rollout.source.slot)[protocol] },
      green: { networkInterfaceId: greenInterface, privateIpAddress: slotAddresses(rollout.green)[protocol] },
    }])) as HandoffAddresses : undefined;
    if (rollout.addresses && addresses && JSON.stringify(rollout.addresses) !== JSON.stringify(addresses)) throw new Error('Recorded handoff ownership changed.');
    return { inputs, slots, production, temporary, bindings, addresses, addressStack };
  }
  async observe(rollout: Rollout): Promise<RolloutObservation> {
    const snapshot = await this.inventory(rollout);
    const green = snapshot.slots[rollout.green], blue = snapshot.slots[rollout.source.slot];
    const [ready, tasks, greenProbe, blueProbe, deployment] = await Promise.all([
      readiness(this.registry).catch(async () => {
        // A failed registry read denies forward promotion but cannot suppress independently verified return-to-blue safety work.
        await this.alert(`${rollout.id}/registry-observation`, 'Release metadata is unreadable; forward promotion is withheld. Existing runtime and rollback observations continue.');
        return { ready: false, current: undefined };
      }), readServiceTasks(this.clients.ecs, this.config.cluster, this.config.service),
      green.instance?.State?.Name === 'running' && green.container?.agentConnected ? this.probe.read(green.instance.InstanceId!) : undefined,
      blue.instance?.State?.Name === 'running' && blue.container?.agentConnected ? this.probe.read(blue.instance.InstanceId!) : undefined,
      rollout.effectIssued !== undefined && rollout.phase === 'force' || rollout.deployment
        ? readNativeDeployment(this.clients.ecs, this.config.cluster, this.serviceArn(), rollout.source.revision, rollout.effectIssued ?? rollout.started, rollout.deployment) : undefined,
    ]);
    const greenTasks = tasks.filter(t => t.containerInstanceArn === green.container?.containerInstanceArn);
    const blueTasks = tasks.filter(t => t.containerInstanceArn === blue.container?.containerInstanceArn);
    const expectedBlue: Release = { ...rollout.intent, images: Object.fromEntries(artifacts.map(name => [name, {
      ...rollout.intent.images[name], digest: rollout.source.images[name]!, runtimeDigest: rollout.source.images[name]!,
    }])) as Release['images'], os: { ...rollout.intent.os, targetVersion: rollout.source.os, compatibleVersions: [rollout.source.os] } };
    const daemonHealthy = green.tasks.length === 1 && !!green.container?.containerInstanceArn
      && daemonReady(green.tasks[0], green.container.containerInstanceArn, rollout.intent, {});
    const coldReady = daemonHealthy && bootstrapReady(greenProbe, rollout.intent, {});
    const greenReady = !!deployment && coldReady && greenTasks.length === 1
      && gatewayReady(greenTasks[0], green.container!.containerInstanceArn!, deployment.greenRevision, greenProbe, rollout.intent, {}, this.now());
    const sourceHealthy = blueTasks.length === 1 && blue.tasks.length === 1 && !!blue.container?.containerInstanceArn
      && blueProbe?.bootId === rollout.source.boot && bootstrapReady(blueProbe, expectedBlue, {})
      && daemonReady(blue.tasks[0], blue.container.containerInstanceArn, expectedBlue, {})
      && gatewayReady(blueTasks[0], blue.container.containerInstanceArn, rollout.source.revision, blueProbe, expectedBlue, {}, this.now());
    const retired = rollout.retiring ? snapshot.slots[rollout.retiring] : undefined;
    const retiredArn = retired?.container?.containerInstanceArn;
    const retiredBindings = retired?.interface ? Object.values(snapshot.bindings ?? {}).filter(b => b?.networkInterfaceId === retired.interface) : [];
    return { mode: this.mode, aliasesReady: ready.ready && ready.current?.digest === rollout.release,
      networkReady: !!green.interface && !green.stack?.status.endsWith('_IN_PROGRESS'), addressesReady: !!snapshot.temporary.xray && !!snapshot.temporary.awg,
      wired: !!snapshot.addresses && (['xray', 'awg'] as const).every(p => {
        const pair = snapshot.addresses![p], actual = snapshot.bindings![pair.temporary];
        return actual?.networkInterfaceId === pair.green.networkInterfaceId && actual.privateIpAddress === pair.green.privateIpAddress;
      }), hostCreated: !!green.instance && green.instance.State?.Name === 'running', daemonReady: coldReady,
      placementReady: this.candidate(green) === 'eligible' && this.candidate(blue) === 'ineligible',
      greenReady, sourceHealthy, sourceStopped: blue.instance?.State?.Name === 'stopped' && !blueTasks.length && !blue.tasks.length,
      // An unavailable probe is uncertainty, not a failed packet test. Verified negative runtime health is actionable.
      // Once green handoff starts, confirmed failure also matters before bake; missing SSM alone still permits management restoration.
      greenFailure: rollout.direction === 'green' && ['PRODUCTION_TRAFFIC_SHIFT', 'POST_PRODUCTION_TRAFFIC_SHIFT', 'BAKE_TIME'].includes(deployment?.stage ?? '')
        && failedRuntimeEvidence(green.instance?.State?.Name,
        green.container?.agentConnected, daemonHealthy, greenTasks, greenProbe, greenReady),
      deployment, addresses: snapshot.addresses, bindings: snapshot.bindings,
      retiredTasksStopped: !!retired && !retired.tasks.length && !tasks.some(t => t.containerInstanceArn === retiredArn),
      retiredHostAbsent: !!retired && !retired.instance && !retired.stack?.status.endsWith('_IN_PROGRESS'),
      retiredAddressesDetached: !!retired && !retiredBindings.length,
      retiredNetworkAbsent: !!retired && !retired.interface && !retired.stack?.status.endsWith('_IN_PROGRESS'), temporaryAddressesAbsent: !snapshot.addressStack };
  }
  private candidate(slot: SlotObservation) { return slot.container?.attributes?.find(a => a.name === 'ghostline_candidate')?.value; }
  private serviceArn() { return `arn:aws:ecs:${this.config.region}:${this.config.account}:service/${this.config.cluster}/${this.config.service}`; }
  private async select(snapshot: Snapshot, selected: HostSlot) {
    // Placement eligibility affects new tasks only. Existing blue remains alive throughout native bake/rollback.
    for (const slot of ['a', 'b'] as const) {
      const target = snapshot.slots[slot].container?.containerInstanceArn;
      if (!target) {
        if (slot === selected) throw new Error('The selected container instance must be observed before changing placement.');
        continue; // Failed green may never register; that must not prevent restoring eligibility to healthy blue.
      }
      await this.clients.ecs.send(new PutAttributesCommand({ cluster: this.config.cluster,
        attributes: [{ name: 'ghostline_candidate', value: slot === selected ? 'eligible' : 'ineligible', targetId: target, targetType: 'container-instance' }] }));
    }
  }
  async effect(effect: RolloutEffect, rollout: Rollout): Promise<void> {
    // Explicit cleanup may retire failed green while blue stays powered off. It cannot launch, rewire or reactivate anything.
    if (this.mode !== 'active' && !(this.mode === 'stopped' && rollout.retiring === rollout.green
      && ['drain', 'remove-host', 'unwire', 'remove-network', 'release-addresses'].includes(effect.kind))) throw new Error('Inactive regions cannot advance a rollout.');
    // Re-read physical ownership before each mutation; never act on an old warm-Lambda snapshot.
    const snapshot = await this.inventory(rollout);
    const green = snapshot.slots[rollout.green], retiring = rollout.retiring && snapshot.slots[rollout.retiring];
    const os = rollout.intent.os.targetVersion;
    if (!os) throw new Error('A whole-host release needs a centrally qualified OS target.');
    const operation = `${rollout.id}/${rollout.phase}`;
    if (['drain', 'remove-host', 'unwire', 'remove-network', 'release-addresses'].includes(effect.kind)) {
      const active = snapshot.slots[rollout.retiring === rollout.green ? rollout.source.slot : rollout.green];
      if (!rollout.retiring || !active.interface || Object.values(snapshot.production).some(a => snapshot.bindings?.[a]?.networkInterfaceId !== active.interface)) {
        throw new Error('Production addresses must belong to the surviving host before retirement.');
      }
    }
    switch (effect.kind) {
      case 'network': await this.stacks.ensure(rollout.green, 'network-only', os, snapshot.inputs, operation); break;
      case 'addresses': await this.stacks.addresses(operation); break;
      case 'host': await this.stacks.ensure(rollout.green, 'running', os, snapshot.inputs, operation); break;
      case 'placement': await this.select(snapshot, rollout.green); break;
      case 'restore-placement': await this.select(snapshot, rollout.source.slot); break;
      case 'wire':
        if (!snapshot.addresses || !snapshot.bindings) throw new Error('Missing owned transition addresses.');
        for (const p of ['xray', 'awg'] as const) {
          const pair = snapshot.addresses[p], actual = snapshot.bindings[pair.temporary];
          if (actual) {
            if (actual.networkInterfaceId !== pair.green.networkInterfaceId || actual.privateIpAddress !== pair.green.privateIpAddress) throw new Error('Temporary address is already in use elsewhere.');
          } else await this.clients.ec2.send(new AssociateAddressCommand({ AllocationId: pair.temporary, NetworkInterfaceId: pair.green.networkInterfaceId,
            PrivateIpAddress: pair.green.privateIpAddress, AllowReassociation: false }));
        }
        break;
      case 'force': {
        const ready = await readiness(this.registry);
        if (!ready.ready || ready.current?.digest !== rollout.release || this.candidate(green) !== 'eligible'
          || this.candidate(snapshot.slots[rollout.source.slot]) !== 'ineligible') throw new Error('Release/placement changed immediately before force deployment.');
        await this.clients.ecs.send(new UpdateServiceCommand({ cluster: this.config.cluster, service: this.config.service, forceNewDeployment: true })); break;
      }
      case 'rollback':
        if (!rollout.deployment) throw new Error('No recorded native deployment to roll back.');
        await this.clients.ecs.send(new StopServiceDeploymentCommand({ serviceDeploymentArn: rollout.deployment.deployment, stopType: 'ROLLBACK' })); break;
      case 'associate': {
        if (!rollout.addresses || !snapshot.bindings || !rollout.direction) throw new Error('No durable address handoff.');
        const next = nextAssociationChange(rollout.addresses, snapshot.bindings, rollout.direction);
        if (next.kind === 'complete') return;
        if (JSON.stringify(next) !== JSON.stringify(effect.change)) throw new Error('Address bindings changed before mutation; observe again.');
        if (next.kind === 'disassociate') await this.clients.ec2.send(new DisassociateAddressCommand({ AssociationId: next.associationId }));
        else await this.clients.ec2.send(new AssociateAddressCommand({ AllocationId: next.allocationId, NetworkInterfaceId: next.target.networkInterfaceId,
          PrivateIpAddress: next.target.privateIpAddress, AllowReassociation: true }));
        break;
      }
      case 'drain':
        if (!retiring) throw new Error('No recorded retirement target.');
        if (retiring.instance?.State?.Name === 'stopped' && retiring.container?.containerInstanceArn) {
          // An offline agent cannot acknowledge final task status. EC2 proves processes stopped; retire only an empty ECS registration.
          if (retiring.container.agentConnected !== false || retiring.container.runningTasksCount !== 0
            || retiring.container.pendingTasksCount !== 0) break;
          await this.clients.ecs.send(new DeregisterContainerInstanceCommand({ cluster: this.config.cluster,
            containerInstance: retiring.container.containerInstanceArn, force: false }));
          break;
        }
        if (retiring.container?.containerInstanceArn && retiring.container.status !== 'DRAINING') {
          await this.clients.ecs.send(new UpdateContainerInstancesStateCommand({ cluster: this.config.cluster,
            containerInstances: [retiring.container.containerInstanceArn], status: 'DRAINING' }));
        }
        break;
      case 'remove-host': case 'remove-network':
        if (!retiring || !rollout.retiring) throw new Error('No recorded retirement target.');
        // Recheck real task termination before removing the host, including desired-STOPPED tasks still shutting down.
        if (retiring.tasks.length || (await readServiceTasks(this.clients.ecs, this.config.cluster, this.config.service))
          .some(t => t.containerInstanceArn === retiring.container?.containerInstanceArn)) throw new Error('Retired tasks are still running.');
        if (effect.kind === 'remove-network' && (retiring.instance || Object.values(snapshot.bindings ?? {}).some(b => b?.networkInterfaceId === retiring.interface))) {
          throw new Error('Retired network still has a host or public association.');
        }
        await this.stacks.ensure(rollout.retiring, effect.kind === 'remove-host' ? 'network-only' : 'absent',
          retiring.stack?.parameters.OsVersion ?? os, snapshot.inputs, operation); break;
      case 'unwire':
        if (!retiring || retiring.instance) throw new Error('Terminate retired host before removing management connectivity.');
        for (const allocation of Object.values(snapshot.temporary ?? {})) {
          const binding = snapshot.bindings?.[allocation];
          if (!binding) continue;
          if (binding.networkInterfaceId !== retiring.interface) throw new Error('Temporary address does not belong to the retired slot.');
          await this.clients.ec2.send(new DisassociateAddressCommand({ AssociationId: binding.associationId }));
        }
        break;
      case 'release-addresses':
        if (Object.values(snapshot.temporary ?? {}).some(a => snapshot.bindings?.[a])) throw new Error('Temporary addresses are still associated.');
        await this.stacks.removeAddresses(operation); break;
    }
  }
}
