import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imagePlatform } from '../lib/ecs-release.js';
import { prepareImage } from '../lib/ecs-images.js';
import { generateXrayProfiles } from '../lib/xray.js';
import { generateAwgProfiles } from '../lib/awg.js';
import { createTestRamStorage } from '../lib/ecs-test-storage.js';

if (process.argv.length > 2) throw new Error('Usage: npm run test:ecs-images');
const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = resolve(root, '.local/deployments/image-tests');
mkdirSync(parent, { recursive: true, mode: 0o700 });
const work = mkdtempSync(resolve(parent, 'engines-'));
const stem = `ghostline-image-test-${randomUUID()}`;
const common = ['--platform', imagePlatform, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true'];

function execute(args: string[], required = true, secret?: string | Record<string, string>) {
  // Even synthetic credential fixtures stay out of assertion messages and subprocess output.
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: secret === undefined ? process.env : { ...process.env, ...(typeof secret === 'string' ? { GHOSTLINE_CONFIG: secret } : secret) } });
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
  // Test-only probes remain ordinary shell files and are mounted read-only, outside the image release.
  const configProbe = resolve(work, 'image-config.sh');
  copyFileSync(new URL('../test/fixtures/image-config.sh', import.meta.url), configProbe);
  // Test the production two-protocol entrypoint independently from reusable per-protocol rendering.
  const shared = prepareImage('gateway-config', work, docker);
  const sharedProbe = resolve(work, 'gateway-config.sh');
  copyFileSync(new URL('../test/fixtures/gateway-config.sh', import.meta.url), sharedProbe);
  const sharedVolume = `${stem}-shared`;
  const cleanupShared = createTestRamStorage(sharedVolume, shared, docker);
  const { bundle: sharedBundle } = generateXrayProfiles('127.0.0.1');
  const sharedAwg = generateAwgProfiles('127.0.0.1').serverConfig;
  const sharedSecrets = { GHOSTLINE_XRAY_BUNDLE: JSON.stringify(sharedBundle), GHOSTLINE_AWG_BUNDLE: sharedAwg };
  const probe = (action: string) => docker(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
    '-v', `${sharedVolume}:/config`, '-v', `${sharedProbe}:/test/probe.sh:ro`, '--entrypoint', '/bin/sh', shared, '/test/probe.sh', action]);
  const initialize = (secrets: Record<string, string>) => execute(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
    '--env', 'GHOSTLINE_XRAY_BUNDLE', '--env', 'GHOSTLINE_AWG_BUNDLE', '-v', `${sharedVolume}:/config`, shared], false, secrets);
  try {
    probe('directories');
    for (const invalid of [{ GHOSTLINE_XRAY_BUNDLE: '' }, { GHOSTLINE_AWG_BUNDLE: '' }, { GHOSTLINE_AWG_BUNDLE: '[invalid]' }]) {
      assert.equal(initialize(sharedSecrets).status, 0, 'Seed complete shared rendering');
      const failed = initialize({ ...sharedSecrets, ...invalid });
      assert.notEqual(failed.status, 0);
      assert.equal(failed.stdout, '');
      assert.equal(failed.stderr.trim(), 'Configuration preparation failed; details withheld.');
      probe('empty');
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(initialize(sharedSecrets).status, 0);
      const evidence = probe('evidence').split('\n');
      assert.equal(evidence[0]!.split(' ')[0], createHash('sha256').update(Buffer.from(sharedBundle.files['server.json']!, 'base64')).digest('hex'));
      assert.equal(evidence[1]!.split(' ')[0], createHash('sha256').update(sharedAwg).digest('hex'));
      assert.deepEqual(evidence.slice(2), ['65532:65532:700', '65532:65532:750', '65532:65532:400', '65532:65532:440']);
    }
    console.log('Shared initializer: exact private bytes, repeat restoration and both-protocol cleanup pass.');
  } finally { cleanupShared(); }
  for (const protocol of ['xray', 'awg'] as const) {
    console.log(`Prepare ${protocol} engine and configuration initializer images.`);
    const engine = prepareImage(protocol, work, docker);
    const initializer = prepareImage('gateway-config', work, docker);
    const { bundle } = generateXrayProfiles('127.0.0.1');
    const awg = generateAwgProfiles('127.0.0.1').serverConfig;
    const value = protocol === 'xray' ? JSON.stringify(bundle) : awg;
    const config = protocol === 'xray' ? Buffer.from(bundle.files['server.json']!, 'base64') : Buffer.from(awg);
    const filename = protocol === 'xray' ? 'server.json' : 'awg0.conf';
    const expectedHash = createHash('sha256').update(config).digest('hex');
    const cases = [
      { name: 'valid', value, valid: true },
      { name: 'empty', value: '', valid: false },
      { name: 'disk-backed', value, valid: false },
      ...(protocol === 'xray' ? [
        { name: 'missing', value: '{}', valid: false },
        { name: 'bad-bundle', value: '{', valid: false },
        { name: 'bad-base64', value: JSON.stringify({ files: { 'server.json': '%%%invalid%%%' } }), valid: false },
        { name: 'bad-json', value: JSON.stringify({ files: { 'server.json': Buffer.from('{invalid').toString('base64') } }), valid: false },
        { name: 'non-object', value: JSON.stringify({ files: { 'server.json': Buffer.from('[]').toString('base64') } }), valid: false },
      ] : [
        { name: 'bad-key', value: awg.replace(/^PrivateKey = .*$/m, 'PrivateKey = invalid'), valid: false },
        { name: 'bad-port', value: awg.replace('ListenPort = 443', 'ListenPort = 80'), valid: false },
        { name: 'missing-peer', value: awg.split('[Peer]')[0]!, valid: false },
        { name: 'missing-peer-key', value: awg.replace(/^PublicKey = .*$/m, ''), valid: false },
        { name: 'bad-section', value: awg + '\n[Unexpected]\n', valid: false },
        { name: 'hook', value: awg + '\nPostUp = false\n', valid: false },
      ]),
    ];
    for (const test of cases) {
      // The storage fixture models a host mount that outlives the initializer, not a production sidecar.
      const volume = `${stem}-${protocol}-${test.name}`;
      const name = `${volume}-engine`;
      let secret = test.value;
      const cleanupStorage = test.name === 'disk-backed'
        ? (docker(['volume', 'create', volume]), () => { docker(['volume', 'rm', volume]); })
        : createTestRamStorage(volume, initializer, docker, protocol);
      const prepare = () => execute(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
        '--env', 'GHOSTLINE_CONFIG', '-v', `${volume}:/config`, '--entrypoint', '/usr/local/bin/ghostline-config', initializer, protocol], false, secret);
      try {
        if (test.name !== 'disk-backed') {
          // A new initializer must work with existing private non-root files and remove stale data on failure.
          secret = value;
          assert.equal(prepare().status, 0, 'Seed previous rendering');
          secret = test.value;
        }
        const prepared = prepare();
        assert.equal(prepared.status === 0, test.valid, `${test.name}: initialization outcome`);
        if (!test.valid) {
          assert.equal(prepared.stdout, '');
          assert.equal(prepared.stderr.trim(), 'Configuration preparation failed; details withheld.');
          docker(['run', '--rm', ...common, '--network', 'none', '--user', test.name === 'disk-backed' ? '0:0' : '65532:65532',
            '-v', `${volume}:/config:ro`, '-v', `${configProbe}:/test/image-config.sh:ro`, '--entrypoint', '/bin/sh', initializer,
            '/test/image-config.sh', 'empty', filename]);
          console.log(`${test.name}: rejected without rendered files or credential output.`);
          continue;
        }
        const evidence = docker(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532',
          '-v', `${volume}:/config:ro`, '-v', `${configProbe}:/test/image-config.sh:ro`, '--entrypoint', '/bin/sh', initializer,
          '/test/image-config.sh', 'evidence', filename]);
        const lines = evidence.split('\n');
        assert.equal(lines[0]!.split(' ')[0], expectedHash);
        assert.equal(lines[1], protocol === 'xray' ? '65532:65532:700' : '65532:65532:750');
        assert.equal(lines[2], protocol === 'xray' ? '65532:65532:400' : '65532:65532:440');
        if (protocol === 'xray') {
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
        } else {
          docker(['run', '-d', '--name', name, ...common, '--user', '0:65532', '--cap-add', 'NET_ADMIN',
            '--device', '/dev/net/tun', '--tmpfs', '/run:rw,nosuid,nodev,noexec,mode=0700', '--tmpfs', '/tmp',
            '-v', `${volume}:/etc/ghostline/awg:ro`, engine]);
          let configured = false;
          for (let attempt = 0; attempt < 30 && !configured; attempt++) {
            configured = execute(['exec', name, 'ip', 'address', 'show', 'dev', 'awg0'], false).stdout.includes('10.78.0.1/24');
            if (!configured) await new Promise(resolve => setTimeout(resolve, 200));
          }
          assert.ok(configured, 'AWG network startup must read the group-readable config without DAC capabilities');
          docker(['restart', name]);
          let restarted = false;
          for (let attempt = 0; attempt < 30 && !restarted; attempt++) {
            restarted = execute(['exec', name, 'awg', 'show', 'awg0', 'listen-port'], false).stdout.trim() === '443';
            if (!restarted) await new Promise(resolve => setTimeout(resolve, 200));
          }
          assert.ok(restarted, 'AWG must restart with the same container and read-only config');
          assert.equal(docker(['exec', name, 'awg', 'show', 'awg0', 'listen-port']), '443');
          assert.equal(docker(['exec', name, 'sha256sum', '/etc/ghostline/awg/awg0.conf']).split(' ')[0], expectedHash);
        }
        const env = JSON.parse(docker(['inspect', '--format', '{{json .Config.Env}}', name])) as string[];
        assert.ok(!env.some(value => value.startsWith('GHOSTLINE_CONFIG=')));
        const mounts = JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', name]));
        assert.equal(mounts.find((mount: any) => mount.Name === volume).RW, false);
        console.log(`${protocol}: exact bytes, private ownership, read-only mount, absent engine secret env and engine startup pass.`);
      } finally {
        execute(['rm', '-f', '-v', name], false);
        cleanupStorage();
      }
    }
  }
} finally { rmSync(work, { recursive: true, force: true }); }
