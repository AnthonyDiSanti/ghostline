import { runBenchmark } from '../lib/benchmark/runner.js';
const [action, input, ...extra] = process.argv.slice(2);
if (!action || !input || extra.length) throw new Error('Usage: npm run benchmark <plan|run|resume|status|cleanup> <file.json|campaign-id>');
try { await runBenchmark(action, input); }
catch (error) {
  // Provider/browser exceptions can contain invocation payloads or signed URLs; expose only deliberate local errors.
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Benchmark operation failed; inspect campaign phase and resume.');
  process.exitCode = 1;
}
