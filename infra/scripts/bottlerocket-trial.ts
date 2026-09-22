import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { createSocket } from 'node:dgram';
import { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { CfnTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { bottlerocketConfig, bottlerocketParameterPrefix, bottlerocketPlatformStack, bottlerocketRepository, buildBottlerocketTrial, networkDaemonMemory, type BottlerocketTrial } from '../lib/bottlerocket.js';
import { generateAwgProfiles } from '../lib/awg.js';
import { generateXrayProfiles } from '../lib/xray.js';
import { testEcsClients } from '../lib/ecs-client-test.js';
import { prepareEcsRemoval, setEcsPower } from '../lib/ecs-power.js';
import { discoverGuardDuty } from '../lib/guardduty-discovery.js';
import { verifyGuardDuty } from '../lib/guardduty.js';
import { withHostDiagnostics } from '../lib/ecs-verification.js';
import { artifacts } from '../lib/releases/model.js';

const [action, ...extra] = process.argv.slice(2);
const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.local/bottlerocket');
const config = bottlerocketConfig('ami-00000000000000000');
mkdirSync(work, { recursive: true, mode: 0o700 });
const awsCredentials = fromIni({ profile: 'personal' });
const ssm = new SSMClient({ region: config.region, credentials: awsCredentials });

function run(program: string, args: string[], input?: string, visible = false, environment = process.env): string {
  // Never reproduce captured subprocess output: it may include registry authorization or private profiles.
  const result = spawnSync(program, args, { cwd: resolve(root, 'infra'), env: environment, encoding: 'utf8', input,
    stdio: ['pipe', visible ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${program} ${args[0]} failed; captured output withheld.`);
  return result.stdout ?? '';
}

function aws(args: string[]): any {
  // The profile, region and account-scoped resource names are fixed for this disposable experiment.
  const output = run('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json']);
  return output.trim() ? JSON.parse(output) : {};
}

function save(name: string, value: unknown) {
  writeFileSync(resolve(work, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(work, name), 'utf8')) as T;
}

function outputs(): Record<string, string> {
  const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
  return Object.fromEntries((stack.Outputs ?? []).map((item: any) => [item.OutputKey, item.OutputValue]));
}

function cdk(operation: 'diff' | 'deploy' | 'destroy', component: 'repository' | 'gateway', lifecycle: 'active' | 'parked' = 'active') {
  // A fresh diff always precedes a deployment; neither app contains production or release-controller stacks.
  const stack = component === 'repository' ? bottlerocketPlatformStack : config.stackName;
  const args = [resolve(root, 'infra/node_modules/aws-cdk/bin/cdk'), operation, stack,
    '--app', 'node --import=tsx bin/bottlerocket-trial.ts', '--profile', 'personal', '--region', config.region,
    '--output', resolve(work, `cdk-${component}`),
    ...(operation === 'deploy' ? ['--require-approval', 'never', '--outputs-file', resolve(work, 'outputs.json')] : []),
    ...(operation === 'destroy' ? ['--force'] : [])];
  run(process.execPath, args, undefined, true, { ...process.env, GHOSTLINE_BOTTLEROCKET_COMPONENT: component, GHOSTLINE_LIFECYCLE: lifecycle });
}

function credentials() {
  // Generate a separate synthetic identity once, retained privately so rebuild tests preserve it.
  if (!existsSync(resolve(work, 'credentials.json'))) save('credentials.json', {
    xray: generateXrayProfiles('127.0.0.1'), awg: generateAwgProfiles('127.0.0.1'),
  });
  return load<{ xray: ReturnType<typeof generateXrayProfiles>; awg: ReturnType<typeof generateAwgProfiles> }>('credentials.json');
}

function login() {
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  const password = run('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password']);
  run('docker', ['login', '--username', 'AWS', '--password-stdin', registry], password);
  return registry;
}

async function prepare() {
  // Discover AWS metadata live and retain the immutable choice for this trial, without moving production aliases.
  if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
  const path = '/aws/service/bottlerocket/aws-ecs-3/arm64/latest';
  const parameters = aws(['ssm', 'get-parameters', '--names', `${path}/image_id`, `${path}/image_version`]).Parameters;
  const amiId = parameters.find((p: any) => p.Name === `${path}/image_id`)?.Value;
  const version = parameters.find((p: any) => p.Name === `${path}/image_version`)?.Value;
  const ami = aws(['ec2', 'describe-images', '--owners', 'amazon', '--image-ids', amiId]).Images[0];
  if (ami?.State !== 'available' || ami.Architecture !== 'arm64' || ami.Name !== `bottlerocket-aws-ecs-3-aarch64-v${version}`) {
    throw new Error('Expected current official ECS-3 ARM64 Bottlerocket AMI.');
  }
  const images = Object.fromEntries(artifacts.map(name => {
    const image = aws(['ecr', 'describe-images', '--repository-name', `ghostline/prod/${name}`, '--image-ids', 'imageTag=keep-production']).imageDetails[0];
    return [name, `${config.account}.dkr.ecr.${config.region}.amazonaws.com/ghostline/prod/${name}@${image.imageDigest}`];
  })) as BottlerocketTrial['images'];
  const source = ['network.py', 'network-probe.py', 'bottlerocket/host.Dockerfile',
    ...readdirSync(resolve(root, 'runtime/ecs/bottlerocket')).filter(name => name.endsWith('.py')).sort().map(name => `bottlerocket/${name}`)]
    .map(name => readFileSync(resolve(root, 'runtime/ecs', name)));
  const tag = createHash('sha256').update(Buffer.concat(source)).digest('hex');
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  const image = `${registry}/${bottlerocketRepository}:${tag}`;
  run('docker', ['build', '--platform', 'linux/arm64', '-f', resolve(root, 'runtime/ecs/bottlerocket/host.Dockerfile'),
    '-t', image, resolve(root, 'runtime/ecs')], undefined, true);
  cdk('diff', 'repository'); cdk('deploy', 'repository');
  login();
  // Retry an interrupted prepare using the already published immutable source tag, not a new provenance index.
  const published = aws(['ecr', 'list-images', '--repository-name', bottlerocketRepository]).imageIds;
  if (!published.some((item: any) => item.imageTag === tag)) run('docker', ['push', image], undefined, true);
  const digest = aws(['ecr', 'describe-images', '--repository-name', bottlerocketRepository, '--image-ids', `imageTag=${tag}`]).imageDetails[0].imageDigest;
  // Platform iterations must not silently change the OS/application under test after another global release.
  const selection = existsSync(resolve(work, 'trial.json')) ? load<BottlerocketTrial>('trial.json') : { amiId, version, images };
  save('trial.json', { ...selection, supportImage: `${registry}/${bottlerocketRepository}@${digest}` });
  const identity = credentials();
  for (const [name, value] of Object.entries({ xray: JSON.stringify(identity.xray.bundle), awg: identity.awg.serverConfig })) {
    const Name = `${bottlerocketParameterPrefix}/server/${name}`;
    let existing;
    try { existing = await ssm.send(new GetParameterCommand({ Name, WithDecryption: true })); }
    catch (error) { if ((error as { name: string }).name !== 'ParameterNotFound') throw error; }
    if (existing) {
      if (existing.Parameter?.Type !== 'SecureString' || existing.Parameter.Value !== value) throw new Error('Trial credential conflict.');
    } else await ssm.send(new PutParameterCommand({ Name, Value: value, Type: 'SecureString', Tier: 'Standard',
      Tags: [{ Key: 'Project', Value: 'ghostline' }, { Key: 'Environment', Value: 'prod' },
        { Key: 'System', Value: name === 'awg' ? 'amneziawg' : 'xray' }, { Key: 'Experiment', Value: 'bottlerocket' }] }));
  }
  console.log(`Prepared Bottlerocket ${selection.version}; synthetic parameters and immutable image selection saved.`);
}

async function remote(command: string, expectedFailure = false) {
  // Only maintained, redacted diagnostics use this transport. Never request Docker config or secret dumps.
  const state = outputs();
  // Outputs are absent while a new daemon is stabilizing; resolve only this stack's exact EC2 resource for diagnostics.
  const instance = state.InstanceId ?? aws(['cloudformation', 'describe-stack-resource', '--stack-name', config.stackName,
    '--logical-resource-id', 'Instance']).StackResourceDetail.PhysicalResourceId;
  if (!/^i-[a-f0-9]+$/.test(instance ?? '')) throw new Error('Invalid trial diagnostic host.');
  save('command.json', { commands: [command], executionTimeout: ['180'] });
  const id = aws(['ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript',
    '--parameters', `file://${resolve(work, 'command.json')}`]).Command.CommandId;
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = aws(['ssm', 'get-command-invocation', '--instance-id', instance, '--command-id', id]);
    if (result.Status === 'Success') return result.StandardOutputContent as string;
    if (['Failed', 'TimedOut', 'Cancelled'].includes(result.Status)) {
      // Only bounded readiness/cleanup probes tolerate failure; their callers must prove the final state.
      if (expectedFailure && result.Status === 'Failed') return '';
      console.log(result.StandardErrorContent);
      throw new Error('Redacted Bottlerocket diagnostic failed.');
    }
  }
  throw new Error('Bottlerocket diagnostic timed out.');
}

async function withDiagnostics<T>(operation: () => Promise<T>): Promise<T> {
  // Share production's cleanup and disabled-state readback, including failed enablement.
  return withHostDiagnostics(remote, operation);
}

async function qualify() {
  // Compare the exact IP-set matcher under both capability sets on this disposable host.
  const { stack } = buildBottlerocketTrial(load<BottlerocketTrial>('trial.json'), { service: true, runtime: true });
  const definition = stack.node.findChild('NetworkTask') as CfnTaskDefinition;
  const state = outputs();
  const instance = state.InstanceId ?? aws(['cloudformation', 'describe-stack-resource', '--stack-name', config.stackName,
    '--logical-resource-id', 'Instance']).StackResourceDetail.PhysicalResourceId;
  const evidence: { capabilities: string[]; task: string | undefined; runtimeId: string | undefined;
    exitCode: number | undefined; reason: string }[] = [];
  for (const capabilities of [['NET_ADMIN'], ['NET_ADMIN', 'NET_RAW']]) {
    const containers = structuredClone(definition.containerDefinitions) as any[];
    containers[0].command = ['qualify'];
    containers[0].linuxParameters.capabilities.add = capabilities;
    delete containers[0].healthCheck;
    // A temporary overlap reserves 32 MiB while preserving the deployed 64 MiB hard ceiling.
    containers[0].memory = networkDaemonMemory;
    containers[0].memoryReservation = networkDaemonMemory / 2;
    const registered = aws(['ecs', 'register-task-definition', '--cli-input-json', JSON.stringify({
      family: `${config.resourceName}-network-qualification`, networkMode: 'host', requiresCompatibilities: ['EC2'],
      runtimePlatform: definition.runtimePlatform, containerDefinitions: containers,
    })]).taskDefinition.taskDefinitionArn;
    let task: string | undefined;
    try {
      const result = aws(['ecs', 'run-task', '--cluster', config.resourceName, '--task-definition', registered,
        '--launch-type', 'EC2', '--started-by', 'ghostline-network-qualification', '--placement-constraints',
        JSON.stringify([{ type: 'memberOf', expression: `ec2InstanceId == ${instance}` }])]);
      if (result.failures?.length || result.tasks?.length !== 1) {
        throw new Error(`Qualification task placement failed: ${JSON.stringify(result.failures ?? [])}`);
      }
      task = result.tasks[0].taskArn;
      aws(['ecs', 'wait', 'tasks-stopped', '--cluster', config.resourceName, '--tasks', task!]);
      const finished = aws(['ecs', 'describe-tasks', '--cluster', config.resourceName, '--tasks', task!]).tasks[0];
      const container = finished.containers.find((c: any) => c.name === 'network');
      const observed = { capabilities, task, runtimeId: container?.runtimeId, exitCode: container?.exitCode, reason: finished.stoppedReason };
      evidence.push(observed);
      console.log(JSON.stringify(observed));
      if (container?.exitCode !== (capabilities.includes('NET_RAW') ? 0 : 1)) {
        throw new Error('Network capability comparison failed; do not deploy.');
      }
    } finally {
      if (task) aws(['ecs', 'stop-task', '--cluster', config.resourceName, '--task', task, '--reason', 'Qualification cleanup']);
      aws(['ecs', 'deregister-task-definition', '--task-definition', registered]);
    }
  }
  // These containers contain public network configuration only; confirm the negative result's exact cause.
  await withDiagnostics(async () => {
    for (const item of evidence) {
      if (!/^[a-f0-9]{64}$/.test(item.runtimeId ?? '')) throw new Error('Missing qualification runtime identity.');
      const log = await remote(`apiclient exec ghostline-diagnostics -- env DOCKER_HOST=unix:///.bottlerocket/rootfs/run/docker.sock docker logs --tail 20 ${item.runtimeId}`);
      console.log(log);
      if (item.capabilities.length === 1 && !log.includes("Can't open socket to ipset")) {
        throw new Error('NET_ADMIN failed for an unexpected reason.');
      }
    }
  });
  save('qualification.json', evidence);
}

async function diagnose() {
  // Only the secret-free platform daemon's logs are eligible for display, never engine or initializer output.
  return withDiagnostics(async () => {
    const arns = aws(['ecs', 'list-tasks', '--cluster', config.resourceName,
      '--service-name', `${config.resourceName}-network`, '--desired-status', 'STOPPED']).taskArns;
    if (!arns.length) throw new Error('No stopped network daemon to inspect.');
    const tasks = aws(['ecs', 'describe-tasks', '--cluster', config.resourceName, '--tasks', ...arns]).tasks
      .sort((a: any, b: any) => Date.parse(b.stoppedAt) - Date.parse(a.stoppedAt)).slice(0, 2);
    for (const task of tasks) {
      if (!task.taskDefinitionArn.includes(`/${config.resourceName}-network:`)) throw new Error('Unexpected diagnostic task family.');
      const container = task.containers.find((c: any) => c.name === 'network');
      console.log(JSON.stringify({ reason: task.stoppedReason, exitCode: container?.exitCode }));
      if (/^[a-f0-9]{64}$/.test(container?.runtimeId ?? '')) console.log(await remote(
        `apiclient exec ghostline-diagnostics -- env DOCKER_HOST=unix:///.bottlerocket/rootfs/run/docker.sock docker logs --tail 30 ${container.runtimeId}`));
    }
  });
}

async function verify() {
  // Release host-administration authority before local comparisons or a potentially long telemetry wait.
  const { evidence, isolation } = await withDiagnostics(async () => ({
    evidence: JSON.parse(await remote('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/diagnostics.py')),
    isolation: JSON.parse(await remote('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/isolation.py')),
  }));
  const state = outputs();
  const identity = credentials();
  for (const protocol of ['xray', 'awg'] as const) {
    const bytes = protocol === 'xray' ? Buffer.from(identity.xray.bundle.files['server.json']!, 'base64') : Buffer.from(identity.awg.serverConfig);
    if (evidence[protocol].configSha256 !== createHash('sha256').update(bytes).digest('hex')
      || evidence[protocol].publicIp !== state[protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp']) throw new Error('Trial config/egress mismatch.');
  }
  save('verification.json', evidence);
  save('isolation.json', isolation);
  console.log(JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(isolation));
  const coverage = await verifyGuardDuty(new GuardDutyClient({ region: config.region, credentials: awsCredentials }),
    discoverGuardDuty(config), state.InstanceId!, { report: console.log });
  save('guardduty.json', coverage);
  console.log(JSON.stringify(coverage));
}

async function reboot() {
  // Require a changed kernel boot ID: an EC2 status waiter alone can return before reboot starts.
  const state = outputs();
  const command = 'cat /proc/sys/kernel/random/boot_id';
  const before = (await remote(command)).trim();
  if (!/^[a-f0-9-]{36}$/.test(before)) throw new Error('Invalid pre-reboot identity.');
  aws(['ec2', 'reboot-instances', '--instance-ids', state.InstanceId!]);
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 15_000));
    let after;
    try { after = (await remote(command)).trim(); }
    catch { continue; } // SSM/helper unavailability is expected only within this bounded reboot poll.
    if (after !== before && /^[a-f0-9-]{36}$/.test(after)) {
      aws(['ecs', 'wait', 'services-stable', '--cluster', state.ClusterName!, '--services', state.GatewayServiceName!]);
      save('reboot.json', { instanceId: state.InstanceId, before, after });
      console.log('New kernel boot verified; ECS service stable. Run verify/test for runtime acceptance.');
      return;
    }
  }
  throw new Error('Trial did not recover with a new kernel boot identity.');
}

function runningTask() {
  // Every destructive probe selects only this dedicated cluster/service and checks its family.
  const state = outputs();
  const tasks = aws(['ecs', 'list-tasks', '--cluster', state.ClusterName!, '--service-name', state.GatewayServiceName!]).taskArns;
  if (tasks.length !== 1) throw new Error('Expected one stable trial task.');
  const task = aws(['ecs', 'describe-tasks', '--cluster', state.ClusterName!, '--tasks', tasks[0]]).tasks[0];
  if (!task.taskDefinitionArn.includes(`/${config.resourceName}-gateway:`)) throw new Error('Trial task ownership mismatch.');
  return { state, task };
}

async function test(exercise = false) {
  if (exercise) return withDiagnostics(() => runClients(true));
  return runClients(false);
}

async function wrongIngress(state: Record<string, string>) {
  // Require kernel counter evidence: an unreachable client alone would not prove wrong-IP isolation.
  const counters = async () => {
    const rules = await remote('apiclient exec ghostline-diagnostics -- iptables-nft-save -t raw -c');
    return Object.fromEntries(['tcp', 'udp'].map(protocol => {
      const line = rules.split('\n').find(line => line.includes('-A GHOSTLINE_INGRESS')
        && line.includes(`-p ${protocol}`) && line.endsWith('-j DROP'));
      const count = line?.match(/^\[(\d+):\d+\]/)?.[1];
      if (!count) throw new Error('Missing wrong-IP ingress guard counter.');
      return [protocol, Number(count)];
    }));
  };
  const before = await counters();
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: state.AwgEndpointIp!, port: 443 });
    socket.setTimeout(2000, () => { socket.destroy(); resolve(); });
    socket.on('error', () => { socket.destroy(); resolve(); });
    socket.on('connect', () => { socket.destroy(); reject(new Error('TCP admitted on AWG address.')); });
  });
  await new Promise<void>((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.send(Buffer.from('ghostline-isolation-test'), 443, state.EndpointIp!, error => {
      socket.close();
      if (error) reject(error); else resolve();
    });
  });
  const after = await counters();
  if (!(after.tcp! > before.tcp! && after.udp! > before.udp!)) throw new Error('Wrong-IP drop counters did not advance.');
  save('ingress.json', { instanceId: state.InstanceId, before, after });
  console.log('Wrong-IP ingress: TCP and UDP probes reached and incremented the intended DROP counters.');
}

