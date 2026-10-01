import type { CfnTaskDefinitionProps } from 'aws-cdk-lib/aws-ecs';
import type { DeploymentConfig } from './config.js';
import type { GatewayPlatform } from './ecs-stack.js';
import { ecsMemoryBudget } from './ecs-memory.js';
import { renderFixture } from './fixtures.js';
import { production, repository } from './releases/model.js';
import publishers from '../platform-publishers.json' with { type: 'json' };

export const networkDaemonMemory = 64;
import { slotAddresses, daemonServiceName, type HostSlot } from './host-slot-model.js';
export { slotAddresses, daemonServiceName, hostSlots, type HostSlot } from './host-slot-model.js';

function publisher(region: string, kind: 'control' | 'guardDuty'): string {
  // Fail closed on unknown image publishers; this is not a cached service-capability decision.
  const account = (publishers[kind] as Record<string, string>)[region];
  if (!account || !/^\d{12}$/.test(account)) throw new Error(`Missing verified ${kind} image publisher for ${region}.`);
  return account;
}

export function gatewayPlatform(config: DeploymentConfig, guardDuty: boolean, slot: HostSlot = 'a'): GatewayPlatform {
  if (!/^[a-z][a-z0-9-]{0,100}$/.test(config.resourceName)) throw new Error('Invalid gateway identity.');
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  // Publication owns these aliases; ordinary image promotion never rewrites native host settings.
  const imageRepository = repository('bootstrap');
  const image = `${registry}/${imageRepository}:${production}`;
  const repositoryArn = `arn:aws:ecr:${config.region}:${config.account}:repository/${imageRepository}`;
  const memory = ecsMemoryBudget(config.instanceType);
  const settings = { family: config.resourceName, ...slotAddresses(slot),
    taskMemory: memory.task, reservedMemory: memory.reserved };
  const encoded = (phase: string) => Buffer.from(JSON.stringify({ ...settings, phase })).toString('base64');
  return {
    bootstrapImage: image, daemonImage: `${registry}/${repository('network-daemon')}:${production}`,
    daemonRepository: repository('network-daemon'),
    configDirectory: '/mnt/ghostline/config',
    userData: renderFixture(new URL('../../runtime/ecs/bottlerocket/user-data.toml', import.meta.url), {
      // Move controller capacity into ECS accounting rather than reserving the same bytes twice.
      CLUSTER: config.resourceName, SLOT: slot, RESERVED_MEMORY: String(memory.reserved - networkDaemonMemory), IMAGE: image,
      BOOTSTRAP_CONFIG: encoded('bootstrap'), DIAGNOSTIC_CONFIG: encoded('diagnostic'),
    }),
    // Bottlerocket separates its verified OS disk from writable container/data storage; encrypt both.
    disks: [{ deviceName: '/dev/xvda', ebs: { volumeSize: 2, volumeType: 'gp3', encrypted: true, deleteOnTermination: true } },
      { deviceName: '/dev/xvdb', ebs: { volumeSize: config.dataVolumeGiB, volumeType: 'gp3', encrypted: true, deleteOnTermination: true } }],
    pullRepositoryArns: [repositoryArn,
      // The official control container supplies SSM; Bottlerocket pulls it with the host role.
      `arn:aws:ecr:${config.region}:${publisher(config.region, 'control')}:repository/bottlerocket-control`,
      // Publisher identity is static reference data; live discovery still decides runtime availability.
      ...(guardDuty ? [`arn:aws:ecr:${config.region}:${publisher(config.region, 'guardDuty')}:repository/aws-guardduty-agent-ecs-ec2`] : [])],
  };
}

export function networkTaskDefinition(config: DeploymentConfig, image: string, executionRoleArn: string, slot: HostSlot): CfnTaskDefinitionProps {
  // Both host generations retain the same restricted steady-state networking boundary.
  return {
    family: daemonServiceName(config.resourceName, slot), networkMode: 'host', requiresCompatibilities: ['EC2'],
    runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' },
    memory: String(networkDaemonMemory), executionRoleArn,
    containerDefinitions: [{ name: 'network', essential: true, image: image, versionConsistency: 'enabled',
      // UID 0 retains the explicitly bounded capability across iptables subprocess exec; it has no host mounts.
      user: '0:0', cpu: 32, readonlyRootFilesystem: true, privileged: false,
      entryPoint: ['python3', '/opt/ghostline/daemon.py'],
      environment: [{ name: 'GHOSTLINE_NETWORK', value: JSON.stringify({ family: config.resourceName, ...slotAddresses(slot) }) }],
      dockerSecurityOptions: ['no-new-privileges'],
      // NET_RAW is required by iptables' IP-set matcher; all other capabilities remain dropped.
      linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'], add: ['NET_ADMIN', 'NET_RAW'] },
        tmpfs: [{ containerPath: '/run', size: 4, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700'] },
          { containerPath: '/tmp', size: 4, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700'] }] },
      healthCheck: { command: ['CMD', 'python3', '/opt/ghostline/daemon.py', 'health'], interval: 5, timeout: 3, retries: 3, startPeriod: 15 },
      logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } },
    }],
  };
}
