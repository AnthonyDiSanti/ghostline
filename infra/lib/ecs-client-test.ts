import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { imageArtifacts, imagePlatform, type ImageArtifact, type Protocol } from './ecs-release.js';
import type { DeploymentConfig } from './config.js';
import { createTestRamStorage } from './ecs-test-storage.js';

export function deployedClientImages(config: DeploymentConfig, outputs: Record<string, string>, aws: (args: string[]) => any): Record<ImageArtifact, string> {
  // Validate the running release without requiring publication of unrelated local source changes.
  const { ClusterName: cluster, GatewayServiceName: gateway } = outputs;
  if (!cluster || !gateway) throw new Error('Active ECS stack outputs are required.');
  const response = aws(['ecs', 'describe-services', '--cluster', cluster, '--services', gateway]);
  if (response.failures?.length || response.services?.length !== 1) throw new Error('Expected the deployed ECS gateway services.');
  const service = response.services[0];
  if (service.serviceName !== gateway || service.status !== 'ACTIVE' || service.desiredCount !== 1 || service.runningCount !== 1
    || service.pendingCount !== 0 || service.deployments?.length !== 1 || !service.taskDefinition) {
    throw new Error('ECS gateway services must be stable and running before client validation.');
  }
  const task = aws(['ecs', 'describe-task-definition', '--task-definition', service.taskDefinition]).taskDefinition;
  if (task?.family !== `${config.resourceName}-gateway`
    || task.runtimePlatform?.cpuArchitecture !== 'ARM64') {
    throw new Error('Deployed client image ownership or architecture mismatch.');
  }
  const images = {} as Record<ImageArtifact, string>;
  // Only this target's immutable engine/initializer artifacts may execute on the local machine.
  for (const artifact of imageArtifacts) {
    const candidates = task.containerDefinitions.filter((item: any) => item.name === artifact);
    const prefix = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${config.resourceName}/${artifact}:`;
    const image = candidates[0]?.image;
    if (candidates.length !== 1 || typeof image !== 'string' || !image.startsWith(prefix)
      || !/^sha-[a-f0-9]{64}$/.test(image.slice(prefix.length))) throw new Error('Expected an owned immutable deployed image.');
    images[artifact] = image;
  }
  return images;
}

export type ClientExercise = (client: { protocol: Protocol; request: () => string; container: string }) => Promise<void>;

export async function testEcsClients(config: DeploymentConfig, root: string, work: string, outputs: Record<string, string>,
  images: Record<ImageArtifact, string>, exercise?: ClientExercise) {
  const platform = imagePlatform;
  const temporary = mkdtempSync(resolve(work, 'clients-'));
  function command(executable: string, args: string[], required = true): string {
    // Real device keys are mounted read-only; never echo commands, logs or subprocess error output.
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 45_000 });
    if (required && (result.error || result.status !== 0)) throw new Error(`${executable} client check failed; output withheld.`);
    return result.status === 0 ? result.stdout.trim() : '';
  }
  const cleanupClients: Array<() => void> = [];
  try {
    for (const protocol of ['xray', 'awg'] as Protocol[]) {
      const name = `ghostline-ecs-test-${randomUUID()}`;
      const folder = resolve(root, '.local/recovery', `${config.id}-clients`);
      const image = images[protocol];
      const volume = `${name}-config`;
      const expected = outputs[protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp'];
      let cleanupStorage: (() => void) | undefined;
      // Keep earlier clients alive so the final exercise can cover concurrent protocol traffic.
      cleanupClients.push(() => {
        command('docker', ['rm', '-f', '-v', name], false);
        cleanupStorage?.();
      });
      {
        const args = ['run', '-d', '--name', name, '--platform', platform, '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges:true', '--log-driver', 'none', '--tmpfs', '/run', '--tmpfs', '/tmp'];
        if (protocol === 'xray') {
          const profile = JSON.parse(readFileSync(resolve(folder, 'macos-xray.json'), 'utf8'));
          profile.inbounds = [{ listen: '0.0.0.0', port: 1080, protocol: 'socks', settings: { auth: 'noauth' } }];
          // Use the same secret-to-file adapter without changing private host-file ownership.
          const bundle = { files: { 'server.json': Buffer.from(JSON.stringify(profile)).toString('base64') } };
          const envFile = resolve(temporary, 'secret.env');
          writeFileSync(envFile, `GHOSTLINE_CONFIG=${JSON.stringify(bundle)}\n`, { mode: 0o600 });
          const initializer = images['gateway-config'];
          cleanupStorage = createTestRamStorage(volume, initializer, args => command('docker', args));
          command('docker', ['run', '--rm', '--platform', platform, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--user', '65532:65532', '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
            '--env-file', envFile, '-v', `${volume}:/config`, '--entrypoint', '/usr/local/bin/ghostline-config', initializer, 'xray']);
          command('docker', [...args, '-v', `${volume}:/usr/local/etc/xray:ro`, '-p', '127.0.0.1::1080',
            image, 'run', '-config', '/usr/local/etc/xray/server.json']);
        } else {
          writeFileSync(resolve(temporary, 'profile.conf'), readFileSync(resolve(folder, 'macos-awg.conf')), { mode: 0o600 });
          writeFileSync(resolve(temporary, 'client.sh'), readFileSync(resolve(root, 'runtime/ecs/client-awg.sh')), { mode: 0o600 });
          command('docker', [...args, '--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun', '--dns', '1.1.1.1',
            '-v', `${temporary}:/test:ro`, '--entrypoint', '/bin/bash', image, '/test/client.sh']);
        }
        // A real HTTPS request must traverse each encrypted protocol and emerge from its assigned EIP.
        const request = () => protocol === 'xray'
          ? command('curl', ['-fsS', '--max-time', '15', '--socks5-hostname', command('docker', ['port', name, '1080/tcp']), 'https://checkip.amazonaws.com'], false)
          : command('docker', ['exec', name, 'wget', '-T', '15', '-qO-', 'https://checkip.amazonaws.com'], false);
        let passed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const actual = request();
          if (actual === expected) { passed = true; break; }
        }
        if (!passed) throw new Error(`${protocol}: encrypted client HTTPS/exit check failed.`);
        console.log(`${protocol}: real client HTTPS passed through ${expected}; laptop routing unchanged.`);
        // Recovery experiments can keep this real tunnel alive while perturbing the sibling server engine.
        await exercise?.({ protocol, request, container: name });
      }
    }
  } finally {
    try { for (const cleanup of cleanupClients.reverse()) cleanup(); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}
