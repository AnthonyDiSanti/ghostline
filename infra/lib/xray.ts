import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { validateBundle } from './runtime.js';

export function generateXrayProfiles(deployment: string, sourceInstanceId: string, endpoint: string) {
  // Match the inspected Amnezia 5.0.1.5 REALITY/Vision settings; each region and device gets fresh identity.
  if (isIP(endpoint) !== 4) throw new Error('Xray generation requires an IPv4 endpoint.');
  const pair = generateKeyPairSync('x25519');
  const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64url');
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
  const shortId = randomBytes(8).toString('hex');
  const serverName = 'www.googletagmanager.com';
  const peers = ['macos', 'ios'].map(name => ({ name, id: randomUUID() }));
  const server = {
    inbounds: [{ port: 443, protocol: 'vless',
      settings: { clients: peers.map(({ id }) => ({ id, flow: 'xtls-rprx-vision' })), decryption: 'none' },
      streamSettings: { network: 'tcp', security: 'reality', realitySettings: {
        dest: `${serverName}:443`, fingerprint: 'chrome', privateKey, serverNames: [serverName], shortIds: [shortId],
      } } }],
    log: { loglevel: 'error' }, outbounds: [{ protocol: 'freedom' }],
  };
  const files = {
    'server.json': JSON.stringify(server, null, 2) + '\n',
    'xray_private.key': privateKey, 'xray_public.key': publicKey,
    'xray_uuid.key': peers[0]!.id, 'xray_short_id.key': shortId,
    clientsTable: JSON.stringify(peers.map(({ name, id }) => ({ clientId: id,
      userData: { clientName: `Ghostline ${deployment} ${name}`, creationDate: new Date().toISOString() } }))),
  };
  const bundle = validateBundle({ version: 1, deployment, sourceInstanceId, xrayVersion: '26.7.28',
    files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, Buffer.from(value).toString('base64')])) }, deployment);
  const profiles = Object.fromEntries(peers.map(({ name, id }) => [name, {
    log: { loglevel: 'error' },
    inbounds: [{ listen: '127.0.0.1', port: 10808, protocol: 'socks', settings: { udp: true } }],
    outbounds: [{ protocol: 'vless', settings: { vnext: [{ address: endpoint, port: 443,
      users: [{ id, flow: 'xtls-rprx-vision', encryption: 'none' }] }] },
    streamSettings: { network: 'tcp', security: 'reality', realitySettings: {
      fingerprint: 'chrome', serverName, publicKey, shortId, spiderX: '',
    } } }],
  }]));
  return { bundle, profiles };
}

export function xrayLink(profile: any, name: string): string {
  // Amnezia's native VLESS import accepts these standard URI fields, including the display-name fragment.
  const outbound = profile?.outbounds?.[0];
  const next = outbound?.settings?.vnext?.[0];
  const user = next?.users?.[0];
  const reality = outbound?.streamSettings?.realitySettings;
  if (outbound?.protocol !== 'vless' || isIP(next?.address ?? '') !== 4 || next.port !== 443
    || !user?.id || !reality?.publicKey || !reality?.shortId || !reality?.serverName) {
    throw new Error('Expected a generated VLESS/REALITY client profile.');
  }
  const query = new URLSearchParams({ encryption: 'none', security: 'reality', sni: reality.serverName,
    fp: reality.fingerprint, pbk: reality.publicKey, sid: reality.shortId, type: 'tcp', flow: user.flow });
  return `vless://${user.id}@${next.address}:443?${query}#${encodeURIComponent(name)}`;
}
