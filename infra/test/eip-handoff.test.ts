import { expect, it } from 'vitest';
import { nextAssociationChange, type AddressObservation, type HandoffAddresses } from '../lib/releases/eip-handoff.js';

const addresses: HandoffAddresses = Object.fromEntries(['xray', 'awg'].map((name, index) => [name, {
  production: `eipalloc-${String(index + 1).repeat(17)}`, temporary: `eipalloc-${String(index + 3).repeat(17)}`,
  blue: { networkInterfaceId: `eni-${'a'.repeat(17)}`, privateIpAddress: `10.79.0.${11 - index}` },
  green: { networkInterfaceId: `eni-${'b'.repeat(17)}`, privateIpAddress: `10.79.0.${21 - index}` },
}])) as HandoffAddresses;
function initial(): AddressObservation {
  // Synthetic public identities only; no AWS calls or live profile material belongs in these tests.
  return Object.fromEntries(Object.values(addresses).flatMap(pair => [
    [pair.production, { ...pair.blue, associationId: `eipassoc-${'1'.repeat(17)}` }],
    [pair.temporary, { ...pair.green, associationId: `eipassoc-${'2'.repeat(17)}` }],
  ]));
}
function advance(state: AddressObservation, destination: 'blue' | 'green') {
  const change = nextAssociationChange(addresses, state, destination);
  if (change.kind === 'disassociate') state[change.allocationId] = undefined;
  if (change.kind === 'associate') state[change.allocationId] = { ...change.target, associationId: `eipassoc-${'3'.repeat(17)}` };
  return change;
}
it('swaps both protocols in order, restoring the displaced addresses to blue', () => {
  const state = initial();
  const operations = Array.from({ length: 6 }, () => advance(state, 'green'));
  expect(operations.map(op => op.kind)).toEqual(['disassociate', 'associate', 'associate', 'disassociate', 'associate', 'associate']);
  expect(operations.slice(0, 3).every(op => op.kind !== 'complete' && [addresses.xray.production, addresses.xray.temporary].includes(op.allocationId))).toBe(true);
  expect(nextAssociationChange(addresses, state, 'green')).toEqual({ kind: 'complete' });
  expect(state[addresses.awg.temporary]).toMatchObject(addresses.awg.blue);
});
it.each([0, 1, 2, 3, 4, 5, 6])('returns to blue after interruption at forward step %s', count => {
  const state = initial();
  for (let n = 0; n < count; n++) advance(state, 'green');
  for (let n = 0; n < 6; n++) advance(state, 'blue');
  expect(nextAssociationChange(addresses, state, 'blue')).toEqual({ kind: 'complete' });
  for (const pair of Object.values(addresses)) {
    expect(state[pair.production]).toMatchObject(pair.blue);
    expect(state[pair.temporary]).toMatchObject(pair.green);
  }
});
it('uses readback after a lost acknowledgement rather than repeating an association', () => {
  const state = initial();
  advance(state, 'green');
  advance(state, 'green');
  expect(nextAssociationChange(addresses, state, 'green')).toEqual({ kind: 'associate', allocationId: addresses.xray.temporary, target: addresses.xray.blue });
});
it('refuses incomplete observation or an unexpected binding anywhere in the handoff', () => {
  const state = initial();
  delete state[addresses.awg.temporary];
  expect(() => nextAssociationChange(addresses, state, 'green')).toThrow('incomplete');
  state[addresses.awg.temporary] = { ...addresses.awg.green, associationId: `eipassoc-${'1'.repeat(17)}`, networkInterfaceId: `eni-${'c'.repeat(17)}` };
  expect(() => nextAssociationChange(addresses, state, 'green')).toThrow('outside');
});
it('rejects duplicate allocations and cross-protocol private-address confusion', () => {
  const bad = structuredClone(addresses); bad.awg.temporary = bad.xray.temporary;
  expect(() => nextAssociationChange(bad, initial(), 'green')).toThrow('distinct');
  const state = initial(); state[addresses.awg.temporary]!.privateIpAddress = addresses.xray.green.privateIpAddress;
  expect(() => nextAssociationChange(addresses, state, 'green')).toThrow('outside');
});
it('refuses a malformed recorded host before selecting any mutation', () => {
  const bad = structuredClone(addresses);
  bad.awg.green.privateIpAddress = bad.xray.green.privateIpAddress;
  expect(() => nextAssociationChange(bad, initial(), 'green')).toThrow('two distinct');
  bad.awg.green.privateIpAddress = '10.79.0.999';
  expect(() => nextAssociationChange(bad, initial(), 'green')).toThrow('IPv4');
  bad.awg.green = { ...addresses.awg.green, networkInterfaceId: `eni-${'c'.repeat(17)}` };
  expect(() => nextAssociationChange(bad, initial(), 'green')).toThrow('one interface');
});
