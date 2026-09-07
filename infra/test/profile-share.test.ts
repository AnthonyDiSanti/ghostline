import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { generateAwgProfiles } from '../lib/awg.js';
import { profileQr, vpnLink } from '../lib/profile-share.js';

describe('Amnezia profile sharing', () => {
  it('round-trips every byte through the Qt-compatible text import envelope', () => {
    const profile = '# Ghostline — test\n' + generateAwgProfiles('192.0.2.1').profiles.ios!;
    const link = vpnLink(profile);
    const encoded = Buffer.from(link.slice('vpn://'.length), 'base64url');
    expect(encoded.readUInt32BE(0)).toBe(Buffer.byteLength(profile));
    expect(inflateSync(encoded.subarray(4)).toString()).toBe(profile);
    expect(link.slice('vpn://'.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('encodes a complete generated 3.1 profile as a local PNG', async () => {
    const profile = generateAwgProfiles('192.0.2.1').profiles.ios!;
    const png = await profileQr(profile);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBeGreaterThan(300);
    expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
  });
});
