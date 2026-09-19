import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imagePlatform, type Protocol } from './ecs-release.js';
import { createTestRamStorage } from './ecs-test-storage.js';

type Execute = (args: string[], required?: boolean, secret?: string) => SpawnSyncReturns<string>;

export async function probeImageTunnel(protocol: Protocol, server: string, engine: string, initializer: string,
  profile: any, work: string, execute: Execute): Promise<void> {
  // Keep both peers in Docker. Synthetic identities use production protocol settings; the Mac's routes never change.
  const docker = (args: string[]) => execute(args).stdout.trim();
  const endpoint = docker(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', server]);
  const client = `${server}-client`, responder = `${server}-http`, volume = `${client}-config`;
  const common = ['--platform', imagePlatform, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--log-opt', 'max-size=1m'];
  const marker = randomUUID();
  let cleanupStorage: (() => void) | undefined;
  try {
    const fixture = fileURLToPath(new URL('../test/fixtures/tunnel-response.sh', import.meta.url));
    docker(['run', '-d', '--name', responder, ...common, '--user', '65532:65532', '--network', `container:${server}`,
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777', '-v', `${fixture}:/test/response.sh:ro`,
      '--entrypoint', '/bin/sh', initializer, '/test/response.sh', marker]);
    if (protocol === 'xray') {
      profile.outbounds[0].settings.vnext[0].address = endpoint;
      profile.inbounds = [{ listen: '0.0.0.0', port: 1080, protocol: 'socks', settings: { auth: 'noauth' } }];
      const bundle = JSON.stringify({ files: { 'server.json': Buffer.from(JSON.stringify(profile)).toString('base64') } });
      cleanupStorage = createTestRamStorage(volume, initializer, docker);
      execute(['run', '--rm', ...common, '--network', 'none', '--user', '65532:65532', '--env', 'GHOSTLINE_CONFIG',
        '-v', `${volume}:/config`, '--entrypoint', '/usr/local/bin/ghostline-config', initializer, 'xray'], true, bundle);
      docker(['run', '-d', '--name', client, ...common, '--user', '65532:65532', '-p', '127.0.0.1::1080',
        '-v', `${volume}:/usr/local/etc/xray:ro`, engine, 'run', '-config', '/usr/local/etc/xray/server.json']);
    } else {
      const path = resolve(work, 'client-awg.conf');
      writeFileSync(path, profile.replace(/^Endpoint = .*$/m, `Endpoint = ${endpoint}:443`), { mode: 0o600 });
      const script = fileURLToPath(new URL('../../runtime/ecs/client-awg.sh', import.meta.url));
      docker(['run', '-d', '--name', client, ...common, '--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun',
        '--tmpfs', '/run', '--tmpfs', '/tmp', '-v', `${path}:/test/profile.conf:ro`, '-v', `${script}:/test/client.sh:ro`,
        '--entrypoint', '/bin/bash', engine, '/test/client.sh']);
    }
    const request = () => protocol === 'xray'
      ? spawnSync('curl', ['--fail', '--silent', '--max-time', '8', '--noproxy', '', '--socks5-hostname',
        docker(['port', client, '1080/tcp']), `http://${endpoint}:8080`], { encoding: 'utf8', timeout: 10_000 }).stdout?.trim()
      : execute(['exec', client, 'wget', '-T', '8', '-qO-', 'http://10.78.0.1:8080'], false).stdout.trim();
    let passed = false;
    for (let attempt = 0; attempt < 8 && !passed; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      passed = request() === marker;
    }
    if (!passed) {
      // Keep synthetic diagnostics private; subprocess logs may include generated configuration identities.
      const evidence = [server, client, responder].map(name => ({
        state: execute(['inspect', '--format', '{{json .State}}', name], false).stdout,
        logs: execute(['logs', '--tail', '20', name], false),
      }));
      writeFileSync(resolve(work, '..', `last-${protocol}-failure.json`), JSON.stringify(evidence), { mode: 0o600 });
    }
    assert.ok(passed, `${protocol}: synthetic encrypted application-data check`);
    if (protocol === 'awg') {
      // Reading only timestamps avoids displaying even disposable peer identities.
      const handshakes = docker(['exec', client, 'awg', 'show', 'client0', 'latest-handshakes']);
      assert.ok(handshakes.split('\n').some(line => Number(line.split(/\s+/)[1]) > 0), 'AWG authenticated handshake');
    }
    console.log(`${protocol}: real encrypted client/server traffic passes with synthetic credentials.`);
  } finally {
    execute(['rm', '-f', '-v', client, responder], false);
    cleanupStorage?.();
  }
}
