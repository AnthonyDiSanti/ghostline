import { readFileSync, statSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { resolve } from 'node:path';
import { GetParameterCommand, PutParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { validateBundle, parseJson } from './runtime.js';
import type { DeploymentConfig } from './config.js';

export interface CredentialParameter { name: string; value: string; system: string }

function protectedFile(path: string): string {
  // Credential imports must not silently accept files readable by other local users.
  if (statSync(path).mode & 0o077) throw new Error('Credential source must have private filesystem permissions.');
  return readFileSync(path, 'utf8');
}

export function validateAwgIdentity(server: string, client: string): void {
  // Match both directions of the X25519 identity and the peer PSK before copying an existing profile.
  const fields = (text: string) => Object.fromEntries(text.split('\n').filter(line => line.includes(' = '))
    .map(line => { const split = line.indexOf(' = '); return [line.slice(0, split).trim(), line.slice(split + 3).trim()]; }));
  const publicKey = (key: string) => {
    const bytes = Buffer.from(key ?? '', 'base64');
    if (bytes.length !== 32) throw new Error('Invalid AWG private key encoding.');
    return createPublicKey(createPrivateKey({ format: 'der', type: 'pkcs8',
      key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), bytes]) }))
      .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
  };
  const [serverInterface, ...serverPeers] = server.split('[Peer]');
  const [clientInterface, clientPeer] = client.split('[Peer]');
  const si = fields(serverInterface!); const ci = fields(clientInterface!); const cp = fields(clientPeer ?? '');
  const sp = serverPeers.map(fields).find(peer => peer.PublicKey === publicKey(ci.PrivateKey!));
  if (!sp || cp.PublicKey !== publicKey(si.PrivateKey!) || cp.PresharedKey !== sp.PresharedKey
    || ci.Address !== sp.AllowedIPs) throw new Error('AWG client/server identity mismatch.');
  for (const field of ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'HeaderProtectionKey']) {
    if (ci[field] !== si[field]) throw new Error('AWG obfuscation settings mismatch.');
  }
}

export function credentialParameters(root: string, source: string): CredentialParameter[] {
  // Import complete preserved identities, never regenerate credentials as a side effect of deployment.
  const bundlePath = resolve(root, `${source}-runtime.json`);
  const bundleText = protectedFile(bundlePath);
  const bundle = validateBundle(parseJson(bundleText), source);
  const server = parseJson(Buffer.from(bundle.files['server.json']!, 'base64').toString());
  const ids = server.inbounds[0].settings.clients.map((client: { id: string }) => client.id);
  const result: CredentialParameter[] = [{ name: '/ghostline/prod/server/xray', value: bundleText, system: 'xray' },
    { name: '/ghostline/prod/server/awg', value: protectedFile(resolve(root, `${source}-awg/awg0.conf`)), system: 'amneziawg' }];
  for (const device of ['macos', 'ios']) {
    const value = protectedFile(`${bundlePath}.clients/${device}.json`);
    const profile = parseJson(value);
    if (!ids.includes(profile.outbounds?.[0]?.settings?.vnext?.[0]?.users?.[0]?.id)) {
      throw new Error('Xray device identity is absent from the preserved server.');
    }
    const awg = protectedFile(resolve(root, `${source}-awg/${device}.conf`));
    validateAwgIdentity(result[1]!.value, awg);
    result.push({ name: `/ghostline/prod/clients/${device}/xray`, value, system: 'xray' },
      { name: `/ghostline/prod/clients/${device}/awg`, value: awg, system: 'amneziawg' });
  }
  if (result.some(parameter => Buffer.byteLength(parameter.value) > 4096)) throw new Error('Credential parameter exceeds Standard tier size.');
  return result;
}

export async function importParameters(client: Pick<SSMClient, 'send'>, config: DeploymentConfig, parameters: CredentialParameter[]) {
  // Validate all conflicts first; a retry accepts byte-identical values but never overwrites identity.
  const missing: CredentialParameter[] = [];
  for (const parameter of parameters) {
    try {
      const existing = await client.send(new GetParameterCommand({ Name: parameter.name, WithDecryption: true }));
      if (existing.Parameter?.Type !== 'SecureString' || existing.Parameter.Value !== parameter.value) {
        throw new Error('Existing parameter differs; refusing credential overwrite.');
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'ParameterNotFound') throw error;
      missing.push(parameter);
    }
  }
  for (const parameter of missing) {
    await client.send(new PutParameterCommand({ Name: parameter.name, Value: parameter.value, Type: 'SecureString',
      Tier: 'Standard', Overwrite: false, Tags: [...Object.entries(config.globalTags).map(([Key, Value]) => ({ Key, Value })),
        { Key: 'System', Value: parameter.system }] }));
  }
  for (const parameter of parameters) {
    const actual = await client.send(new GetParameterCommand({ Name: parameter.name, WithDecryption: true }));
    if (actual.Parameter?.Value !== parameter.value) throw new Error('Parameter round-trip did not preserve credentials.');
  }
  return { created: missing.length, verified: parameters.length };
}
