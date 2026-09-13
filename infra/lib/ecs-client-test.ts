import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { releaseTag, type Protocol } from './ecs-release.js';
import type { DeploymentConfig } from './config.js';

export async function testEcsClients(config: DeploymentConfig, root: string, work: string, outputs: Record<string, string>) {
  const temporary = mkdtempSync(resolve(work, 'clients-'));
  function command(executable: string, args: string[], required = true): string {
    // Real device keys are mounted read-only; never echo commands, logs or subprocess error output.
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 45_000 });
    if (required && (result.error || result.status !== 0)) throw new Error(`${executable} client check failed; output withheld.`);
    return result.status === 0 ? result.stdout.trim() : '';
  }
  try {
    for (const protocol of ['xray', 'awg'] as Protocol[]) {
      const name = `ghostline-ecs-test-${randomUUID()}`;
      const folder = resolve(root, '.local/recovery', `${config.id}-clients`);
      const image = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${config.resourceName}/${protocol}:${releaseTag(protocol)}`;
      const volume = `${name}-config`;
      const expected = outputs[protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp'];
      try {
        const args = ['run', '-d', '--name', name, '--platform', 'linux/amd64', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges:true', '--log-driver', 'none', '--tmpfs', '/run', '--tmpfs', '/tmp'];
        if (protocol === 'xray') {
          const profile = JSON.parse(readFileSync(resolve(folder, 'macos-xray.json'), 'utf8'));
          profile.inbounds = [{ listen: '0.0.0.0', port: 1080, protocol: 'socks', settings: { auth: 'noauth' } }];
          // Use the same secret-to-file adapter without changing private host-file ownership.
          const bundle = { files: { 'server.json': Buffer.from(JSON.stringify(profile)).toString('base64') } };
          const envFile = resolve(temporary, 'secret.env');
          writeFileSync(envFile, `GHOSTLINE_CONFIG=${JSON.stringify(bundle)}\n`, { mode: 0o600 });
          const initializer = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${config.resourceName}/xray-config:${releaseTag('xray-config')}`;
          command('docker', ['volume', 'create', volume]);
          command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--cap-add', 'CHOWN', '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
            '--env-file', envFile, '-v', `${volume}:/config`, initializer]);
          command('docker', [...args, '-v', `${volume}:/usr/local/etc/xray:ro`, '-p', '127.0.0.1::1080',
            image, 'run', '-config', '/usr/local/etc/xray/server.json']);
        } else {
          writeFileSync(resolve(temporary, 'profile.conf'), readFileSync(resolve(folder, 'macos-awg.conf')), { mode: 0o600 });
          writeFileSync(resolve(temporary, 'client.sh'), readFileSync(resolve(root, 'runtime/ecs/client-awg.sh')), { mode: 0o600 });
          command('docker', [...args, '--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun', '--dns', '1.1.1.1',
            '-v', `${temporary}:/test:ro`, '--entrypoint', '/bin/bash', image, '/test/client.sh']);
        }
        // A real HTTPS request must traverse each encrypted protocol and emerge from its assigned EIP.
        let passed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          let actual: string;
          if (protocol === 'xray') {
            const port = command('docker', ['port', name, '1080/tcp']);
            actual = command('curl', ['-fsS', '--max-time', '15', '--socks5-hostname', port, 'https://checkip.amazonaws.com'], false);
          } else {
            actual = command('docker', ['exec', name, 'wget', '-T', '15', '-qO-', 'https://checkip.amazonaws.com'], false);
          }
          if (actual === expected) { passed = true; break; }
        }
        if (!passed) throw new Error(`${protocol}: encrypted client HTTPS/exit check failed.`);
        console.log(`${protocol}: real client HTTPS passed through ${expected}; laptop routing unchanged.`);
      } finally {
        command('docker', ['rm', '-f', '-v', name], false);
        if (protocol === 'xray') command('docker', ['volume', 'rm', volume], false);
      }
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
