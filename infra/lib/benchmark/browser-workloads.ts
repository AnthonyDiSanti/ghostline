import type { Speed } from './model.js';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
};

async function latency(url: string, signal: AbortSignal): Promise<number> {
  // Consume the tiny response so connection reuse matches the subsequent download path.
  const start = performance.now();
  const response = await fetch(url, { signal, cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Latency probe failed.');
  await response.arrayBuffer();
  return performance.now() - start;
}

async function transfer(url: string, seconds: number, limit: number, latencyUrl?: string): Promise<Speed> {
  // Count every delivered chunk, including the unfinished final response, within one monotonic window.
  if (!(seconds > 0 && seconds <= 180 && Number.isFinite(seconds)) || !Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid transfer bounds.');
  const start = performance.now(), deadline = start + seconds * 1000, controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  const loaded: number[] = [];
  let bytes = 0, completedRequests = 0, emptyResponses = 0, finishedAt = deadline;
  const probes = latencyUrl ? (async () => {
    // Loaded HTTP latency is supporting evidence; a failed ping must not abort a working bulk transfer.
    while (!controller.signal.aborted) {
      try { loaded.push(await latency(latencyUrl, AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]))); }
      catch { if (controller.signal.aborted) break; }
      await new Promise<void>(resolve => {
        if (controller.signal.aborted) { resolve(); return; }
        const finish = () => { clearTimeout(wait); controller.signal.removeEventListener('abort', finish); resolve(); };
        const wait = setTimeout(finish, 1000); controller.signal.addEventListener('abort', finish, { once: true });
      });
    }
  })() : Promise.resolve();
  try {
    while (!controller.signal.aborted && performance.now() < deadline && bytes < limit) {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok || !response.body) throw new Error('Download failed.');
      const reader = response.body.getReader();
      const before = bytes;
      for (;;) {
        const chunk = await reader.read();
        if (performance.now() >= deadline || controller.signal.aborted) break;
        if (chunk.done) { completedRequests++; break; }
        bytes += Math.min(chunk.value.byteLength, limit - bytes);
        if (bytes >= limit) { finishedAt = performance.now(); controller.abort(); break; }
      }
      if (!controller.signal.aborted && bytes === before && ++emptyResponses >= 3) throw new Error('Empty download responses.');
    }
  } catch { if (!controller.signal.aborted && performance.now() < deadline) throw new Error('Download failed.'); }
  finally { clearTimeout(timer); controller.abort(); await probes; }
  // Freeze elapsed time at the deadline/cap, excluding abort and browser cleanup overhead.
  const elapsed = Math.max(0.001, (Math.min(finishedAt, deadline) - start) / 1000);
  return { accounting: 'streamed-v2', mbps: bytes * 8 / elapsed / 1e6, bytes, seconds: elapsed, limited: bytes >= limit,
    completedRequests, loadedLatencyMs: median(loaded) };
}

// Bundle browser code separately so the TypeScript loader cannot inject Node-only helpers into page evaluation.
async function benchmarkSpeed({ seconds, limit, endpoint }: { seconds: number; limit: number; endpoint: string }): Promise<Speed> {
  const ping = new URL(endpoint); ping.searchParams.set('bytes', '0');
  const idle: number[] = [];
  for (let n = 0; n < 3; n++) idle.push(await latency(ping.href, AbortSignal.timeout(3000)));
  const url = new URL(endpoint); url.searchParams.set('bytes', '25000000');
  const result = await transfer(url.href, seconds, limit, ping.href);
  return { ...result, latencyMs: median(idle), jitterMs: median(idle.slice(1).map((v, i) => Math.abs(v - idle[i]!))) };
}

async function benchmarkDownload({ url, seconds }: { url: string; seconds: number }): Promise<Speed> {
  return transfer(url, seconds, 512 * 1024 ** 2);
}

async function benchmarkStream({ url, seconds }: { url: string; seconds: number }) {
  // Bounded playback pacing avoids finishing a full buffer wait after the measurement deadline.
  const result: number[] = [], start = performance.now(), deadline = start + seconds * 1000;
  let buffer = 0, started = false;
  while (performance.now() < deadline) {
    if (buffer > 16) {
      const wait = Math.min((buffer - 16) * 1000, deadline - performance.now());
      await new Promise(r => setTimeout(r, Math.max(0, wait)));
      buffer -= wait / 1000;
    }
    if (performance.now() >= deadline) break;
    const t = performance.now();
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(Math.ceil(Math.min(30_000, Math.max(1, deadline - t)))) });
      if (!response.ok) throw new Error('Streaming request failed.');
      const body = await response.arrayBuffer();
      if (body.byteLength !== 12_500_000) throw new Error('Unexpected streaming object.');
    } catch {
      if (performance.now() >= deadline) break;
      throw new Error('Streaming request failed.');
    }
    const duration = (performance.now() - t) / 1000;
    result.push(duration);
    buffer = (started ? Math.max(0, buffer - duration) : buffer) + 4;
    if (buffer >= 8) started = true;
  }
  return { durations: result, elapsedSeconds: (performance.now() - start) / 1000 };
}

Object.assign(globalThis, { benchmarkSpeed, benchmarkDownload, benchmarkStream });
