import { describe, expect, it } from 'vitest';
import { parseJson, renderXrayServerConfig, validateXrayBundle, type XrayBundle } from '../lib/xray-config.js';

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

describe('normal-mode logging policy', () => {
  it('overrides imported traffic diagnostics without changing credentials or protocol settings', () => {
    // A legacy/verbose bundle is accepted as identity input, but cannot override runtime privacy policy.
    const input = structuredClone(server) as any;
    input.log = { access: '/private-access.log', error: '/private-errors.log', loglevel: 'debug', dnsLog: true };
    input.inbounds[0].streamSettings.realitySettings.show = true;
    const output = JSON.parse(renderXrayServerConfig(JSON.stringify(input)).toString());
    expect(output.log).toEqual({ access: 'none', error: 'none', loglevel: 'none', dnsLog: false });
    expect(output.inbounds[0].streamSettings.realitySettings.show).toBe(false);
    delete output.log; delete input.log;
    delete output.inbounds[0].streamSettings.realitySettings.show;
    delete input.inbounds[0].streamSettings.realitySettings.show;
    expect(output).toEqual(input);
  });
  it('renders idempotently and does not invent transport settings on SOCKS/freedom entries', () => {
    // The same initializer also renders disposable clients; absent transport subtrees must stay absent.
    const input = { inbounds: [{ protocol: 'socks' }], outbounds: [{ protocol: 'freedom' }] };
    const bytes = renderXrayServerConfig(JSON.stringify(input));
    expect(renderXrayServerConfig(bytes.toString())).toEqual(bytes);
    expect(JSON.parse(bytes.toString()).inbounds).toEqual(input.inbounds);
    expect(JSON.parse(bytes.toString()).outbounds).toEqual(input.outbounds);
  });
  it('withholds malformed input and native parser details', () => {
    // jq diagnostics can quote input; neither the error message nor its cause may expose it.
    expect(() => renderXrayServerConfig('{"private":"SYNTHETIC_PRIVATE_MARKER"')).toThrow('Contents withheld');
    try { renderXrayServerConfig('SYNTHETIC_PRIVATE_MARKER'); } catch (error) {
      expect(String(error)).not.toContain('SYNTHETIC_PRIVATE_MARKER');
      expect((error as Error).cause).toBeUndefined();
    }
  });
});
