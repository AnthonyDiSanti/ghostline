export type HostSlot = 'a' | 'b';
export type SlotPhase = 'absent' | 'network-only' | 'running';
export const hostSlots = ['a', 'b'] as const;
export const slotStackName = (endpoint: string, slot: HostSlot) => `${endpoint}-Host-${slot}`;
export const transitionAddressStackName = (endpoint: string) => `${endpoint}-TransitionAddresses`;
export const daemonServiceName = (cluster: string, slot: HostSlot) => slot === 'a' ? `${cluster}-network` : `${cluster}-network-b`;
export function slotAddresses(slot: HostSlot) {
  // Each host retains a protocol-private source pair while public addresses move between hosts.
  return slot === 'a' ? { awg: '10.79.0.10', xray: '10.79.0.11' } : { awg: '10.79.0.20', xray: '10.79.0.21' };
}
