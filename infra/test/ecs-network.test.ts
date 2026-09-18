import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('closes forwarding before changing source identities and filters unconfigured/host traffic', () => {
  // Execute the real Python policy builder with a fake command boundary; live packet checks are separate.
  const script = fileURLToPath(new URL('./fixtures/ecs-network-policy.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.nat).toContain('-s 172.17.0.2/32 -o ens5 -j SNAT --to-source 10.79.0.11');
  expect(result.nat).toContain('-s 172.17.0.3/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.rules).toContain('-i docker0 -d 169.254.0.0/16 -j DROP');
  expect(result.rules).toContain('-i docker0 -o docker0 -j DROP');
  expect(result.empty.every((line: string) => !line.includes('ACCEPT'))).toBe(true);
  expect(result.empty.slice(-3)).toEqual(['-i docker0 -j DROP', '-o docker0 -j DROP', '-j RETURN']);
});

it('quarantines only the changing engine and never flushes sibling flows', () => {
  const script = fileURLToPath(new URL('./fixtures/ecs-network-reconcile.py', import.meta.url));
  const results = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(results.cold[0][2].some((rule: string) => rule.includes('ACCEPT'))).toBe(false);
  for (const scenario of ['restart', 'remove', 'move']) {
    const calls = results[scenario];
    const initial = calls[0][2] as string[];
    expect(initial.some(rule => rule.includes('172.17.0.2/32') && rule.includes('ACCEPT'))).toBe(true);
    expect(initial.some(rule => rule.includes('172.17.0.3/32') && rule.includes('ACCEPT'))).toBe(false);
    const cleanup = calls.filter((call: string[]) => call[0] === 'conntrack');
    expect(cleanup).toContainEqual(['conntrack', '-D', '--orig-src', '172.17.0.3']);
    expect(cleanup).toContainEqual(['conntrack', '-D', '--reply-src', '172.17.0.3']);
    expect(cleanup.flat()).not.toContain('172.17.0.2');
    expect(cleanup.flat()).not.toContain('172.17.0.0/16');
    if (scenario === 'move') expect(cleanup).toContainEqual(['conntrack', '-D', '--orig-src', '172.17.0.4']);
    expect(calls.some((call: string[]) => call.includes('DOCKER-USER') || call.includes('POSTROUTING'))).toBe(false);
  }
});

it('discovers exact gateway engines and catches restart generations and ambiguous peers', () => {
  const script = fileURLToPath(new URL('./fixtures/ecs-network-discovery.py', import.meta.url));
  const result = JSON.parse(execFileSync('python3', ['-B', script], { encoding: 'utf8' }));
  expect(result.initial.xray).toEqual(result.restart.xray);
  expect(result.initial.awg.id).toBe(result.restart.awg.id);
  expect(result.initial.awg.started).not.toBe(result.restart.awg.started);
  expect(result['not-running']).toEqual({});
  expect(result['no-address']).toEqual({ xray: result.initial.xray });
  for (const scenario of ['duplicate', 'foreign-network', 'same-address']) expect(result[scenario]).toBe(false);
});
