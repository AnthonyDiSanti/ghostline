import { isIPv4 } from 'node:net';

export type GatewayProtocol = 'xray' | 'awg';
export interface AddressTarget { networkInterfaceId: string; privateIpAddress: string }
export interface AddressBinding extends AddressTarget { associationId: string }
export interface ProtocolHandoff {
  production: string;
  temporary: string;
  blue: AddressTarget;
  green: AddressTarget;
}
export type HandoffAddresses = Record<GatewayProtocol, ProtocolHandoff>;
export type AddressObservation = Record<string, AddressBinding | undefined>;
export type AssociationChange =
  | { kind: 'complete' }
  | { kind: 'disassociate'; allocationId: string; associationId: string }
  | { kind: 'associate'; allocationId: string; target: AddressTarget };

export function productionOn(addresses: HandoffAddresses, observed: AddressObservation, destination: 'blue' | 'green'): boolean {
  // Reuse whole-handoff validation, but do not require unused temporary allocations to be wired before cleanup.
  nextAssociationChange(addresses, observed, destination);
  return Object.values(addresses).every(pair => matches(observed[pair.production], pair[destination]));
}

function matches(actual: AddressTarget | undefined, expected: AddressTarget): boolean {
  // Private addresses are part of identity: sharing an ENI does not make protocols interchangeable.
  return actual?.networkInterfaceId === expected.networkInterfaceId && actual.privateIpAddress === expected.privateIpAddress;
}

export function nextAssociationChange(addresses: HandoffAddresses, observed: AddressObservation,
  destination: 'blue' | 'green'): AssociationChange {
  // Validate the whole observation before selecting even the first mutation; unknown ownership is never an empty binding.
  const allocations = Object.values(addresses).flatMap(pair => [pair.production, pair.temporary]);
  if (allocations.length !== 4 || new Set(allocations).size !== 4
    || allocations.some(id => !/^eipalloc-[a-f0-9]{17}$/.test(id))) throw new Error('Expected four distinct owned EIP allocations.');
  for (const slot of ['blue', 'green'] as const) {
    const targets = Object.values(addresses).map(pair => pair[slot]);
    if (targets.some(target => !/^eni-[a-f0-9]{17}$/.test(target.networkInterfaceId) || !isIPv4(target.privateIpAddress))
      || new Set(targets.map(target => target.networkInterfaceId)).size !== 1
      || new Set(targets.map(target => target.privateIpAddress)).size !== 2) {
      throw new Error('Each recorded host requires one interface and two distinct IPv4 addresses.');
    }
  }
  for (const pair of Object.values(addresses)) {
    if (pair.blue.networkInterfaceId === pair.green.networkInterfaceId) throw new Error('Blue and green require distinct interfaces.');
    for (const allocation of [pair.production, pair.temporary]) {
      if (!Object.hasOwn(observed, allocation)) throw new Error('EIP observation is incomplete.');
      const current = observed[allocation];
      if (current && (!/^eipassoc-[a-f0-9]{17}$/.test(current.associationId)
        || (!matches(current, pair.blue) && !matches(current, pair.green)))) {
        throw new Error('EIP association is outside the recorded handoff.');
      }
    }
  }
  const standby = destination === 'green' ? 'blue' : 'green';
  // Finish Xray before moving AWG's primary/management address. The same sequence also repairs partial rollback.
  for (const protocol of ['xray', 'awg'] as const) {
    const pair = addresses[protocol];
    const temporary = observed[pair.temporary];
    if (matches(temporary, pair[destination])) {
      return { kind: 'disassociate', allocationId: pair.temporary, associationId: temporary!.associationId };
    }
    if (!matches(observed[pair.production], pair[destination])) {
      return { kind: 'associate', allocationId: pair.production, target: pair[destination] };
    }
    if (!matches(temporary, pair[standby])) {
      return { kind: 'associate', allocationId: pair.temporary, target: pair[standby] };
    }
  }
  return { kind: 'complete' };
}
