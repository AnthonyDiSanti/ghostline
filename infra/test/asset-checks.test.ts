import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.each(['discovery', 'empty_discovery', 'missing_directory', 'missing_tools', 'native_failure', 'docker_fallback'])(
  'enforces asset-check behavior: %s', scenario => {
    // Python owns the runner's filesystem/process tests; keep them in the ordinary Vitest gate.
    const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./fixtures/asset-checks.py', import.meta.url)),
      `AssetChecks.test_${scenario}`], { encoding: 'utf8', timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
  },
);
