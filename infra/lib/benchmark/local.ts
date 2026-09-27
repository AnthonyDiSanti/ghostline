import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import type { Browser } from 'playwright-core';

export async function launchBrowser(proxy?: string): Promise<Browser> {
  // SOCKS resolves hostnames remotely; disable UDP bypass and browser background traffic for consistent tests.
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../../../.local/benchmark-browsers', import.meta.url));
  const { chromium } = await import('playwright-core');
  return chromium.launch({ headless: true, channel: 'chromium', ...(proxy ? { proxy: { server: proxy } } : {}),
    args: ['--disable-quic', '--disable-background-networking', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ...(proxy ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] : [])] });
}
export function localNetwork(): { interface: string; gateway: string } {
  if (process.platform !== 'darwin') throw new Error('Home Wi-Fi benchmarking currently requires macOS.');
  // The actual route, rather than scutil alone, catches connected OneXray system extensions.
  const output = spawnSync('/sbin/route', ['-n', 'get', '1.1.1.1'], { encoding: 'utf8' });
  const networkInterface = output.stdout?.match(/interface:\s*(\S+)/)?.[1];
  const gateway = output.stdout?.match(/gateway:\s*([\d.]+)/)?.[1];
  if (output.status !== 0 || !networkInterface || networkInterface.startsWith('utun') || !gateway) throw new Error('Disconnect the native VPN before a direct benchmark.');
  return { interface: networkInterface, gateway };
}
export function routerMonitor(gateway: string): () => Promise<{ samples: number; medianMs?: number; lossPercent?: number }> {
  // Low-rate ICMP is supporting evidence only; collect aggregates without retaining LAN identities in reports.
  const child = spawn('/sbin/ping', ['-n', '-i', '1', gateway], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', chunk => { if (out.length < 200_000) out += chunk; });
  child.on('error', () => {});
  return async () => {
    child.kill('SIGINT');
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else { child.once('close', () => resolve()); setTimeout(resolve, 2000); } });
    const times = [...out.matchAll(/time[=<]([\d.]+) ms/g)].map(m => Number(m[1])).sort((a,b) => a-b);
    return { samples: times.length, medianMs: times[Math.floor(times.length / 2)], lossPercent: out.match(/([\d.]+)% packet loss/) ? Number(out.match(/([\d.]+)% packet loss/)![1]) : undefined };
  };
}
