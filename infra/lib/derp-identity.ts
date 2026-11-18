import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, randomBytes, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isIPv4 } from 'node:net';

export interface DerpBundle { schemaVersion: 1; ip: string; certificate: string; privateKey: string; serverKey: string }
export interface DerpPublicIdentity { ip: string; pin: string; expires: string }

export function derpPublicIdentity(value: string, expectedIp?: string, now = new Date()): DerpPublicIdentity {
  // Validate without exposing OpenSSL/JSON parser errors, which can quote private input.
  try {
    const bundle = JSON.parse(value) as DerpBundle;
    if (Buffer.byteLength(value) > 4096 || Object.keys(bundle).sort().join(',') !== 'certificate,ip,privateKey,schemaVersion,serverKey'
      || bundle.schemaVersion !== 1 || !isIPv4(bundle.ip) || expectedIp && bundle.ip !== expectedIp
      || !/^privkey:[a-f0-9]{64}$/.test(bundle.serverKey)) throw new Error();
    const key = Buffer.from(bundle.serverKey.slice(8), 'hex');
    if (key[0]! & 7 || key[31]! & 128 || !(key[31]! & 64)) throw new Error();
    const certificate = new X509Certificate(bundle.certificate);
    const publicKey = createPublicKey(createPrivateKey(bundle.privateKey));
    if (certificate.checkIP(bundle.ip) !== bundle.ip || now < certificate.validFromDate || now >= certificate.validToDate
      || !publicKey.export({ type: 'spki', format: 'der' }).equals(certificate.publicKey.export({ type: 'spki', format: 'der' }))) throw new Error();
    return { ip: bundle.ip, pin: `sha256-raw:${createHash('sha256').update(certificate.raw).digest('hex')}`, expires: certificate.validToDate.toISOString() };
  } catch { throw new Error('Invalid DERP certificate/key identity; contents withheld.'); }
}

export function generateDerpIdentity(ip: string): string {
  // Provision only once. Temporary private PEM files are removed even if OpenSSL or validation fails.
  if (!isIPv4(ip)) throw new Error('DERP provisioning requires a literal IPv4 address.');
  const directory = mkdtempSync(join(tmpdir(), 'ghostline-derp-identity-'));
  try {
    const key = join(directory, 'key.pem'), certificate = join(directory, 'certificate.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-sha256', '-noenc',
      '-keyout', key, '-out', certificate, '-config', '/dev/null', '-subj', `/CN=${ip}`, '-addext', `subjectAltName=IP:${ip}`, '-days', '365'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 });
    // Match upstream NewNode's Curve25519 clamping; the real relay proof verifies interoperability.
    const serverKey = randomBytes(32);
    serverKey[0] = serverKey[0]! & 248; serverKey[31] = serverKey[31]! & 127 | 64;
    const bundle: DerpBundle = { schemaVersion: 1, ip, certificate: readFileSync(certificate, 'utf8'),
      privateKey: readFileSync(key, 'utf8'), serverKey: `privkey:${serverKey.toString('hex')}` };
    const encoded = JSON.stringify(bundle);
    derpPublicIdentity(encoded, ip);
    return encoded;
  } catch { throw new Error('DERP identity generation failed; private tool output withheld.'); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
