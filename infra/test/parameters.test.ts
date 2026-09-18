import { expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SSMClient } from '@aws-sdk/client-ssm';
import { credentialParameters, importParameters, validateAwgIdentity } from '../lib/parameters.js';
import { generateAwgProfiles } from '../lib/awg.js';
import { generateXrayProfiles } from '../lib/xray.js';
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

function withCredentialFiles(check: (root: string) => void) {
  // Exercise the real portable-file boundary with generated, disposable identities and no cloud writes.
  const root = mkdtempSync(join(tmpdir(), 'ghostline-credentials-'));
  const xray = generateXrayProfiles('192.0.2.1');
  const awg = generateAwgProfiles('192.0.2.2');
  const files: Record<string, string> = { 'server/xray.json': JSON.stringify(xray.bundle), 'server/awg.conf': awg.serverConfig };
  for (const device of ['macos', 'ios']) {
    files[`clients/${device}/xray.json`] = JSON.stringify(xray.profiles[device]);
    files[`clients/${device}/awg.conf`] = awg.profiles[device]!;
  }
  try {
    for (const [name, value] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, value, { mode: 0o600 });
    }
    check(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

it('imports six portable files without changing their bytes or binding them to a retired target', () => {
  withCredentialFiles(root => {
    const parameters = credentialParameters(root);
    expect(parameters.map(p => p.name)).toEqual(['/ghostline/prod/server/xray', '/ghostline/prod/server/awg',
      '/ghostline/prod/clients/macos/xray', '/ghostline/prod/clients/macos/awg',
      '/ghostline/prod/clients/ios/xray', '/ghostline/prod/clients/ios/awg']);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    for (const parameter of parameters) {
      const relative = parameter.name.replace('/ghostline/prod/', '') + (parameter.system === 'xray' ? '.json' : '.conf');
      expect(hash(parameter.value)).toBe(hash(readFileSync(join(root, relative), 'utf8')));
    }
  });
});

it('refuses exposed files, mismatched devices and oversized payloads before any parameter writes', () => {
  withCredentialFiles(root => {
    const path = join(root, 'clients/ios/xray.json');
    const original = readFileSync(path, 'utf8');
    chmodSync(path, 0o644);
    expect(() => credentialParameters(root)).toThrow('private filesystem permissions');
    chmodSync(path, 0o600);
    writeFileSync(path, JSON.stringify(generateXrayProfiles('192.0.2.3').profiles.ios));
    expect(() => credentialParameters(root)).toThrow('identity');
    writeFileSync(path, original + ' '.repeat(4096));
    expect(() => credentialParameters(root)).toThrow('Standard tier size');
  });
});
