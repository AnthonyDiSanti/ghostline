import { expect, it, vi } from 'vitest';
import type { SSMClient } from '@aws-sdk/client-ssm';
import { importParameters, validateAwgIdentity } from '../lib/parameters.js';
import { generateAwgProfiles } from '../lib/awg.js';
import { getDeployment } from '../lib/config.js';

it('rejects mismatched AWG keys and obfuscation settings before import', () => {
  const one = generateAwgProfiles('192.0.2.1');
  const two = generateAwgProfiles('192.0.2.2');
  expect(() => validateAwgIdentity(one.serverConfig, one.profiles.macos!)).not.toThrow();
  expect(() => validateAwgIdentity(one.serverConfig, two.profiles.macos!)).toThrow('identity mismatch');
  expect(() => validateAwgIdentity(one.serverConfig, one.profiles.ios!.replace('H1 = 1', 'H1 = 8'))).toThrow('settings mismatch');
});

it('imports encrypted parameters once, verifies bytes and safely resumes identical values', async () => {
  const stored = new Map<string, string>();
  const send = vi.fn(async (command: any) => {
    if (command.constructor.name === 'PutParameterCommand') {
      expect(command.input).toMatchObject({ Type: 'SecureString', Tier: 'Standard', Overwrite: false });
      stored.set(command.input.Name, command.input.Value); return {};
    }
    if (!stored.has(command.input.Name)) throw Object.assign(new Error(), { name: 'ParameterNotFound' });
    return { Parameter: { Type: 'SecureString', Value: stored.get(command.input.Name) } };
  });
  const client = { send } as unknown as SSMClient;
  const values = [{ name: '/ghostline/prod/server/xray', value: 'synthetic-test-value', system: 'xray' }];
  expect(await importParameters(client, getDeployment('stockholm-ecs'), values)).toEqual({ created: 1, verified: 1 });
  expect(await importParameters(client, getDeployment('stockholm-ecs'), values)).toEqual({ created: 0, verified: 1 });
  expect(send.mock.calls.filter(([c]) => c.constructor.name === 'PutParameterCommand')).toHaveLength(1);
});

it('checks every conflict before making writes and does not echo credential values', async () => {
  const send = vi.fn(async (command: any) => {
    if (command.input.Name.endsWith('new')) throw Object.assign(new Error(), { name: 'ParameterNotFound' });
    return { Parameter: { Type: 'SecureString', Value: 'different-secret-value' } };
  });
  await expect(importParameters({ send } as unknown as SSMClient, getDeployment('stockholm-ecs'), [
    { name: '/ghostline/prod/server/new', value: 'new-value', system: 'xray' },
    { name: '/ghostline/prod/server/old', value: 'old-value', system: 'xray' },
  ])).rejects.toThrow('refusing credential overwrite');
  expect(send.mock.calls.every(([c]) => c.constructor.name === 'GetParameterCommand')).toBe(true);
});
