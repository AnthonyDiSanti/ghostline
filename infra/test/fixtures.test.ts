import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { getDeployment } from '../lib/config.js';
import { ecsUserData } from '../lib/ecs-user-data.js';
import { ecsVerificationCommand } from '../lib/ecs-verification.js';
import { renderFixture } from '../lib/fixtures.js';

it('requires exact fixture inputs and preserves shell syntax without recursive interpolation', () => {
  const file = new URL('./fixtures/render.sh', import.meta.url);
  const value = '$& $1 ${value} @@OTHER@@';
  expect(renderFixture(file, { VALUE: value })).toBe(readFileSync(file, 'utf8').split('@@VALUE@@').join(value));
  expect(() => renderFixture(file)).toThrow('Missing fixture value: VALUE');
  expect(() => renderFixture(file, { VALUE: 'ok', OTHER: 'unused' })).toThrow('Unused fixture values');
});

it.each(['stockholm-ecs'])('renders complete, bounded bootstrap inputs for %s', id => {
  const config = getDeployment(id);
  const script = ecsUserData(config, config.resourceName);
  expect(script).not.toMatch(/@@[A-Z_]+@@/);
  expect(Buffer.byteLength(script)).toBeLessThan(16_384);
  expect(script).toContain(`ECS_CLUSTER=${config.resourceName}\nECS_ENABLE_TASK_IAM_ROLE=false`);
  expect(script).toContain(`"family":"${config.resourceName}"`);
  execFileSync('bash', ['-n'], { input: script });
  // Check the exact script payloads and dependency units, including their decoding boundaries.
  const payloads = [...script.matchAll(/echo '([A-Za-z0-9+/=]+)' \| base64 -d \| gzip -d > (\S+)/g)];
  expect(payloads).toHaveLength(3);
  for (const [, base64, destination] of payloads) {
    const name = destination!.split('/').at(-1);
    expect(gunzipSync(Buffer.from(base64!, 'base64'))).toEqual(readFileSync(new URL(`../../runtime/ecs/${name}`, import.meta.url)));
  }
  expect(script).toContain('Requires=ghostline-network.service ghostline-config.service');
  expect(script).toContain('Before=docker.service ecs.service');
  expect(script.indexOf('systemctl start ghostline-config.service')).toBeLessThan(script.indexOf('systemctl enable --now --no-block ecs'));
});

it('rejects multiline or shell-bearing bootstrap identifiers', () => {
  const config = getDeployment('stockholm-ecs');
  for (const value of ['cluster\nECS', '$(false)', "bad'quote"]) {
    expect(() => ecsUserData(config, value)).toThrow('Invalid ECS bootstrap identity');
    expect(() => ecsUserData({ ...config, resourceName: value }, 'cluster')).toThrow('Invalid ECS bootstrap identity');
  }
});

it.each([0, 17])('ships both verifier files and removes temporary code after exit %i', exit => {
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-transport-'));
  try {
    // Substitute the interpreter with a file comparer, never run Docker, nsenter or public probes locally.
    const python = join(folder, 'python3');
    copyFileSync(new URL('./fixtures/verify-transport.sh', import.meta.url), python);
    chmodSync(python, 0o755);
    const result = spawnSync('sh', [], { input: ecsVerificationCommand(), encoding: 'utf8', env: {
      ...process.env, PATH: `${folder}:${process.env.PATH}`, TMPDIR: folder,
      GHOSTLINE_TEST_VERIFIER: fileURLToPath(new URL('../../runtime/ecs/verify.py', import.meta.url)),
      GHOSTLINE_TEST_NETWORK_PROBE: fileURLToPath(new URL('../../runtime/ecs/network-probe.py', import.meta.url)),
      GHOSTLINE_TEST_EXIT: String(exit),
    } });
    expect(result.status).toBe(exit);
    expect(result.stderr).toBe('');
    const temporary = result.stdout.trim();
    expect(temporary).toContain(folder);
    expect(existsSync(temporary)).toBe(false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
