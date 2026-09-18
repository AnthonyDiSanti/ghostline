import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('requires protocol containers to run natively on the selected host architecture', () => {
  // An emulated x86 container on ARM must not masquerade as successful Graviton validation.
  const script = fileURLToPath(new URL('./fixtures/ecs-verify-architecture.py', import.meta.url));
  expect(JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' })))
    .toEqual(['rejected', 'arm64', 'rejected', 'rejected']);
});

it('rejects disk-backed, writable, unprotected and incorrectly owned configuration mounts', () => {
  // Exercise the production verifier against independent mount/filesystem/permission failures.
  const script = fileURLToPath(new URL('./fixtures/ecs-verify-storage.py', import.meta.url));
  const results = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  for (const protocol of ['xray', 'awg']) expect(results[protocol]).toEqual({ valid: true, disk: false, writable: false,
    'wrong-source': false, 'wrong-type': false, owner: false, permissions: false,
    'file-mode': false, 'file-owner': false, 'missing-noexec': false });
  expect(results.environment).toEqual([true, false, false, false, false]);
});

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

it('requires one enforced task budget without engine ceilings or recorded OOM events', () => {
  const script = fileURLToPath(new URL('./fixtures/ecs-verify-memory.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.valid).toMatchObject({ taskLimitMiB: 1126, agentReservedMiB: 666, currentMiB: 80 });
  for (const scenario of ['uncapped', 'engine-cap', 'oom', 'disabled', 'unrelated']) expect(result[scenario]).toBe(false);
});
