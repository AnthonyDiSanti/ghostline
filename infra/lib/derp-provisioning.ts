import { GetParameterCommand, PutParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { derpPublicIdentity, generateDerpIdentity, type DerpPublicIdentity } from './derp-identity.js';
import type { DeploymentConfig } from './config.js';

export async function provisionDerpIdentity(client: SSMClient, config: DeploymentConfig, ip: string, work: string): Promise<DerpPublicIdentity & { created: boolean; version: number }> {
  // A private pending envelope gives an interrupted no-overwrite import one stable identity to resume.
  const prefix = config.parameterPrefix ?? '/ghostline/prod', name = `${prefix}/server/derp`;
  const pending = resolve(work, 'derp-pending.json');
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const get = async (parameter: string) => {
    try { return (await client.send(new GetParameterCommand({ Name: parameter, WithDecryption: true }))).Parameter; }
    catch (error) { if ((error as Error).name === 'ParameterNotFound') return undefined; throw error; }
  };
  let current = await get(name), created = false;
  if (!current) {
    if (!existsSync(pending)) writeFileSync(pending, generateDerpIdentity(ip), { mode: 0o600, flag: 'wx' });
    const value = readFileSync(pending, 'utf8');
    derpPublicIdentity(value, ip);
    try {
      await client.send(new PutParameterCommand({ Name: name, Type: 'SecureString', Tier: 'Standard', Overwrite: false, Value: value,
        Tags: Object.entries({ ...config.globalTags, System: 'derp' }).map(([Key, Value]) => ({ Key, Value })) }));
      created = true;
    } catch (error) { if ((error as Error).name !== 'ParameterAlreadyExists') throw error; }
    current = await get(name);
    if (current?.Value !== value) throw new Error('DERP identity import differs from its pending envelope; investigate without overwriting.');
  }
  if (current?.Type !== 'SecureString' || !current.Value || !current.Version) throw new Error('Expected a versioned DERP SecureString identity.');
  if (existsSync(pending) && readFileSync(pending, 'utf8') !== current.Value) throw new Error('DERP pending import conflicts with the stored identity; values withheld.');
  const publicIdentity = derpPublicIdentity(current.Value, ip);
  const publicName = `${prefix}/derp/public`, encoded = JSON.stringify(publicIdentity);
  const previous = await get(publicName);
  if (previous && (previous.Type !== 'String' || previous.Value !== encoded)) throw new Error('DERP public pin differs from the stored TLS identity; do not rotate implicitly.');
  if (!previous) {
    await client.send(new PutParameterCommand({ Name: publicName, Type: 'String', Overwrite: false, Value: encoded,
      Tags: Object.entries({ ...config.globalTags, System: 'derp' }).map(([Key, Value]) => ({ Key, Value })) }));
  }
  const verified = await get(publicName);
  if (verified?.Value !== encoded) throw new Error('DERP public identity readback is incomplete.');
  rmSync(pending, { force: true });
  const result = { ...publicIdentity, created, version: current.Version };
  writeFileSync(resolve(work, 'derp-identity.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  return result;
}
