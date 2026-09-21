import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageInputsPath } from '../lib/image-inputs.js';
import { resolveStableImages } from '../lib/stable-images.js';
import { upstreamCommandEnvironment, upstreamDownloadCommand } from '../lib/upstream-download.js';

if (process.argv.length > 2) throw new Error('Usage: npm run images:build');
const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = resolve(root, '.local/deployments/image-builds');
mkdirSync(parent, { recursive: true, mode: 0o700 });
const work = mkdtempSync(resolve(parent, 'stable-'));
function command(executable: string, args: string[]): Buffer {
  // Resolution uses only public upstream inputs. Bounded calls fail closed instead of reusing stale versions.
  const result = spawnSync(executable, args, { timeout: 120_000, maxBuffer: 128 * 1024 * 1024,
    env: upstreamCommandEnvironment(process.env) });
  if (result.error || result.status !== 0) throw new Error(executable === 'gh'
    ? 'GitHub metadata read failed; check gh authentication for github.com and API availability. Captured output withheld.'
    : `${executable} failed while resolving official stable images.`);
  return result.stdout;
}
try {
  console.log('Resolve official stable Xray/AWG versions and verify upstream artifacts.');
  const inputs = resolveStableImages({
    download: url => {
      const request = upstreamDownloadCommand(url);
      return command(request.executable, request.args);
    },
    manifest: image => JSON.parse(command('docker', ['buildx', 'imagetools', 'inspect', image, '--format', '{{json .Manifest}}']).toString()),
  });
  console.log(`Selected Xray ${inputs.xray.tag}; AWG daemon ${inputs.awg.daemon.tag}, tools ${inputs.awg.tools.tag}.`);
  const candidate = resolve(work, 'image-inputs.json');
  writeFileSync(candidate, JSON.stringify(inputs, null, 2) + '\n');
  const result = spawnSync(process.execPath, ['--import=tsx', 'scripts/ecs-image-test.ts'], {
    cwd: resolve(root, 'infra'), env: { ...process.env, GHOSTLINE_IMAGE_INPUTS: candidate, GHOSTLINE_QUALIFIED_OUTPUT: resolve(work, 'qualified.json') }, stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error('Candidate image checks failed; recorded selection is unchanged.');
  // Promote only the fully checked set, atomically. Restart/deploy never contacts release channels.
  renameSync(candidate, imageInputsPath);
  renameSync(resolve(work, 'qualified.json'), resolve(parent, 'qualified.json'));
  console.log('Stable images built and checked. Recorded infra/image-inputs.json; live gateways are unchanged.');
} finally { rmSync(work, { recursive: true, force: true }); }
