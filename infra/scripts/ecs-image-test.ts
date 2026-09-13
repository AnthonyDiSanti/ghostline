import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareImage } from '../lib/ecs-images.js';
import { generateXrayProfiles } from '../lib/xray.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = resolve(root, '.local/deployments/image-tests');
mkdirSync(parent, { recursive: true, mode: 0o700 });
const work = mkdtempSync(resolve(parent, 'xtls-'));
const stem = `ghostline-image-test-${randomUUID()}`;
const common = ['--platform', 'linux/amd64', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true'];

function execute(args: string[], required = true) {
  // Even synthetic credential fixtures stay out of assertion messages and subprocess output.
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  if (required && (result.error || result.status !== 0)) throw new Error(`Docker ${args[0]} failed; details withheld.`);
  return result;
}
const docker = (args: string[]) => execute(args).stdout.trim();

async function listening(port: number): Promise<boolean> {
  // A local TCP accept establishes that the non-root engine really bound container port 443.
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

try {
  console.log('Prepare pinned XTLS and configuration initializer images.');
  const engine = prepareImage('xray', work, docker);
  const initializer = prepareImage('xray-config', work, docker);
  const { bundle } = generateXrayProfiles('synthetic', 'i-synthetic', '127.0.0.1');
  const config = Buffer.from(bundle.files['server.json']!, 'base64');
  const expectedHash = createHash('sha256').update(config).digest('hex');
  const cases = [
    { name: 'valid', value: JSON.stringify(bundle), valid: true },
    { name: 'missing', value: '{}', valid: false },
    { name: 'bad-bundle', value: '{', valid: false },
    { name: 'bad-base64', value: JSON.stringify({ files: { 'server.json': '%%%invalid%%%' } }), valid: false },
    { name: 'bad-json', value: JSON.stringify({ files: { 'server.json': Buffer.from('{invalid').toString('base64') } }), valid: false },
    { name: 'non-object', value: JSON.stringify({ files: { 'server.json': Buffer.from('[]').toString('base64') } }), valid: false },
  ];
  for (const test of cases) {
    // Every task gets fresh storage; always remove containers and their anonymous image volumes first.
    const volume = `${stem}-${test.name}`;
    const name = `${volume}-engine`;
    const envFile = resolve(work, 'secret.env');
    writeFileSync(envFile, `GHOSTLINE_CONFIG=${test.value}\n`, { mode: 0o600 });
    docker(['volume', 'create', volume]);
    try {
      const prepared = execute(['run', '--rm', ...common, '--network', 'none', '--user', '0:0', '--cap-add', 'CHOWN',
        '--env-file', envFile, '-v', `${volume}:/config`, initializer], false);
      assert.equal(prepared.status === 0, test.valid, `${test.name}: initialization outcome`);
      if (!test.valid) {
        assert.equal(prepared.stdout, '');
        assert.equal(prepared.stderr.trim(), 'Xray configuration preparation failed; details withheld.');
        docker(['run', '--rm', ...common, '--network', 'none', '-v', `${volume}:/config:ro`, '--entrypoint', '/bin/sh', initializer,
          '-c', 'test ! -e /config/server.json && test -z "$(ls -A /config)"']);
        console.log(`${test.name}: rejected without rendered files or credential output.`);
        continue;
      }
      const evidence = docker(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
        '-v', `${volume}:/config:ro`, '--entrypoint', '/bin/sh', initializer, '-c',
        'sha256sum /config/server.json; stat -c "%u:%g:%a" /config /config/server.json; test ! -w /config/server.json']);
      const lines = evidence.split('\n');
      assert.equal(lines[0]!.split(' ')[0], expectedHash);
      assert.equal(lines[1], '65532:65532:700');
      assert.equal(lines[2], '65532:65532:400');
      docker(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
        '-v', `${volume}:/usr/local/etc/xray:ro`, engine, 'run', '-test', '-config', '/usr/local/etc/xray/server.json']);
      docker(['run', '-d', '--name', name, ...common, '--user', '65532:65532', '--cap-add', 'NET_BIND_SERVICE',
        '-p', '127.0.0.1::443', '-v', `${volume}:/usr/local/etc/xray:ro`, engine, 'run', '-config', '/usr/local/etc/xray/server.json']);
      const port = Number(docker(['port', name, '443/tcp']).split(':').at(-1));
      let connected = false;
      for (let attempt = 0; attempt < 20 && !connected; attempt++) {
        connected = await listening(port);
        if (!connected) await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.ok(connected, 'Official engine must bind TCP 443 as non-root');
      const env = JSON.parse(docker(['inspect', '--format', '{{json .Config.Env}}', name])) as string[];
      assert.ok(!env.some(value => value.startsWith('GHOSTLINE_CONFIG=')));
      console.log('valid: exact bytes, private ownership, read-only mount, official validation and non-root TCP 443 pass.');
    } finally {
      execute(['rm', '-f', '-v', name], false);
      docker(['volume', 'rm', volume]);
    }
  }
} finally { rmSync(work, { recursive: true, force: true }); }
