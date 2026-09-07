import { describe, expect, it } from 'vitest';
import { awgParameters, generateAwgProfiles } from '../lib/awg.js';

describe('Amnezia-compatible AWG state generation', () => {
  it('retains the upstream packet-size constraints over repeated random generation', () => {
    for (let iteration = 0; iteration < 1000; iteration++) {
      const p = awgParameters();
      expect(p.Jc).toBeGreaterThanOrEqual(4);
      expect(p.Jc).toBeLessThan(7);
      expect(p.S2).not.toBe(p.S1);
      expect(p.S2).not.toBe(p.S4);
      expect([p.S1, p.S2, p.S4]).not.toContain(p.S3);
      expect(new Set([p.S1 + 148, p.S2 + 92, p.S3 + 64]).size).toBe(3);
    }
  });
  it('generates distinct device identities with matching server peers and shared protocol parameters', () => {
    const state = generateAwgProfiles('192.0.2.44');
    const values = (text: string, field: string) => [...text.matchAll(new RegExp(`^${field} = (.+)$`, 'gm'))].map(match => match[1]);
    const mac = state.profiles.macos!;
    const ios = state.profiles.ios!;
    expect(values(mac, 'PrivateKey')).not.toEqual(values(ios, 'PrivateKey'));
    expect(values(state.serverConfig, 'PresharedKey')).toEqual([...values(mac, 'PresharedKey'), ...values(ios, 'PresharedKey')]);
    for (const profile of [mac, ios]) {
      expect(values(profile, 'HeaderProtectionKey')).toEqual(values(state.serverConfig, 'HeaderProtectionKey'));
      expect(values(profile, 'Endpoint')).toEqual(['192.0.2.44:443']);
      expect(values(profile, 'AllowedIPs')).toEqual(['0.0.0.0/0, ::/0']);
      expect(profile).not.toContain(values(state.serverConfig, 'PrivateKey')[0]);
    }
    expect(values(state.serverConfig, 'AllowedIPs')).toEqual(['10.78.0.2/32', '10.78.0.3/32']);
  });
});
