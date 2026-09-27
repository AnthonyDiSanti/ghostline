import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright-core';
import type { Speed, StreamResult } from './model.js';
import { simulateStream } from './model.js';

export async function measurementDeadline<T>(work: Promise<T>, seconds: number): Promise<T> {
  // A broken page/engine timer must not hang an unattended campaign; the caller closes its context on expiry.
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Benchmark worker exceeded its deadline.')), (seconds + 5) * 1000);
    })]);
  } finally { clearTimeout(timer!); }
}

export async function speedTest(browser: Browser, script: string, seconds: number, limit = 512 * 1024 ** 2, endpoint = 'https://speed.cloudflare.com/__down'): Promise<Speed> {
  // The same streamed-byte browser workload runs identically for direct, SOCKS/REALITY and routed AWG paths.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const edges = new Set<string>();
    // Keep only the CDN colo code, never request URLs, client addresses or unique request identifiers.
    page.on('response', response => {
      if (new URL(response.url()).origin !== new URL(endpoint).origin) return;
      const edge = response.headers()['cf-ray']?.match(/-([A-Z]{3})$/)?.[1];
      if (edge) edges.add(edge);
    });
    const fixtureOrigin = new URL(endpoint).origin + '/ghostline-benchmark-runner';
    await page.route(fixtureOrigin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Benchmark</title>' }));
    await page.goto(fixtureOrigin);
    await page.addScriptTag({ content: readFileSync(script, 'utf8') });
    const result = await measurementDeadline(page.evaluate(args => (globalThis as any).benchmarkSpeed(args), { seconds, limit, endpoint }), seconds + 10);
    return { ...result, provider: new URL(endpoint).hostname, edges: [...edges].sort() };
  } finally { await context.close(); }
}

export async function downloadTest(browser: Browser, url: string, seconds: number, workloadScript: string): Promise<Speed> {
  // A controlled independent origin prevents one public speed-test provider from condemning a region.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const fixtureOrigin = new URL(url).origin + '/ghostline-benchmark-runner';
    await page.route(fixtureOrigin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Benchmark</title>' }));
    await page.goto(fixtureOrigin);
    await page.addScriptTag({ content: readFileSync(workloadScript, 'utf8') });
    return await measurementDeadline(page.evaluate(args => (globalThis as any).benchmarkDownload(args), { url, seconds }), seconds);
  } finally { await context.close(); }
}

export async function streamingTest(browser: Browser, url: string, seconds: number, workloadScript: string): Promise<StreamResult> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const fixtureOrigin = new URL(url).origin + '/ghostline-benchmark-runner';
    await page.route(fixtureOrigin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Benchmark</title>' }));
    await page.goto(fixtureOrigin);
    await page.addScriptTag({ content: readFileSync(workloadScript, 'utf8') });
    const result = await measurementDeadline(page.evaluate(args => (globalThis as any).benchmarkStream(args), { url, seconds }), seconds);
    return simulateStream(result.durations, 4, 8, 20, result.elapsedSeconds);
  } finally { await context.close(); }
}
