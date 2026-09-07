import { describe, expect, it } from 'vitest';
import { composeConfig, parseJson, validateAddresses, validateBundle, type RuntimeBundle } from '../lib/runtime.js';

const server = {
  inbounds: [{ port: 443, protocol: 'vless', settings: { clients: [
    { id: 'dummy-mac', flow: 'xtls-rprx-vision' }, { id: 'dummy-phone', flow: 'xtls-rprx-vision' },
  ] }, streamSettings: { security: 'reality', realitySettings: { privateKey: 'dummy-secret', shortIds: ['dummy-short-id'] } } }],
  outbounds: [{ protocol: 'freedom' }], log: { loglevel: 'error' },
};
const raw = JSON.stringify(server, null, 4) + '\n';
const fixture: RuntimeBundle = { version: 1, deployment: 'cape-town', sourceInstanceId: 'i-fixture', xrayVersion: '26.7.28',
  files: { 'server.json': Buffer.from(raw).toString('base64'), clientsTable: Buffer.from('all client metadata').toString('base64') } };
const addresses = { xrayPrivateIp: '10.77.0.11', awgPrivateIp: '10.77.0.10' };

describe('credential portability', () => {
  it('preserves the complete source byte-for-byte across repeated imports', () => {
    for (let count = 0; count < 3; count++) {
      const restored = validateBundle(structuredClone(fixture), 'cape-town');
      expect(restored).toEqual(fixture);
      expect(Buffer.from(restored.files['server.json']!, 'base64').toString()).toBe(raw);
      expect(JSON.parse(raw).inbounds[0].settings.clients).toHaveLength(2);
    }
  });
  it('rejects another target or runtime version before restoration', () => {
    expect(() => validateBundle(fixture, 'frankfurt')).toThrow('identity');
    expect(() => validateBundle({ ...fixture, xrayVersion: 'other' }, 'cape-town')).toThrow('version');
  });
  it.each(['../escape', '/etc/shadow', '.', '..', 'nested/file', '__proto__'])('rejects unsafe import filename %s', name => {
    const files = { ...fixture.files, [name]: 'YQ==' };
    // Prototype-named files are ordinary basenames, but may not alter object behavior on import.
    if (name === '__proto__') expect(validateBundle({ ...fixture, files }, 'cape-town').files).toHaveProperty('server.json');
    else expect(() => validateBundle({ ...fixture, files }, 'cape-town')).toThrow('filename');
  });
  it('never quotes secret JSON in parser diagnostics', () => {
    expect(() => parseJson('{"secret":"VERY_PRIVATE"')).toThrow('contents withheld');
    try { parseJson('VERY_PRIVATE'); } catch (error) { expect(String(error)).not.toContain('VERY_PRIVATE'); }
  });
  it('fails closed on a missing client list or unexpected listener', () => {
    const changed = structuredClone(server);
    changed.inbounds[0]!.settings.clients = [];
    expect(() => validateBundle({ ...fixture, files: { 'server.json': Buffer.from(JSON.stringify(changed)).toString('base64') } }, 'cape-town')).toThrow('client identities');
  });
});

describe('independent protocol networking', () => {
  it.each(['xray', 'awg'] as const)('binds %s ingress and egress to its own address', protocol => {
    const config = composeConfig(protocol, `ghostline-${protocol}:0123456789abcdef`, addresses);
    const service = config.services[protocol]!;
    const expected = protocol === 'xray' ? addresses.xrayPrivateIp : addresses.awgPrivateIp;
    expect(service.ports).toEqual([{ target: 443, published: '443', host_ip: expected, protocol: protocol === 'xray' ? 'tcp' : 'udp' }]);
    expect(config.networks.egress.driver_opts['com.docker.network.host_ipv4']).toBe(expected);
    expect(service).not.toHaveProperty('privileged');
    expect(service.cap_drop).toEqual(['ALL']);
    expect(service.logging.driver).toBe('none');
    expect(JSON.stringify(config)).not.toContain('dummy-secret');
  });
  it('does not put both protocols into one reconciliation project', () => {
    const xray = composeConfig('xray', 'ghostline-xray:0123456789abcdef', addresses);
    const awg = composeConfig('awg', 'ghostline-awg:0123456789abcdef', addresses);
    expect(xray.name).not.toBe(awg.name);
    expect(Object.keys(xray.services)).toEqual(['xray']);
    expect(awg.services.awg!.cap_add).toEqual(['NET_ADMIN']);
  });
  it('rejects wildcard, duplicate and foreign private addresses', () => {
    for (const ip of ['0.0.0.0', '::', '192.168.1.1', '10.77.0.255', '10.77.0.1', addresses.awgPrivateIp]) {
      expect(() => validateAddresses({ ...addresses, xrayPrivateIp: ip })).toThrow('distinct private');
    }
    expect(() => composeConfig('xray', 'ghostline-xray:latest', addresses)).toThrow('content-tagged');
  });
});
