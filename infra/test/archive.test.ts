import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { installationArchive } from '../lib/archive.js';

it('preserves configuration bytes without importing Mac metadata sidecars', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-archive-'));
  try {
    mkdirSync(join(folder, 'config'));
    const config = join(folder, 'config/server.json');
    const bytes = Buffer.from('{"fixture":"not-a-real-credential"}\n');
    writeFileSync(config, bytes);
    writeFileSync(join(folder, 'compose.json'), '{}');
    // A real extended attribute reproduces the macOS archive pollution seen during live export.
    if (process.platform === 'darwin') execFileSync('xattr', ['-w', 'com.ghostline.fixture', 'metadata', config]);
    const archive = installationArchive(folder);
    const names = execFileSync('tar', ['-tf', '-'], { input: archive }).toString().trim().split('\n');
    expect(names.sort()).toEqual(['compose.json', 'config/', 'config/server.json']);
    expect(execFileSync('tar', ['-xOf', '-', 'config/server.json'], { input: archive })).toEqual(bytes);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
