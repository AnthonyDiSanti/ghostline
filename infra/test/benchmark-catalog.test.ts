import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('temporary catalog subprocess propagation', () => {
  it('writes membership only into the explicit temporary catalog', () => {
    const folder = mkdtempSync(resolve(tmpdir(), 'ghostline-catalog-'));
    const before = readFileSync('deployment.json', 'utf8'), catalog = JSON.parse(before);
    catalog.deployments['bm-example'] = { region: 'eu-central-1', availabilityZone: 'eu-central-1a', stackName: 'GhostlineBenchmark-example-gateway', resourceName: 'bm-example' };
    const path = resolve(folder, 'deployment.json'); writeFileSync(path, JSON.stringify(catalog));
    try {
      const result = spawnSync(process.execPath, ['--import=tsx', '--input-type=module', '-e',
        "import {getDeployment,getPublication} from './lib/config.ts'; import {persistPublication} from './lib/releases/operator.ts'; const p=getPublication(); p.members.push(getDeployment('bm-example').region); persistPublication(p);"],
      { encoding: 'utf8', env: { ...process.env, GHOSTLINE_CATALOG: path } });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(path, 'utf8')).imagePublication.members).toContain('eu-central-1');
      expect(readFileSync('deployment.json', 'utf8')).toBe(before);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('rejects unknown catalog fields before executing a command', () => {
    const folder = mkdtempSync(resolve(tmpdir(), 'ghostline-catalog-')), path = resolve(folder, 'deployment.json');
    const catalog = JSON.parse(readFileSync('deployment.json', 'utf8')); catalog.unknown = true; writeFileSync(path, JSON.stringify(catalog));
    try {
      const result = spawnSync(process.execPath, ['--import=tsx', '--input-type=module', '-e', "import './lib/config.ts'"], { encoding: 'utf8', env: { ...process.env, GHOSTLINE_CATALOG: path } });
      expect(result.status).not.toBe(0); expect(result.stderr).toContain('Invalid deployment catalog');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});
