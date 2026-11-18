import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('withholds raw record values and subprocess diagnostics through the actual Python helpers', () => {
  // Execute the maintained fixture, not a copy of the parser/error sanitizer in TypeScript.
  const result = spawnSync('python3', ['-B', new URL('./fixtures/logging-privacy.py', import.meta.url).pathname], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ summarizationRedacted: true, errorsRedacted: true });
});
