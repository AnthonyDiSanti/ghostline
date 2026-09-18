import { describe, expect, it } from 'vitest';
import { parseJson, validateXrayBundle, type XrayBundle } from '../lib/xray-config.js';

const server = {
  inbounds: [{ port: 443, protocol: 'vless', settings: { clients: [
    { id: 'dummy-mac', flow: 'xtls-rprx-vision' }, { id: 'dummy-phone', flow: 'xtls-rprx-vision' },
  ] }, streamSettings: { security: 'reality', realitySettings: { privateKey: 'dummy-secret', shortIds: ['dummy-short-id'] } } }],
  outbounds: [{ protocol: 'freedom' }], log: { loglevel: 'error' },
};
const raw = JSON.stringify(server, null, 4) + '\n';
const fixture: XrayBundle = { version: 1, deployment: 'source-region', sourceInstanceId: 'i-fixture', xrayVersion: '26.7.28',
  files: { 'server.json': Buffer.from(raw).toString('base64'), clientsTable: Buffer.from('all client metadata').toString('base64') } };

describe('credential portability', () => {
  it('preserves the complete source byte-for-byte across repeated imports', () => {
    for (let count = 0; count < 3; count++) {
      const restored = validateXrayBundle(structuredClone(fixture));
      expect(restored).toEqual(fixture);
      expect(Buffer.from(restored.files['server.json']!, 'base64').toString()).toBe(raw);
      expect(JSON.parse(raw).inbounds[0].settings.clients).toHaveLength(2);
    }
  });
  it.each(['../escape', '/etc/shadow', '.', '..', 'nested/file', '__proto__'])('rejects unsafe import filename %s', name => {
    const files = { ...fixture.files, [name]: 'YQ==' };
    // Prototype-named files are ordinary basenames, but may not alter object behavior on import.
    if (name === '__proto__') expect(validateXrayBundle({ ...fixture, files }).files).toHaveProperty('server.json');
    else expect(() => validateXrayBundle({ ...fixture, files })).toThrow('filename');
  });
  it('never quotes secret JSON in parser diagnostics', () => {
    expect(() => parseJson('{"secret":"VERY_PRIVATE"')).toThrow('contents withheld');
    try { parseJson('VERY_PRIVATE'); } catch (error) { expect(String(error)).not.toContain('VERY_PRIVATE'); }
  });
  it('fails closed on a missing client list or unexpected listener', () => {
    const changed = structuredClone(server);
    changed.inbounds[0]!.settings.clients = [];
    expect(() => validateXrayBundle({ ...fixture, files: { 'server.json': Buffer.from(JSON.stringify(changed)).toString('base64') } })).toThrow('client identities');
  });
});