async function runClients(exercise: boolean) {
  // Reuse actual encrypted client probes with synthetic profiles, leaving native client profiles intact.
  const state = outputs();
  const identity = credentials();
  const folder = resolve(root, '.local/recovery', `${config.id}-clients`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const device of ['macos', 'ios']) {
    const xray = structuredClone(identity.xray.profiles[device]!);
    xray.outbounds[0]!.settings.vnext[0]!.address = state.EndpointIp!;
    writeFileSync(resolve(folder, `${device}-xray.json`), JSON.stringify(xray), { mode: 0o600 });
    writeFileSync(resolve(folder, `${device}-awg.conf`), identity.awg.profiles[device]!.replace(/^Endpoint = .*$/m,
      `Endpoint = ${state.AwgEndpointIp}:443`), { mode: 0o600 });
  }
  login();
  if (process.platform === 'darwin') {
    // Each lifecycle checkpoint must use a direct laptop route, even if native VPN state changed mid-run.
    for (const address of [state.EndpointIp!, state.AwgEndpointIp!]) {
      const route = run('/sbin/route', ['-n', 'get', address]);
      const networkInterface = route.match(/interface:\s*(\S+)/)?.[1];
      if (!networkInterface || networkInterface.startsWith('utun')) throw new Error('Direct trial route required; check native VPN state.');
    }
  }
  const clients: Array<{ protocol: string; request: (timeoutSeconds?: number) => string }> = [];
  await testEcsClients(config, root, work, state, load<BottlerocketTrial>('trial.json').images, exercise ? async client => {
    clients.push(client);
    if (clients.length !== 2) return;
    await wrongIngress(state);
    const initial = runningTask();
    // ECS restarts only engines that ran at least 60 seconds; wait boundedly without confusing early exits.
    const age = Date.now() - new Date(initial.task.startedAt).getTime();
    if (age < 65_000) await new Promise(resolve => setTimeout(resolve, 65_000 - age));
    async function recovered(label: string) {
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (clients.every(c => c.request() === state[c.protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp'])) {
          console.log(`${label}: both encrypted clients recovered with correct exit identities.`);
          return;
        }
      }
      throw new Error(`${label}: encrypted recovery failed.`);
    }
    for (const protocol of ['xray', 'awg']) {
      const before = runningTask();
      const container = before.task.containers.find((c: any) => c.name === protocol)?.runtimeId;
      if (!/^[a-f0-9]{64}$/.test(container ?? '')) throw new Error('Invalid trial runtime identity.');
      await remote(`apiclient exec ghostline-diagnostics -- env DOCKER_HOST=unix:///.bottlerocket/rootfs/run/docker.sock docker kill --signal KILL ${container}`);
      await recovered(`${protocol} engine restart`);
      const after = runningTask();
      if (after.task.taskArn !== before.task.taskArn
        || after.task.containers.find((c: any) => c.name === protocol)?.runtimeId !== container) throw new Error('Expected an in-place engine restart.');
    }
    const iptables = 'apiclient exec ghostline-diagnostics -- iptables-nft -w';
    const metadataBlock = '-d 127.0.0.1/32 -p tcp --dport 51678 -m comment --comment ghostline-metadata-test -j REJECT';
    try {
      // Only the local introspection reader is interrupted; SSM and the ECS control plane remain reachable.
      await remote(`${iptables} -I OUTPUT 1 ${metadataBlock}`);
      await new Promise(resolve => setTimeout(resolve, 4000));
      if (clients.some(c => c.request(2) !== '')) throw new Error('Missing metadata did not quarantine forwarding.');
    } finally {
      await remote(`${iptables} -D OUTPUT ${metadataBlock}`);
    }
    await recovered('Metadata discovery recovery');
    // apiclient exec requires its own -- separator before iptables flags such as -s (socket to apiclient).
    const masquerade = '-s 172.17.0.0/16 ! -o docker0 -m comment --comment ghostline-nat-test -j MASQUERADE';
    try {
      // Simulate Docker prepending a default rule; the daemon must restore its higher-priority SNAT safely.
      await remote(`${iptables} -t nat -I POSTROUTING 1 ${masquerade}`);
      await recovered('NAT ordering repair');
    } finally {
      await remote(`${iptables} -t nat -D POSTROUTING ${masquerade}`);
    }
    const daemonTasks = aws(['ecs', 'list-tasks', '--cluster', state.ClusterName!, '--service-name', state.NetworkDaemonServiceName!]).taskArns;
    if (daemonTasks.length !== 1) throw new Error('Expected one trial network daemon.');
    const daemonTask = aws(['ecs', 'describe-tasks', '--cluster', state.ClusterName!, '--tasks', ...daemonTasks]).tasks[0];
    const daemon = daemonTask.containers.find((c: any) => c.name === 'network')?.runtimeId;
    if (!/^[a-f0-9]{64}$/.test(daemon ?? '')) throw new Error('Invalid daemon runtime identity.');
    const docker = 'apiclient exec ghostline-diagnostics -- env DOCKER_HOST=unix:///.bottlerocket/rootfs/run/docker.sock docker';
    // Freezing the whole cgroup bypasses cleanup and lasts longer than the independent kernel leases.
    try {
      await remote(`${docker} pause ${daemon}`);
      await new Promise(resolve => setTimeout(resolve, 7000));
      if (clients.some(c => c.request(2) !== '')) throw new Error('Controller failure did not close forwarding.');
      console.log('Controller stall: kernel leases closed both encrypted traffic paths.');
    } finally {
      // ECS may already be replacing the unhealthy daemon; unpause only this captured runtime identity.
      await remote(`${docker} unpause ${daemon}`, true);
    }
    await recovered('Network daemon stall recovery');
    // Health replacement during the stall is allowed; kill the current daemon to exercise death separately.
    const liveDaemons = aws(['ecs', 'list-tasks', '--cluster', state.ClusterName!,
      '--service-name', state.NetworkDaemonServiceName!]).taskArns;
    if (liveDaemons.length !== 1) throw new Error('Expected one daemon before death test.');
    const liveDaemon = aws(['ecs', 'describe-tasks', '--cluster', state.ClusterName!, '--tasks', ...liveDaemons]).tasks[0];
    const liveRuntime = liveDaemon.containers.find((c: any) => c.name === 'network')?.runtimeId;
    if (!/^[a-f0-9]{64}$/.test(liveRuntime ?? '')) throw new Error('Invalid daemon death-test identity.');
    await remote(`${docker} kill --signal KILL ${liveRuntime}`);
    await recovered('ECS network daemon replacement');
    const replacement = aws(['ecs', 'list-tasks', '--cluster', state.ClusterName!,
      '--service-name', state.NetworkDaemonServiceName!]).taskArns;
    if (replacement.length !== 1 || replacement[0] === liveDaemon.taskArn) throw new Error('Expected a new network daemon task.');
    const before = runningTask();
    aws(['ecs', 'stop-task', '--cluster', state.ClusterName!, '--task', before.task.taskArn, '--reason', 'Bottlerocket isolated task recovery test']);
    await recovered('Whole task replacement');
    if (runningTask().task.taskArn === before.task.taskArn) throw new Error('Expected a new task/initializer after replacement.');
    save('recovery.json', { instanceId: state.InstanceId, engineRestarts: true, metadataLossClosedTraffic: true, natOrderRepaired: true,
      controllerStallClosedTraffic: true, controllerDeathRecovered: true, previousDaemon: liveDaemon.taskArn,
      replacementDaemon: replacement[0], taskReplacement: true });
  } : undefined);
}

if (extra.length) throw new Error('Usage: npm run trial:bottlerocket <prepare|qualify|diagnose|diff|deploy|park|unpark|rebuild|status|verify|test|exercise|reboot|stop|start|destroy>.');
switch (action) {
  case 'prepare': await prepare(); break;
  case 'qualify': await qualify(); break;
  case 'diagnose': await diagnose(); break;
  case 'diff': cdk('diff', 'gateway'); break;
  case 'deploy': cdk('diff', 'gateway'); cdk('deploy', 'gateway'); break;
  case 'park':
    // Keep both tracked allocations while CloudFormation removes all disposable gateway resources.
    prepareEcsRemoval(outputs(), aws);
    cdk('diff', 'gateway', 'parked'); cdk('deploy', 'gateway', 'parked'); break;
  case 'unpark': cdk('diff', 'gateway'); cdk('deploy', 'gateway'); break;
  case 'rebuild':
    // Recreate disposable compute/networking while preserving the image selection and synthetic credential identity.
    prepareEcsRemoval(outputs(), aws);
    cdk('destroy', 'gateway'); cdk('diff', 'gateway'); cdk('deploy', 'gateway'); break;
  case 'status': console.log(JSON.stringify(outputs(), null, 2)); break;
  case 'verify': await verify(); break;
  case 'test': await test(); break;
  case 'exercise': await test(true); break;
  case 'reboot': await reboot(); break;
  case 'stop': case 'start':
    if (load<BottlerocketTrial>('trial.json').diagnostic) throw new Error('Diagnostic hosts cannot start application tasks.');
    setEcsPower(action, config.stackName, outputs(), aws); break;
  case 'destroy':
    // Only this trial's dedicated stacks and exact synthetic server parameters are eligible for deletion.
    prepareEcsRemoval(outputs(), aws);
    cdk('destroy', 'gateway');
    aws(['ssm', 'delete-parameters', '--names', ...['xray', 'awg'].map(name => `${bottlerocketParameterPrefix}/server/${name}`)]);
    cdk('destroy', 'repository');
    break;
  default: throw new Error('Select prepare, qualify, diagnose, diff, deploy, park, unpark, rebuild, status, verify, test, exercise, reboot, stop, start or destroy.');
}
