import { spawnSync } from 'node:child_process';

export function installationArchive(folder: string): Buffer {
  // macOS tar otherwise emits AppleDouble sidecars that pollute complete configuration exports.
  const result = spawnSync('tar', ['-C', folder, '-cf', '-', 'config', 'compose.json'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Installation archive failed; output withheld.');
  return result.stdout;
}
