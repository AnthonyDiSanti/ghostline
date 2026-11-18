import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('grants only a verified pending initializer leased credentials, private DNS and TLS egress', () => {
  // Run real discovery/policy generation against synthetic task and kernel binding inputs.
  const fixture = fileURLToPath(new URL('./fixtures/initializer-network.py', import.meta.url));
  expect(JSON.parse(execFileSync('python3', ['-B', fixture], { encoding: 'utf8' }))).toEqual({ passed: true });
});
