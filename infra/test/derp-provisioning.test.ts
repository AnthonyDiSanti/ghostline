import { GetParameterCommand, PutParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { getDeployment } from '../lib/config.js';
import { provisionDerpIdentity } from '../lib/derp-provisioning.js';
import { generateDerpIdentity } from '../lib/derp-identity.js';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture() {
  // The fake transport holds synthetic values privately; tests inspect write shape/count, never key bytes.
  const values = new Map<string, { Type: string; Value: string; Version: number }>();
  const writes: PutParameterCommand['input'][] = [];
  let failPublic = false;
  const client = { send: async (command: GetParameterCommand | PutParameterCommand) => {
    const name = command.input.Name!;
    if (command instanceof GetParameterCommand) {
      const value = values.get(name);
      if (!value) throw Object.assign(new Error('not found'), { name: 'ParameterNotFound' });
      return { Parameter: value };
    }
    if (failPublic && command.input.Type === 'String') throw Object.assign(new Error('interrupted'), { name: 'NetworkError' });
    writes.push(command.input);
    if (values.has(name)) throw Object.assign(new Error('exists'), { name: 'ParameterAlreadyExists' });
    values.set(name, { Type: command.input.Type!, Value: command.input.Value!, Version: 1 });
    return { Version: 1 };
  } } as unknown as SSMClient;
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-derp-provision-test-'));
  folders.push(folder);
  return { values, writes, folder, client, failPublic: (value: boolean) => { failPublic = value; },
    run: () => provisionDerpIdentity(client, getDeployment('stockholm-ecs'), '192.0.2.10', folder) };
}

it('creates one bounded server SecureString/public pin and preserves them on an ordinary retry', async () => {
  const f = fixture();
  const first = await f.run(), second = await f.run();
  expect(first.created).toBe(true); expect(second.created).toBe(false);
  expect(first.pin === second.pin).toBe(true);
  expect(f.writes.map(input => [input.Name, input.Type, input.Overwrite])).toEqual([
    ['/ghostline/prod/server/derp', 'SecureString', false], ['/ghostline/prod/derp/public', 'String', false],
  ]);
  expect(f.writes.every(input => Buffer.byteLength(input.Value!) <= 4096)).toBe(true);
  expect(existsSync(join(f.folder, 'derp-pending.json'))).toBe(false);
});

it('resumes an interrupted public-pin write without rotating the already imported server identity', async () => {
  const f = fixture(); f.failPublic(true);
  await expect(f.run()).rejects.toThrow('interrupted');
  expect(existsSync(join(f.folder, 'derp-pending.json'))).toBe(true);
  const stored = f.values.get('/ghostline/prod/server/derp')!.Value;
  f.failPublic(false);
  await f.run();
  expect(f.values.get('/ghostline/prod/server/derp')!.Value === stored).toBe(true);
  expect(f.writes.filter(input => input.Type === 'SecureString')).toHaveLength(1);
  expect(existsSync(join(f.folder, 'derp-pending.json'))).toBe(false);
});

it('refuses an existing identity for a different endpoint rather than overwriting any parameter', async () => {
  const f = fixture();
  f.values.set('/ghostline/prod/server/derp', { Type: 'SecureString', Version: 4, Value: generateDerpIdentity('192.0.2.11') });
  await expect(f.run()).rejects.toThrow('contents withheld');
  expect(f.writes).toHaveLength(0);
});
