import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { buildBenchmarkAssets } from '../lib/benchmark/assets.js';
import { checkAccess } from '../lib/benchmark/browser.js';
import { launchBrowser } from '../lib/benchmark/local.js';
import { downloadTest, speedTest, streamingTest } from '../lib/benchmark/measurement.js';

// A local HTTP fixture exercises the real browser and streamed-byte workload without external data traffic.
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Timing-Allow-Origin', '*');
  if (req.url === '/identity' && req.headers['user-agent']?.includes('HeadlessChrome')) {
    res.writeHead(403); res.end('Browser identification rejected'); return;
  }
  if (req.url === '/modal') {
    res.setHeader('Content-Type', 'text/html'); res.end('<main>Example Domain</main><div role="dialog">Verify your age to continue</div>'); return;
  }
  if (req.url === '/slow') {
    // The first response cannot finish inside the window: completed-response accounting would report zero.
    res.setHeader('Content-Length', 25_000_000);
    const timer = setInterval(() => res.write(Buffer.alloc(25_000, 1)), 50);
    res.on('close', () => clearInterval(timer)); return;
  }
  if (req.url?.startsWith('/__down')) {
    const bytes = Number(new URL(req.url, 'http://fixture').searchParams.get('bytes') ?? 100_000);
    const body = Buffer.alloc(bytes, 7); res.setHeader('Content-Length', bytes);
    setTimeout(() => res.end(body), 40); return;
  }
  if (req.url === '/segment') { res.setHeader('Content-Length', 12_500_000); res.end(Buffer.alloc(12_500_000, 1)); return; }
  const body = req.url === '/blocked' ? 'Not available in your country' : req.url === '/challenge' ? 'Just a moment, checking your browser' : 'Example Domain';
  res.setHeader('Content-Type', 'text/html'); res.end(`<main>${body}</main>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`;
const assets = await buildBenchmarkAssets(process.cwd(), resolve('../.local/benchmark-integration'));
const browser = await launchBrowser();
try {
  for (const [path, status] of [['/', 'pass'], ['/identity', 'pass'], ['/modal', 'restricted'], ['/blocked', 'restricted'], ['/challenge', 'inconclusive']]) {
    assert.equal((await checkAccess(browser, { url: origin + path, expectedText: 'Example Domain' })).status, status);
  }
  const sample = await speedTest(browser, assets.speed, 2, 100_000_000, origin + '/__down');
  assert(sample.mbps > 0, 'Delivered bytes must be measured');
  assert(sample.seconds >= 1.5 || sample.limited, 'Honor the full measurement window unless byte-capped');
  assert(sample.seconds < 4, 'Deadline must be enforced');
  const limited = await speedTest(browser, assets.speed, 10, 5_000_000, origin + '/__down');
  assert(limited.limited && limited.seconds < 10, 'Byte cap must finish early');
  const transferred = await downloadTest(browser, origin + '/__down?bytes=5000000', 1, assets.speed);
  assert(transferred.bytes > 0 && transferred.seconds < 3);
  const partial = await downloadTest(browser, origin + '/slow', 2, assets.speed);
  assert.equal(partial.accounting, 'streamed-v2'); assert.equal(partial.completedRequests, 0);
  assert(partial.bytes > 700_000 && partial.bytes < 1_200_000, 'Count delivered chunks of the unfinished response');
  assert(partial.mbps > 2.8 && partial.mbps < 4.8 && partial.seconds === 2);
  assert.equal(limited.bytes, 5_000_000, 'Cap bytes exactly rather than rounding whole responses');
  const start = Date.now();
  const streaming = await streamingTest(browser, origin + '/segment', 2, assets.speed);
  assert(streaming.segments > 0 && streaming.underruns === 0 && Date.now() - start < 4000);
  console.log('Native browser classification, streamed-byte accounting, byte/time limits and controlled downloads passed.');
} finally { await browser.close(); server.close(); server.closeAllConnections(); }
