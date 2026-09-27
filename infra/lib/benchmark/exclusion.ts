import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function assertBenchmarkExclusion(): void {
  // A private catalog temporarily extends live registry membership; other writers must not reconcile an older catalog.
  const path = fileURLToPath(new URL('../../../.local/benchmarks/active.json', import.meta.url));
  if (!existsSync(path)) return;
  const active = JSON.parse(readFileSync(path, 'utf8'));
  if (!active.owner || active.owner !== process.env.GHOSTLINE_BENCHMARK_OWNER) throw new Error('A benchmark campaign owns deployment/publication changes. Resume or clean it up first.');
}
