import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateXrayProfiles, xrayLink } from '../lib/xray.js';

describe('independent Xray identity', () => {
  it('creates matching REALITY keys and independent authorized device identities without sharing server secrets', () => {
    const generated = generateXrayProfiles('stockholm', 'i-test', '203.0.113.1');
    const server = JSON.parse(Buffer.from(generated.bundle.files['server.json']!, 'base64').toString());
    const inbound = server.inbounds[0];
    const privateKey = Buffer.from(inbound.streamSettings.realitySettings.privateKey, 'base64url');
    // Derive the public key independently through Node's import API rather than trusting a copied field.
    const imported = createPrivateKey({ format: 'der', type: 'pkcs8',
      key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), privateKey]) });
    const publicKey = createPublicKey(imported).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
    const ids = Object.values(generated.profiles).map(profile => profile.outbounds[0]!.settings.vnext[0]!.users[0]!.id);
    expect(new Set(ids).size).toBe(2);
    expect(inbound.settings.clients.map((client: any) => client.id)).toEqual(ids);
    for (const [name, profile] of Object.entries(generated.profiles)) {
      expect(profile.outbounds[0]!.streamSettings.realitySettings.publicKey).toBe(publicKey);
      expect(JSON.stringify(profile)).not.toContain(inbound.streamSettings.realitySettings.privateKey);
      const link = new URL(xrayLink(profile, `Ghostline Stockholm ${name}`));
      expect(link.hostname).toBe('203.0.113.1');
      expect(link.searchParams.get('pbk')).toBe(publicKey);
      expect(link.searchParams.get('sid')).toBe(inbound.streamSettings.realitySettings.shortIds[0]);
      expect(link.searchParams.get('flow')).toBe('xtls-rprx-vision');
      expect(ids).toContain(link.username);
    }
    expect(generateXrayProfiles('stockholm', 'i-test', '203.0.113.1').bundle.files['server.json']).not.toBe(generated.bundle.files['server.json']);
  });
  it('rejects invalid endpoints and malformed share input', () => {
    expect(() => generateXrayProfiles('stockholm', 'i-test', '::1')).toThrow('IPv4');
    expect(() => xrayLink({}, 'test')).toThrow('client profile');
  });
});
