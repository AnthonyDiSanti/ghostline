import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { applicationArtifacts, imagePlatform, type ApplicationArtifact, type Protocol } from './ecs-release.js';
import type { DeploymentConfig } from './config.js';
import { createTestRamStorage } from './ecs-test-storage.js';

export function deployedClientImages(config: DeploymentConfig, outputs: Record<string, string>, aws: (args: string[]) => any): Record<ApplicationArtifact, string> {
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
  const running = aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', gateway]).taskArns;
  if (running?.length !== 1) throw new Error('Expected one running gateway task.');
  const detail = aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...running]);
  if (detail.failures?.length || detail.tasks?.length !== 1 || detail.tasks[0].taskDefinitionArn !== service.taskDefinition) {
    throw new Error('Running task differs from the stable service.');
  }
  const images = {} as Record<ApplicationArtifact, string>;
  // A production tag may have moved since this deployment. Execute only the actual running digests.
  for (const artifact of applicationArtifacts) {
    const candidates = task.containerDefinitions.filter((item: any) => item.name === artifact);
    const prefix = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/ghostline/prod/${artifact}`;
    const container = detail.tasks[0].containers.find((c: any) => c.name === artifact);
    if (candidates.length !== 1 || candidates[0]?.image !== `${prefix}:keep-production`
      || !/^sha256:[a-f0-9]{64}$/.test(container?.imageDigest ?? '')) throw new Error('Expected an owned resolved deployed image.');
    images[artifact] = `${prefix}@${container.imageDigest}`;
  }
  return images;
}

export type ClientExercise = (client: { protocol: Protocol; request: (timeoutSeconds?: number) => string; container: string; proxy?: string }) => Promise<void>;

export async function testEcsClients(config: DeploymentConfig, root: string, work: string, outputs: Record<string, string>,
  images: Record<ApplicationArtifact, string>, exercise?: ClientExercise, benchmark?: { proxyImage: string; protocols?: Protocol[]; owner?: string;
    onUnavailable?: (protocol: Protocol) => void }) {
  const platform = imagePlatform;
  const temporary = mkdtempSync(resolve(work, 'clients-'));
  function command(executable: string, args: string[], required = true): string {
    // Real device keys are mounted read-only; never echo commands, logs or subprocess error output.
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 45_000 });
    if (required && (result.error || result.status !== 0)) throw new Error(`${executable} client check failed; output withheld.`);
    return result.status === 0 ? result.stdout.trim() : '';
  }
  const cleanupClients: Array<() => void> = [];
  // Campaign labels let resume remove exact orphaned test containers/volumes after process death.
  if (benchmark?.owner && !/^[a-f0-9-]{36}$/.test(benchmark.owner)) throw new Error('Invalid benchmark owner.');
  const labels = benchmark?.owner ? ['--label', `ghostline.benchmark.owner=${benchmark.owner}`] : [];
  try {
    if (process.platform === 'darwin') {
      // Native VPN state can change during a long deployment; never report a nested probe as direct-path evidence.
      for (const endpoint of [outputs.EndpointIp!, outputs.AwgEndpointIp!]) {
        const networkInterface = command('/sbin/route', ['-n', 'get', endpoint]).match(/interface:\s*(\S+)/)?.[1];
        if (!networkInterface || networkInterface.startsWith('utun')) throw new Error('Disconnect the native VPN before direct regional client tests.');
      }
    }
    for (const protocol of benchmark?.protocols ?? ['xray', 'awg'] as Protocol[]) {
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
        const args = ['run', '-d', ...labels, '--name', name, '--platform', platform, '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges:true', '--log-driver', 'none', '--tmpfs', '/run', '--tmpfs', '/tmp'];
        if (protocol === 'xray') {
          const profile = JSON.parse(readFileSync(resolve(folder, 'macos-xray.json'), 'utf8'));
          // A neutral egress check cannot detect domain-specific direct routes; benchmarks require one unconditional VLESS path.
          if (benchmark && (profile.outbounds?.length !== 1 || profile.outbounds[0].protocol !== 'vless'
            || (profile.routing?.rules?.length ?? 0) !== 0 || profile.dns)) throw new Error('Benchmark Xray profile contains unsupported routing or DNS overrides.');
          profile.inbounds = [{ listen: '0.0.0.0', port: 1080, protocol: 'socks', settings: { auth: 'noauth' } }];
          // Use the same secret-to-file adapter without changing private host-file ownership.
          const bundle = { files: { 'server.json': Buffer.from(JSON.stringify(profile)).toString('base64') } };
          const envFile = resolve(temporary, 'secret.env');
          writeFileSync(envFile, `GHOSTLINE_CONFIG=${JSON.stringify(bundle)}\n`, { mode: 0o600 });
          const initializer = images['gateway-config'];
          cleanupStorage = createTestRamStorage(volume, initializer, args => command('docker', args), 'xray', labels);
          command('docker', ['run', '--rm', ...labels, '--platform', platform, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--user', '65532:65532', '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
            '--env-file', envFile, '-v', `${volume}:/config`, '--entrypoint', '/usr/local/bin/ghostline-config', initializer, 'xray']);
          command('docker', [...args, '-v', `${volume}:/usr/local/etc/xray:ro`, '-p', '127.0.0.1::1080',
            image, 'run', '-config', '/usr/local/etc/xray/server.json']);
        } else {
          writeFileSync(resolve(temporary, 'profile.conf'), readFileSync(resolve(folder, 'macos-awg.conf')), { mode: 0o600 });
          writeFileSync(resolve(temporary, 'client.sh'), readFileSync(resolve(root, 'runtime/ecs/client-awg.sh')), { mode: 0o600 });
          command('docker', [...args, ...(benchmark ? ['-p', '127.0.0.1::1080'] : []), '--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun', '--dns', '1.1.1.1',
            '-v', `${temporary}:/test:ro`, '--entrypoint', '/bin/bash', image, '/test/client.sh', ...(benchmark ? ['guard'] : [])]);
          if (benchmark) {
            const proxy = `${name}-proxy`;
            cleanupClients.push(() => { command('docker', ['rm', '-f', proxy], false); });
            command('docker', ['run', '-d', ...labels, '--name', proxy, '--platform', platform, '--network', `container:${name}`,
              '--read-only', '--cap-drop', 'ALL', '--user', '65532:65532', '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
              '-v', `${resolve(root, 'runtime/ecs/benchmark-socks.py')}:/proxy.py:ro`, '--entrypoint', 'python3', benchmark.proxyImage, '/proxy.py']);
          }
        }
        const socksAddress = protocol === 'xray' || benchmark ? command('docker', ['port', name, '1080/tcp']) : undefined;
        // A real HTTPS request must traverse each encrypted protocol and emerge from its assigned EIP.
        const request = (timeoutSeconds = 15) => {
          // Short failure probes must finish before ECS replaces an intentionally stalled daemon.
          if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 15) throw new Error('Invalid probe timeout.');
          return protocol === 'xray' || benchmark
            ? command('curl', ['-fsS', '--max-time', String(timeoutSeconds), '--socks5-hostname', socksAddress!, 'https://checkip.amazonaws.com'], false)
            : command('docker', ['exec', name, 'wget', '-T', String(timeoutSeconds), '-qO-', 'https://checkip.amazonaws.com'], false);
        };
        let passed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const actual = request();
          if (actual === expected) { passed = true; break; }
        }
        if (!passed) {
          // Regional censorship can affect just one protocol. The benchmark must still try its sibling; ordinary validation stays strict.
          if (benchmark?.onUnavailable) { benchmark.onUnavailable(protocol); continue; }
          throw new Error(`${protocol}: encrypted client HTTPS/exit check failed.`);
        }
        console.log(`${protocol}: real client HTTPS passed through ${expected}; laptop routing unchanged.`);
        // Pausing only the disposable client proves HTTPS cannot silently recover over the direct path.
        if (benchmark) {
          command('docker', ['pause', name]);
          try { if (request(2)) throw new Error('Benchmark tunnel failure leaked a direct HTTPS request.'); }
          finally { command('docker', ['unpause', name]); }
          if (request() !== expected) throw new Error('Benchmark client did not recover after isolation check.');
        }
        // Recovery experiments can keep this real tunnel alive while perturbing the sibling server engine.
        await exercise?.({ protocol, request, container: name, proxy: benchmark ? `socks5://${socksAddress}` : undefined });
      }
    }
  } finally {
    try { for (const cleanup of cleanupClients.reverse()) cleanup(); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}
