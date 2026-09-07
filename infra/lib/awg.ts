import { generateKeyPairSync, randomBytes, randomInt } from 'node:crypto';
import { isIP } from 'node:net';

function keyPair() {
  // X25519 DER wrappers end in the raw 32-byte keys used by AmneziaWG.
  const pair = generateKeyPairSync('x25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('base64'),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64'),
  };
}

export function awgParameters() {
  // Port Amnezia 5.0.1.5 AwgInstaller generation, including its packet-size collision constraints.
  const s1 = randomInt(12, 150);
  let s2: number;
  do { s2 = randomInt(12, 150); } while ([s1, 12].includes(s2) || s1 + 148 === s2 + 92);
  let s3: number;
  do { s3 = randomInt(12, 64); } while ([s1, s2, 12].includes(s3) || s1 + 148 === s3 + 64 || s2 + 92 === s3 + 64);
  return {
    Jc: randomInt(4, 7), Jmin: 10, Jmax: 50, S1: s1, S2: s2, S3: s3, S4: 12,
    H1: 1, H2: 2, H3: 3, H4: 4, HeaderProtectionKey: keyPair().privateKey,
    ContentPaddingAddition: '10-100', RekeyAfterTime: '100-120', RekeyTimeout: '3-7',
    RejectAfterTime: '150-180', KeepaliveTimeout: '5-15', MaxHandshakeAttempts: '15-20',
    RandomTrailers: 'on', DisableCookies: 'on',
  };
}

export function generateAwgProfiles(endpoint: string) {
  if (isIP(endpoint) !== 4) throw new Error('AWG endpoint must be an IPv4 address.');
  const server = keyPair();
  const parameters = awgParameters();
  const settings = Object.entries(parameters).map(([name, value]) => `${name} = ${value}`).join('\n');
  const peers = ['macos', 'ios'].map((name, index) => ({ name, address: `10.78.0.${index + 2}`, keys: keyPair(), psk: randomBytes(32).toString('base64') }));
  const serverConfig = `[Interface]\nPrivateKey = ${server.privateKey}\nAddress = 10.78.0.1/24\nListenPort = 443\nMTU = 1280\n${settings}\n`
    + peers.map(peer => `\n[Peer]\nPublicKey = ${peer.keys.publicKey}\nPresharedKey = ${peer.psk}\nAllowedIPs = ${peer.address}/32\n`).join('');
  // Full-device profiles capture IPv6 too; this IPv4 server does not forward it to the internet.
  const profiles = Object.fromEntries(peers.map(peer => [peer.name,
    `[Interface]\nPrivateKey = ${peer.keys.privateKey}\nAddress = ${peer.address}/32\nDNS = 1.1.1.1, 1.0.0.1\nMTU = 1280\n${settings}\n`
    + `\n[Peer]\nPublicKey = ${server.publicKey}\nPresharedKey = ${peer.psk}\nEndpoint = ${endpoint}:443\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25-35\n`,
  ]));
  return { serverConfig, profiles };
}
