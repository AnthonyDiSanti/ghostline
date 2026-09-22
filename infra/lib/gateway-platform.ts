import { CfnOutput, Stack } from 'aws-cdk-lib';
import { CfnInstance } from 'aws-cdk-lib/aws-ec2';
import { CfnCluster, CfnService, CfnTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { DeploymentConfig } from './config.js';
import type { GatewayPlatform } from './ecs-stack.js';
import { ecsMemoryBudget } from './ecs-memory.js';
import { renderFixture } from './fixtures.js';
import publishers from '../platform-publishers.json' with { type: 'json' };

export const networkDaemonMemory = 64;

function publisher(region: string, kind: 'control' | 'guardDuty'): string {
  // Fail closed on unknown image publishers; this is not a cached service-capability decision.
  const account = (publishers[kind] as Record<string, string>)[region];
  if (!account || !/^\d{12}$/.test(account)) throw new Error(`Missing verified ${kind} image publisher for ${region}.`);
  return account;
}

export function gatewayPlatform(config: DeploymentConfig, image: string, imageRepository: string, guardDuty: boolean, diagnostic = false): GatewayPlatform {
  if (!/^[a-z][a-z0-9-]{0,100}$/.test(config.resourceName)) throw new Error('Invalid gateway identity.');
  const repositoryArn = `arn:aws:ecr:${config.region}:${config.account}:repository/${imageRepository}`;
  // Only a digest from the account-owned platform repository may prepare the host.
  const expected = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${imageRepository}@sha256:`;
  if (!image.startsWith(expected) || !/^[a-f0-9]{64}$/.test(image.slice(expected.length))) throw new Error('Invalid Bottlerocket support image.');
  const memory = ecsMemoryBudget(config.instanceType);
  const settings = { family: config.resourceName, xray: '10.79.0.11', awg: '10.79.0.10',
    taskMemory: memory.task, reservedMemory: memory.reserved };
  const encoded = (phase: string) => Buffer.from(JSON.stringify({ ...settings, phase })).toString('base64');
  return {
    image, imageRepository,
    configDirectory: '/mnt/ghostline/config',
    userData: renderFixture(new URL('../../runtime/ecs/bottlerocket/user-data.toml', import.meta.url), {
      // Move controller capacity into ECS accounting rather than reserving the same bytes twice.
      CLUSTER: config.resourceName, RESERVED_MEMORY: String(memory.reserved - networkDaemonMemory), IMAGE: image,
      BOOTSTRAP_CONFIG: encoded('bootstrap'), DIAGNOSTIC_CONFIG: encoded('diagnostic'),
      ESSENTIAL: String(!diagnostic),
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

export function addNetworkDaemon(stack: Stack, config: DeploymentConfig, image: string, imageRepository: string) {
  // Runtime-enforced boundaries replace the former superpowered host controller; diagnostics stay disabled.
  const cluster = stack.node.findChild('Cluster') as CfnCluster;
  const execution = new Role(stack, 'NetworkExecutionRole', { assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com') });
  execution.addToPolicy(new PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }));
  execution.addToPolicy(new PolicyStatement({ actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
    resources: [`arn:aws:ecr:${config.region}:${config.account}:repository/${imageRepository}`] }));
  const definition = new CfnTaskDefinition(stack, 'NetworkTask', {
    family: `${config.resourceName}-network`, networkMode: 'host', requiresCompatibilities: ['EC2'],
    runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' },
    memory: String(networkDaemonMemory), executionRoleArn: execution.roleArn,
    containerDefinitions: [{ name: 'network', essential: true, image: image,
      // UID 0 retains the explicitly bounded capability across iptables subprocess exec; it has no host mounts.
      user: '0:0', cpu: 32, readonlyRootFilesystem: true, privileged: false,
      entryPoint: ['python3', '/opt/ghostline/daemon.py'],
      environment: [{ name: 'GHOSTLINE_NETWORK', value: JSON.stringify({ family: config.resourceName, xray: '10.79.0.11', awg: '10.79.0.10' }) }],
      dockerSecurityOptions: ['no-new-privileges'],
      // NET_RAW is required by iptables' IP-set matcher; all other capabilities remain dropped.
      linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'], add: ['NET_ADMIN', 'NET_RAW'] },
        tmpfs: [{ containerPath: '/run', size: 4, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700'] },
          { containerPath: '/tmp', size: 4, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700'] }] },
      healthCheck: { command: ['CMD', 'python3', '/opt/ghostline/daemon.py', 'health'], interval: 5, timeout: 3, retries: 3, startPeriod: 15 },
      logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } },
    }],
  });
  const daemon = new CfnService(stack, 'NetworkService', { cluster: cluster.attrArn,
    serviceName: `${config.resourceName}-network`, taskDefinition: definition.ref, launchType: 'EC2', schedulingStrategy: 'DAEMON',
    deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100 }, propagateTags: 'TASK_DEFINITION' });
  daemon.node.addDependency(execution.node.findChild('DefaultPolicy'));
  daemon.addResourceDependency(stack.node.findChild('Instance') as CfnInstance);
  (stack.node.findChild('GatewayService') as CfnService).addResourceDependency(daemon);
  new CfnOutput(stack, 'NetworkDaemonServiceName', { value: daemon.attrName });
  return daemon;
}
