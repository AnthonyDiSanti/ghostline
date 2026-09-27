import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeploymentConfig } from '../lib/config.js';

const state = vi.hoisted(() => ({ protocol: 'awg', paused: false }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, mkdtempSync: () => '/tmp/synthetic-client-fixture', writeFileSync: vi.fn(), rmSync: vi.fn(),
    readFileSync: (path: any, ...args: any[]) => typeof path === 'string' && path.startsWith('/synthetic/')
      ? path.endsWith('.json') ? JSON.stringify({ outbounds: [{ protocol: 'vless' }] }) : 'synthetic fixture'
      : (actual.readFileSync as any)(path, ...args) };
});
vi.mock('node:child_process', () => ({ spawnSync: (executable: string, args: string[]) => {
  // Model unavailable UDP with a working sibling TCP tunnel, including the deliberate pause/recovery probe.
  if (args.includes('xray-image')) state.protocol = 'xray';
  if (args.includes('awg-image')) state.protocol = 'awg';
  if (args[0] === 'pause') state.paused = true;
  if (args[0] === 'unpause') state.paused = false;
  return { status: 0, stdout: executable === '/sbin/route' ? 'interface: en0'
    : executable === 'curl' ? state.protocol === 'xray' && !state.paused ? '192.0.2.1' : ''
    : args[0] === 'port' ? '127.0.0.1:1080' : '' };
} }));
import { testEcsClients } from '../lib/ecs-client-test.js';

describe('independent protocol availability', () => {
  afterEach(() => vi.useRealTimers());
  const config = { id: 'synthetic' } as DeploymentConfig;
  const images = { xray: 'xray-image', awg: 'awg-image', 'gateway-config': 'config-image' };
  const outputs = { EndpointIp: '192.0.2.1', AwgEndpointIp: '192.0.2.2' };
  it('continues to REALITY after AWG is unavailable, without weakening its failure-closed check', async () => {
    vi.useFakeTimers(); state.paused = false;
    const unavailable = vi.fn(), exercise = vi.fn(async (_client: { protocol: string }) => {});
    const run = testEcsClients(config, '/synthetic', '/tmp', outputs, images, exercise,
      { proxyImage: 'proxy-image', protocols: ['awg', 'xray'], onUnavailable: unavailable });
    await vi.advanceTimersByTimeAsync(60_000); await run;
    expect(unavailable).toHaveBeenCalledExactlyOnceWith('awg');
    expect(exercise).toHaveBeenCalledOnce(); expect(exercise.mock.calls[0]?.[0]).toMatchObject({ protocol: 'xray' });
  });
  it('keeps ordinary client validation strict', async () => {
    vi.useFakeTimers();
    const run = testEcsClients(config, '/synthetic', '/tmp', outputs, images, undefined, { proxyImage: 'proxy-image', protocols: ['awg'] });
    const rejected = expect(run).rejects.toThrow('encrypted client HTTPS/exit check failed');
    await vi.advanceTimersByTimeAsync(60_000); await rejected;
  });
});
