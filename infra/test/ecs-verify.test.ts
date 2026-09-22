import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('requires working HTTPS before proving metadata isolation and rejects unexpected probe failures', () => {
  // Exercise the real namespace probe with mocked sockets, including failures that must not count as isolation.
  const script = fileURLToPath(new URL('./fixtures/ecs-verify-probe.py', import.meta.url));
  const results = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(results).toEqual([
    { mode: 'blocked', passed: true, evidence: { publicIp: '198.51.100.1', metadataBlocked: true } },
    { mode: 'metadata-open', passed: false },
    { mode: 'https-failed', passed: false },
    { mode: 'socket-failed', passed: false },
  ]);
});
