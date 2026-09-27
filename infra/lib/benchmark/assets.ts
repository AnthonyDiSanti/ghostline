import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

export async function buildBenchmarkAssets(infra: string, work: string): Promise<{ probe: string; speed: string }> {
  // Build once locally. Lambda code is an asset, never another regional ECR/release artifact.
  const probe = resolve(work, 'probe-code');
  mkdirSync(probe, { recursive: true, mode: 0o700 });
  await build({ entryPoints: [resolve(infra, 'lambda/benchmark-probe.ts')], bundle: true, platform: 'node', target: 'node24', format: 'cjs',
    outfile: resolve(probe, 'index.js'), external: ['playwright-core'], logLevel: 'silent' });
  cpSync(resolve(infra, 'node_modules/playwright-core'), resolve(probe, 'node_modules/playwright-core'), { recursive: true });
  cpSync(resolve(infra, 'node_modules/@sparticuz/chromium/bin'), resolve(probe, 'bin'), { recursive: true });
  const speed = resolve(work, 'speed.js');
  await build({ entryPoints: [resolve(infra, 'lib/benchmark/browser-workloads.ts')],
    bundle: true, platform: 'browser', format: 'iife', outfile: speed, logLevel: 'silent' });
  return { probe, speed };
}
