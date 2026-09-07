import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAwgProfiles } from '../lib/awg.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [target = 'cape-town', protocol = 'xray'] = process.argv.slice(2);
if (!/^[a-z-]+$/.test(target) || !['xray', 'awg'].includes(protocol)) throw new Error('Select target and protocol.');
const metadata = JSON.parse(readFileSync(resolve(root, '.local/deployments', target, `runtime/${protocol}-image.json`), 'utf8'));
const tempRoot = resolve(root, '.local/runtime-tests');
mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
const temp = mkdtempSync(resolve(tempRoot, 'fixture-'));
const name = `ghostline-test-${randomUUID()}`;

function docker(args: string[], success = true) {
  // Only disposable credentials enter this test; even their subprocess diagnostics remain private.
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (success) assert.equal(result.status, 0, `Docker test command failed: ${args[0]}`);
  return result;
}

try {
  const mount = protocol === 'xray' ? '/opt/amnezia/xray' : '/etc/amnezia/amneziawg';
  if (protocol === 'xray') {
    const keys = generateKeyPairSync('x25519');
    writeFileSync(resolve(temp, 'server.json'), JSON.stringify({
      inbounds: [{ port: 443, protocol: 'vless', settings: { clients: [{ id: randomUUID(), flow: 'xtls-rprx-vision' }], decryption: 'none' },
        streamSettings: { network: 'tcp', security: 'reality', realitySettings: { dest: 'www.googletagmanager.com:443', serverNames: ['www.googletagmanager.com'],
          privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('base64url'), shortIds: ['0123456789abcdef'] } } }],
      outbounds: [{ protocol: 'freedom' }], log: { loglevel: 'error' },
    }), { mode: 0o600 });
  } else {
    const generated = generateAwgProfiles('127.0.0.1');
    writeFileSync(resolve(temp, 'awg0.conf'), generated.serverConfig, { mode: 0o600 });
    writeFileSync(resolve(temp, 'macos.conf'), generated.profiles.macos!, { mode: 0o600 });
  }
  const privileges = protocol === 'xray' ? ['--cap-add', 'NET_BIND_SERVICE']
    : ['--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun', '--sysctl', 'net.ipv4.ip_forward=1', '--tmpfs', '/run', '--tmpfs', '/tmp'];
  docker(['run', '-d', '--name', name, '--platform', 'linux/amd64', '--read-only', '--cap-drop', 'ALL', ...privileges,
    '--security-opt', 'no-new-privileges:true', '-v', `${temp}:${mount}:ro`, metadata.tag]);
  await new Promise(resolve => setTimeout(resolve, 2000));
  assert.equal(docker(['inspect', '--format', '{{.State.Running}}', name]).stdout.trim(), 'true', 'Daemon must remain running.');
  if (protocol === 'awg') {
    // Under amd64 emulation the daemon can exist before its configuration transaction finishes.
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = docker(['exec', name, 'awg', 'show', 'awg0', 'listen-port'], false);
      if (result.status === 0 && result.stdout.trim() === '443') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Generated AWG configuration must apply and bind UDP 443.');
    // Exercise an actual handshake with the generated peer, not just the server-side config parser.
    docker(['exec', '-d', name, 'amneziawg-go', '-f', 'client0']);
    let handshake = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (docker(['exec', name, 'test', '-S', '/run/amneziawg/client0.sock'], false).status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    docker(['exec', name, 'bash', '-c', 'awg setconf client0 <(awg-quick strip /etc/amnezia/amneziawg/macos.conf)']);
    docker(['exec', name, 'ip', 'link', 'set', 'up', 'dev', 'client0']);
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = docker(['exec', name, 'awg', 'show', 'awg0', 'latest-handshakes']);
      if (result.stdout.trim().split('\n').some(line => Number(line.split(/\s+/)[1]) > 0)) { handshake = true; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(handshake, 'Generated client/server credentials must complete an AWG handshake.');
  }
  docker(['restart', name]);
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(docker(['inspect', '--format', '{{.State.Running}}', name]).stdout.trim(), 'true');
  if (protocol === 'xray') {
    // A malformed JSON document must terminate the actual process, not leave a successful tail process.
    writeFileSync(resolve(temp, 'server.json'), '{broken');
    docker(['restart', name]);
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(docker(['inspect', '--format', '{{.State.Running}}', name]).stdout.trim(), 'false');
    assert.notEqual(docker(['inspect', '--format', '{{.State.ExitCode}}', name]).stdout.trim(), '0');
  }
  console.log(`${protocol}: disposable-config startup, least-required privileges and restart passed${protocol === 'xray' ? '; invalid config exits nonzero' : '; generated 3.1 peer handshake passed'}.`);
} catch (error) {
  const logs = docker(['logs', name], false);
  console.error(logs.stdout, logs.stderr); // Only disposable test identities are ever used here.
  throw error;
} finally {
  docker(['rm', '-f', name], false);
  rmSync(temp, { recursive: true, force: true });
}
