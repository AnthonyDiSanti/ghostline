import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('scan detects serialized secrets and reports bounded, incomplete coverage', () => {
  // Execute the real scanner against disposable synthetic files, including an over-budget file.
  const fixture = fileURLToPath(new URL('./fixtures/runtime-storage-probe-check.py', import.meta.url));
  expect(JSON.parse(execFileSync('python3', ['-B', fixture], { encoding: 'utf8' }))).toEqual({ passed: true });
});
