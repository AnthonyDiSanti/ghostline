import { spawnSync } from 'node:child_process';
import { constants, createHash, createPublicKey, publicEncrypt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHeadscaleConfig, headscaleFiles, headscaleNames as names, headscaleRelayMap, resolveHeadscaleRelease } from './headscale-config.js';
import { type HeadscaleRuntimeInputs } from './headscale-stack.js';
import { verifyOfficialBottlerocketImage } from './bottlerocket-os.js';
import { hostRemote, withHostDiagnostics } from './ecs-verification.js';
import { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { fromIni } from '@aws-sdk/credential-providers';
import { verifyGuardDuty } from './guardduty.js';
import { parse, stringify } from 'yaml';

export const coordinatorRoot = fileURLToPath(new URL('../../', import.meta.url));
const infra = resolve(coordinatorRoot, 'infra');
const config = loadHeadscaleConfig();
const profile = process.env.AWS_PROFILE ?? 'personal';
const work = resolve(coordinatorRoot, '.local/deployments/headscale');
const inputsPath = resolve(work, 'inputs.json');
const deployedInputsPath = resolve(work, 'deployed-inputs.json');
const receiptPath = resolve(work, 'operation.json');
const lockName = '/ghostline/headscale/operation';
const storageName = '/ghostline/headscale/storage';
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

export function coordinatorCommand(executable: string, args: string[], input?: string): string {
  // Capture all child output: app/registry tools can include credentials or full configurations on errors.
  const result = spawnSync(executable, args, { cwd: infra, encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Coordinator subprocess failed: ${executable} ${args[0] ?? ''}; output withheld.`);
  return result.stdout.trim();
}

export function coordinatorAws(args: string[], region = config.region): any {
  // The operator owns mutations; neither the boot helper nor the application receives these credentials.
  const result = coordinatorCommand('aws', ['--profile', profile, '--region', region, ...args, '--output', 'json']);
  return result ? JSON.parse(result) : {};
}

function save(path: string, value: unknown) {
  // Receipts are resumable operation metadata only, and are always private even when fields are public.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function stack(name: string): Record<string, string> | undefined {
  // Only explicit stack absence is a normal branch; authentication/provider failures must not look like an empty account.
  const result = spawnSync('aws', ['--profile', profile, '--region', config.region, 'cloudformation', 'describe-stacks', '--stack-name', name, '--output', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) {
    if (/does not exist/.test(result.stderr) && /ValidationError/.test(result.stderr)) return undefined;
    throw new Error('Coordinator stack metadata read failed.');
  }
  const current = JSON.parse(result.stdout).Stacks[0];
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(current.StackStatus)) throw new Error(`Coordinator stack is not settled: ${current.StackStatus}`);
  return Object.fromEntries(current.Outputs.map((item: any) => [item.OutputKey, item.OutputValue]));
}

function cdk(action: 'diff' | 'deploy' | 'destroy', target: string, inputs?: HeadscaleRuntimeInputs) {
  // Every cloud application uses freshly synthesized templates from the same tested graph.
  if (inputs) save(inputsPath, inputs);
  const args = [resolve(infra, 'node_modules/aws-cdk/bin/cdk'), action, target, '--app', 'node --import=tsx bin/headscale.ts', '--profile', profile,
    '--output', resolve(work, 'cdk.out'), ...(action === 'deploy' ? ['--require-approval', 'never', ...(target === names.runtime ? ['--no-rollback'] : [])] : []), ...(action === 'destroy' ? ['--force'] : [])];
  const result = spawnSync(process.execPath, args, { cwd: infra, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, AWS_PROFILE: profile, ...(inputs ? { GHOSTLINE_HEADSCALE_INPUTS: inputsPath } : {}) } });
  const log = resolve(work, `${target}-${action}-${Date.now()}.log`);
  writeFileSync(log, result.stdout + result.stderr, { mode: 0o600 });
  if (result.status !== 0 || result.error) throw new Error(`Coordinator ${action} failed; inspect private metadata log ${log}.`);
  console.log(`${target}: ${action} completed (${log}).`);
}

export function imageContentMatches(left: any, right: any): boolean {
  // Compare one executable platform, never a multi-platform index against a single-platform manifest.
  return typeof left?.config?.digest === 'string' && left.config.digest === right?.config?.digest
    && Array.isArray(left.layers) && left.layers.map((layer: any) => layer.digest).join() === right?.layers?.map((layer: any) => layer.digest).join();
}

export function headscaleHostChanges(previous: HeadscaleRuntimeInputs, next: HeadscaleRuntimeInputs): boolean {
  // EC2 user-data edits do not rewrite Bottlerocket's persisted settings; changed host bytes require a new host.
  return previous.ami !== next.ami || previous.hostImage !== next.hostImage || previous.hostTemplate !== next.hostTemplate;
}

export function headscaleInitializationAllowed(volume: { VolumeId: string; CreateTime: string; SnapshotId?: string; Encrypted?: boolean },
  marker: { volume: string; initialized: boolean } | undefined, operationStarted: string): boolean {
  // Byte contents cannot establish emptiness on EBS. Only creation in this operation, without a snapshot, permits first format.
  if (marker?.initialized) {
    if (marker.volume !== volume.VolumeId) throw new Error('Application volume changed; explicit state migration or recovery is required.');
    return false;
  }
  return volume.Encrypted === true && !volume.SnapshotId && Date.parse(volume.CreateTime) >= Date.parse(operationStarted);
}

function storageMarker(): { volume: string; initialized: boolean } | undefined {
  // This public one-value receipt is initialization authority metadata, never a database or secret-state backend.
  const parameter = coordinatorAws(['ssm', 'get-parameters', '--names', storageName]).Parameters[0];
  if (!parameter) return undefined;
  let marker;
  try { marker = JSON.parse(parameter.Value); } catch { throw new Error('Invalid coordinator storage receipt.'); }
  if (parameter.Type !== 'String' || !/^vol-[a-f0-9]{17}$/.test(marker?.volume) || marker.initialized !== true) throw new Error('Invalid coordinator storage receipt.');
  return marker;
}

function initializationPermission(): boolean {
  const state = stack(names.state)!;
  const volume = coordinatorAws(['ec2', 'describe-volumes', '--volume-ids', state.Volume!]).Volumes[0];
  const tags = Object.fromEntries((volume?.Tags ?? []).map((tag: any) => [tag.Key, tag.Value]));
  // Creation authority is limited to this exact CFN-owned application disk, not arbitrary logically empty block devices.
  if (volume?.VolumeId !== state.Volume || volume.AvailabilityZone !== config.availabilityZone || volume.Size !== config.volumeGiB
    || tags.Workload !== 'headscale' || tags['aws:cloudformation:stack-name'] !== names.state) throw new Error('Coordinator volume provenance differs.');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  return headscaleInitializationAllowed(volume, storageMarker(), receipt.startedAt);
}

function verificationIdentity() {
  // Resume a completed rollout's verification without restarting healthy processes or changing the selected release.
  const state = stack(names.state), runtime = stack(names.runtime);
  if (!state || !runtime) throw new Error('Coordinator verification resources are absent.');
  return { instance: runtime.Instance, task: runtime.Task, volume: state.Volume,
    inputs: createHash('sha256').update(readFileSync(deployedInputsPath)).digest('hex') };
}

function checkpointVerification() {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  save(receiptPath, { ...receipt, phase: 'verify', verification: verificationIdentity() });
}

function relayMap() {
  // Public pins are sufficient; never decrypt regional DERP bundles just to publish discovery metadata.
  const catalog = JSON.parse(readFileSync(resolve(infra, 'deployment.json'), 'utf8'));
  const relays: Array<{ target: string; ip: string; pin: string }> = [];
  for (const [target, entry] of Object.entries(catalog.deployments) as Array<[string, any]>) {
    const mode = coordinatorAws(['dynamodb', 'get-item', '--table-name', 'ghostline-prod-release-attempts', '--key', '{"id":{"S":"lifecycle"}}', '--consistent-read'], entry.region).Item?.record?.S;
    if ((!entry.derp && !catalog.derp) || !mode || JSON.parse(mode).mode !== 'active') continue;
    const identity = JSON.parse(coordinatorAws(['ssm', 'get-parameter', '--name', '/ghostline/prod/derp/public'], entry.region).Parameter.Value);
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(identity.ip) || !/^sha256-raw:[a-f0-9]{64}$/.test(identity.pin) || Date.parse(identity.expires) <= Date.now()) throw new Error('Invalid public regional DERP identity.');
    relays.push({ target, ip: identity.ip, pin: identity.pin });
  }
  return headscaleRelayMap(relays);
}

export function prepareHeadscale(): HeadscaleRuntimeInputs {
  // Latest stable is selected fresh for this deployment; no committed release or stale registry mirror chooses it.
  mkdirSync(work, { recursive: true, mode: 0o700 });
  if (coordinatorAws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('Headscale AWS account mismatch.');
  const release = resolveHeadscaleRelease({
    download: url => Buffer.from(coordinatorCommand('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '60', url])),
    manifest: image => JSON.parse(coordinatorCommand('docker', ['buildx', 'imagetools', 'inspect', '--raw', image])),
  });
  const os = JSON.parse(readFileSync(resolve(infra, 'platform-qualification.json'), 'utf8')).os.targetVersion;
  const base = `/aws/service/bottlerocket/aws-ecs-3/arm64/${os}`;
  const parameters = coordinatorAws(['ssm', 'get-parameters', '--names', `${base}/image_id`, `${base}/image_version`]).Parameters;
  const parameter = (name: string) => parameters.find((item: any) => item.Name === `${base}/${name}`)?.Value;
  const image = coordinatorAws(['ec2', 'describe-images', '--image-ids', parameter('image_id'), '--owners', 'amazon']).Images[0];
  verifyOfficialBottlerocketImage({ owner: image.ImageOwnerAlias, architecture: image.Architecture, state: image.State, name: image.Name }, parameter('image_version'));
  const helperFiles = ['headscale-host.py', 'headscale-host.Dockerfile'];
  const hash = createHash('sha256');
  const directory = resolve(work, 'host-context'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const file of helperFiles) { const source = resolve(coordinatorRoot, 'runtime/ecs', file); hash.update(file).update(readFileSync(source)); copyFileSync(source, resolve(directory, file)); }
  const tag = `sha-${hash.digest('hex')}`;
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  const inputs = { ami: image.ImageId, hostImage: `${registry}/${names.hostRepository}:${tag}`,
    image: `${registry}/${names.imageRepository}:stable-${release.version}-${release.digest.slice(7, 23)}`,
    hostTemplate: createHash('sha256').update(readFileSync(resolve(infra, 'lib/headscale-stack.ts'))).update(JSON.stringify(config)).digest('hex'), files: headscaleFiles(config, relayMap()) };
  save(resolve(work, 'release.json'), { ...release, os, at: new Date().toISOString(), inputs, hostTag: tag });
  save(inputsPath, inputs);
  console.log(`Headscale ${release.version}: latest stable selected; ${image.Name}.`);
  return inputs;
}

function mirrorAndBuild(inputs: HeadscaleRuntimeInputs) {
  // Copy the exact upstream executable image; the only build is a generic mount/diagnostic helper.
  const release = JSON.parse(readFileSync(resolve(work, 'release.json'), 'utf8'));
  const source = `ghcr.io/juanfont/headscale@${release.digest}`;
  const registry = inputs.image.split('/')[0]!;
  const password = coordinatorCommand('aws', ['--profile', profile, '--region', config.region, 'ecr', 'get-login-password']);
  coordinatorCommand('docker', ['login', '--username', 'AWS', '--password-stdin', registry], password);
  coordinatorCommand('docker', ['pull', '--platform', 'linux/arm64', source]);
  coordinatorCommand('docker', ['tag', source, inputs.image]);
  const manifests = (image: string) => JSON.parse(coordinatorCommand('docker', ['buildx', 'imagetools', 'inspect', '--raw', image]));
  const present = coordinatorAws(['ecr', 'list-images', '--repository-name', names.imageRepository, '--filter', 'tagStatus=TAGGED']).imageIds.some((item: any) => item.imageTag === inputs.image.split(':').pop());
  if (!present) coordinatorCommand('docker', ['push', inputs.image]);
  if (!imageContentMatches(manifests(source), manifests(inputs.image))) throw new Error('Mirrored Headscale executable differs from upstream.');
  coordinatorCommand('docker', ['build', '--platform', 'linux/arm64', '-f', resolve(work, 'host-context/headscale-host.Dockerfile'), '-t', inputs.hostImage, resolve(work, 'host-context')]);
  const helperPresent = coordinatorAws(['ecr', 'list-images', '--repository-name', names.hostRepository, '--filter', 'tagStatus=TAGGED']).imageIds.some((item: any) => item.imageTag === inputs.hostImage.split(':').pop());
  if (!helperPresent) coordinatorCommand('docker', ['push', inputs.hostImage]);
}

export function qualifyHeadscaleImages(inputs: HeadscaleRuntimeInputs) {
  // Exercise the unmodified app and rootless persistent mounts before allocating coordinator infrastructure.
  const release = JSON.parse(readFileSync(resolve(work, 'release.json'), 'utf8'));
  const source = `ghcr.io/juanfont/headscale@${release.digest}`;
  coordinatorCommand('docker', ['pull', '--platform', 'linux/arm64', source]);
  coordinatorCommand('docker', ['build', '--platform', 'linux/arm64', '-f', resolve(work, 'host-context/headscale-host.Dockerfile'), '-t', inputs.hostImage, resolve(work, 'host-context')]);
  const directory = resolve(work, 'synthetic-config'); mkdirSync(directory, { recursive: true, mode: 0o755 });
  const settings = parse(inputs.files['config.yaml']!);
  settings.server_url = 'http://127.0.0.1:8080'; settings.listen_addr = '0.0.0.0:8080';
  settings.tls_letsencrypt_hostname = ''; settings.acme_url = ''; settings.tls_cert_path = ''; settings.tls_key_path = '';
  for (const [name, body] of Object.entries({ ...inputs.files, 'config.yaml': stringify(settings) })) writeFileSync(resolve(directory, name), body, { mode: 0o644 });
  coordinatorCommand('python3', ['-B', resolve(infra, 'test/fixtures/headscale-local.py'), source, inputs.hostImage, directory]);
  save(resolve(work, 'local-qualification.json'), { at: new Date().toISOString(), source, hostImage: inputs.hostImage, confinement: true, restartIdentity: true });
  console.log('Official ARM64 Headscale image: configuration, confinement and restart persistence qualified.');
}

async function exclusive<T>(action: string, run: () => Promise<T>): Promise<T> {
  // An interrupted operation holds the shared coordinator exclusion until the exact local receipt resumes; no timeout unlock.
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : { id: randomUUID(), action, startedAt: new Date().toISOString() };
  if (receipt.action !== action) throw new Error('Resume the existing coordinator operation before another mutation.');
  if (receipt.pid && receipt.pid !== process.pid) {
    let alive = true;
    try { process.kill(receipt.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; else throw error; }
    if (alive) throw new Error('The coordinator operation is still running locally.');
  }
  receipt.pid = process.pid;
  save(receiptPath, receipt);
  const parameters = coordinatorAws(['ssm', 'get-parameters', '--names', lockName]).Parameters;
  if (parameters.length) { if (parameters[0].Value !== receipt.id) throw new Error('Another coordinator operator owns the exclusion.'); }
  else coordinatorAws(['ssm', 'put-parameter', '--name', lockName, '--type', 'String', '--value', receipt.id, '--tags', 'Key=Project,Value=ghostline', 'Key=Environment,Value=prod', 'Key=System,Value=shared']);
  const result = await run();
  if (coordinatorAws(['ssm', 'get-parameter', '--name', lockName]).Parameter.Value !== receipt.id) throw new Error('Coordinator operation ownership changed.');
  coordinatorAws(['ssm', 'delete-parameter', '--name', lockName]);
  renameSync(receiptPath, resolve(work, 'last-operation.json'));
  return result;
}

function remote(instance: string) { return hostRemote(instance, work, args => coordinatorAws(args)); }
async function diagnostic<T>(run: (remote: ReturnType<typeof hostRemote>) => Promise<T>): Promise<T> {
  // Borrow and release the existing bounded Bottlerocket administrative path, never leaving a permanent superpowered service.
  const current = stack(names.runtime); if (!current?.Instance) throw new Error('Coordinator runtime is absent.');
  const execute = remote(current.Instance);
  return withHostDiagnostics(execute, () => run(execute));
}

export async function approveHeadscaleEnrollment(execute: ReturnType<typeof hostRemote>, user: string, authId: string) {
  // Keep the approval body out of Run Command and all subprocess arguments. Only the short-lived host key can open it.
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(user) || !/^[A-Za-z0-9_-]{8,128}$/.test(authId)) {
    throw new Error('Invalid private enrollment input.');
  }
  const operation = randomUUID();
  const helper = 'apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py';
  const pem = (await execute(`${helper} approval-key ${operation}`, true)).trim();
  if (!pem) return null;
  if (!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----$/.test(pem) || pem.length > 700) {
    throw new Error('Invalid private enrollment public key.');
  }
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 3072) {
    throw new Error('Unexpected private enrollment public key type.');
  }
  const encrypted = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(JSON.stringify({ authId, user }))).toString('base64');
  return JSON.parse(await execute(`${helper} approve ${operation} ${encrypted}`));
}

async function admitRuntime(inputs: HeadscaleRuntimeInputs) {
  // The first service has desired count zero until storage is verified and formatting permission is permanently revoked.
  const state = stack(names.state)!, runtime = stack(names.runtime)!;
  for (let attempt = 0; ; attempt++) {
    const managed = coordinatorAws(['ssm', 'describe-instance-information', '--filters', `Key=InstanceIds,Values=${runtime.Instance}`]).InstanceInformationList;
    if (managed[0]?.PingStatus === 'Online') break;
    if (attempt === 90) throw new Error('Coordinator storage bootstrap/control channel did not become ready; inspect its boot console.');
    await pause(3000);
  }
  const storage = await diagnostic(async execute => JSON.parse(await execute('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py storage')));
  if (!storage.mounted || storage.volume !== state.Volume) throw new Error('Coordinator storage admission failed.');
  const execute = remote(runtime.Instance!);
  const data = Buffer.from(JSON.stringify({ volume: state.Volume, volumeBytes: config.volumeGiB * 1024 ** 3,
    files: inputs.files, initialize: false, phase: 'bootstrap' })).toString('base64');
  await execute(`apiclient set bootstrap-containers.headscale.user-data=${data}`);
  const settings = JSON.parse(await execute('apiclient get settings.bootstrap-containers.headscale')).settings['bootstrap-containers'].headscale;
  if (settings['user-data'] !== data) throw new Error('Coordinator format permission revocation did not persist.');
  const marker = storageMarker();
  if (marker && marker.volume !== state.Volume) throw new Error('Coordinator storage ownership changed.');
  if (!marker) coordinatorAws(['ssm', 'put-parameter', '--name', storageName, '--type', 'String',
    '--value', JSON.stringify({ volume: state.Volume, initialized: true }), '--tags',
    'Key=Project,Value=ghostline', 'Key=Environment,Value=prod', 'Key=System,Value=shared', 'Key=Workload,Value=headscale']);
  inputs.initialize = false; inputs.active = true;
  console.log('Coordinator storage verified; one-time format authority revoked before task admission.');
  // Converge the declarative template too; only the admitted graph may request a running application task.
  cdk('diff', names.runtime, inputs); cdk('deploy', names.runtime, inputs);
}

export async function stopHeadscaleTasks(call: (args: string[]) => any = coordinatorAws, sleep = pause) {
  // Scale to zero and observe every task's exit before configuration changes or volume movement.
  const known = new Set<string>();
  const collect = () => {
    for (const status of ['RUNNING', 'STOPPED']) for (const arn of call(['ecs', 'list-tasks', '--cluster', names.cluster,
      '--service-name', names.service, '--desired-status', status]).taskArns) known.add(arn);
  };
  collect();
  call(['ecs', 'update-service', '--cluster', names.cluster, '--service', names.service, '--desired-count', '0']);
  for (let n = 0; n < 90; n++) {
    // ListTasks filters desired status: a stopping process can already disappear from the default RUNNING list.
    collect();
    const arns = [...known];
    let live = false;
    for (let offset = 0; offset < arns.length; offset += 100) {
      const observed = call(['ecs', 'describe-tasks', '--cluster', names.cluster, '--tasks', ...arns.slice(offset, offset + 100),
        '--query', '{tasks:tasks[].{arn:taskArn,status:lastStatus},failures:failures[].reason}']);
      if (observed.failures.length) throw new Error('Cannot prove coordinator task exit from ECS metadata.');
      live ||= observed.tasks.some((task: any) => task.status !== 'STOPPED');
    }
    const service = call(['ecs', 'describe-services', '--cluster', names.cluster, '--services', names.service]).services[0];
    if (!live && service.desiredCount === 0 && service.runningCount === 0 && service.pendingCount === 0) return;
    await sleep(2000);
  }
  throw new Error('Coordinator tasks did not stop.');
}

export async function coordinatorStatus() {
  // Publish selected lifecycle metadata only; task definitions may contain secret metadata in future revisions.
  const state = stack(names.state), runtime = stack(names.runtime);
  if (!state) return { deployed: false };
  const service = runtime ? coordinatorAws(['ecs', 'describe-services', '--cluster', names.cluster, '--services', names.service]).services[0] : undefined;
  return { deployed: !!runtime, address: state.Address, instance: runtime?.Instance,
    service: service && { desired: service.desiredCount, running: service.runningCount, pending: service.pendingCount, deployments: service.deployments.map((item: any) => ({ status: item.status, rolloutState: item.rolloutState, taskDefinition: item.taskDefinition })) } };
}

export async function verifyHeadscale() {
  // Verify actual host state and a certificate-validated public health request before declaring deployment successful.
  const state = stack(names.state), runtime = stack(names.runtime); if (!state || !runtime) throw new Error('Coordinator is not deployed.');
  const deployed = JSON.parse(readFileSync(deployedInputsPath, 'utf8')) as HeadscaleRuntimeInputs;
  const taskArns = coordinatorAws(['ecs', 'list-tasks', '--cluster', names.cluster, '--service-name', names.service]).taskArns;
  if (taskArns.length !== 1) throw new Error('Expected exactly one running coordinator task.');
  const task = coordinatorAws(['ecs', 'describe-tasks', '--cluster', names.cluster, '--tasks', taskArns[0],
    '--query', 'tasks[0].{definition:taskDefinitionArn,status:lastStatus,containers:containers[].{name:name,image:image,digest:imageDigest}}']);
  const digest = coordinatorAws(['ecr', 'describe-images', '--repository-name', names.imageRepository,
    '--image-ids', `imageTag=${deployed.image.split(':').pop()}`]).imageDetails[0].imageDigest;
  if (task.definition !== runtime.Task || task.status !== 'RUNNING' || task.containers.length !== 1
    || task.containers[0].name !== 'headscale' || task.containers[0].digest !== digest) throw new Error('Actual coordinator executable/task identity differs.');
  const evidence = await diagnostic(async execute => JSON.parse(await execute('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py verify')));
  const boot = JSON.parse(await remote(runtime.Instance!)('apiclient get settings.bootstrap-containers.headscale')).settings['bootstrap-containers'].headscale;
  let configuration;
  try { configuration = JSON.parse(Buffer.from(boot['user-data'], 'base64').toString()); } catch { throw new Error('Invalid persisted coordinator boot configuration.'); }
  if (configuration.initialize !== false || configuration.volume !== state.Volume || boot.source !== deployed.hostImage) throw new Error('Coordinator boot retained initialization permission or wrong storage/artifact.');
  const health = await fetch(`https://${config.hostname}/health`, { signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error('Public coordinator health failed.');
  const client = new GuardDutyClient({ region: config.region, credentials: fromIni({ profile }) });
  const coverage = await verifyGuardDuty(client, { service: true, runtime: true }, runtime.Instance!, { attempts: 60, pause: () => pause(10_000) });
  if (coverage.status !== 'HEALTHY') throw new Error('NVA coordinator requires exact-host HEALTHY runtime coverage.');
  const result = { ...evidence, imageDigest: digest, initializationRevoked: true, coverage, verifiedAt: new Date().toISOString(), instance: runtime.Instance, address: state.Address };
  save(resolve(work, 'verification.json'), result);
  return result;
}

export async function runHeadscale(action: string, args: string[], approvalId?: string) {
  // All command surfaces share account checks and a separate coordinator namespace, never regional selectors.
  mkdirSync(work, { recursive: true, mode: 0o700 });
  if (coordinatorAws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('Coordinator account mismatch.');
  if (action === 'status') return coordinatorStatus();
  if (action === 'plan') {
    const inputs = prepareHeadscale(); cdk('diff', names.state, inputs); cdk('diff', names.runtime, inputs); return { planned: true };
  }
  if (action === 'qualify') { const inputs = prepareHeadscale(); qualifyHeadscaleImages(inputs); return { qualified: true }; }
  if (action === 'approve') {
    // Reject input before taking the operation lock. An older helper fails before any registration can be sent.
    const [user] = args;
    if (args.length !== 1 || !user || !/^[a-z][a-z0-9-]{0,31}$/.test(user)
      || !approvalId || !/^[A-Za-z0-9_-]{8,128}$/.test(approvalId)) throw new Error('Invalid private enrollment input.');
    const result = await exclusive(action, () => diagnostic(execute => approveHeadscaleEnrollment(execute, user, approvalId)));
    if (result === null) throw new Error('Private enrollment helper unavailable. Verify the coordinator helper deployment.');
    return result;
  }
  return exclusive(action, async () => {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.phase === 'verify' && args[0] !== '--refresh') {
      if (JSON.stringify(receipt.verification) !== JSON.stringify(verificationIdentity())) throw new Error('Coordinator changed after the interrupted rollout; inspect before forward repair.');
      return verifyHeadscale();
    }
    if (action === 'deploy' && args[0] === '--refresh') {
      delete receipt.phase; delete receipt.verification; save(receiptPath, receipt);
    }
    if (action === 'verify') return verifyHeadscale();
    if (['users', 'nodes', 'delete-node', 'delete-user'].includes(action)) {
      const allowed = action === 'users' ? args.length ? ['users', 'create', args[0]!] : ['users', 'list']
        : action === 'nodes' ? ['nodes', 'list']
          : [action === 'delete-node' ? 'nodes' : 'users', 'delete', '--identifier', args[0]!, '--force'];
      if (allowed.some(item => !/^[A-Za-z0-9_-]+$/.test(item))) throw new Error('Invalid coordinator administrative argument.');
      return diagnostic(async execute => JSON.parse(await execute(`apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py admin ${allowed.join(' ')}`)));
    }
    if (action === 'restart') {
      await stopHeadscaleTasks();
      coordinatorAws(['ecs', 'update-service', '--cluster', names.cluster, '--service', names.service, '--desired-count', '1']);
    } else if (action === 'deploy') {
      const inputs = prepareHeadscale();
      qualifyHeadscaleImages(inputs);
      cdk('diff', names.state, inputs); cdk('deploy', names.state, inputs);
      mirrorAndBuild(inputs);
      if (stack(names.runtime)) {
        await stopHeadscaleTasks();
        const data = Buffer.from(JSON.stringify(inputs.files)).toString('base64');
        await diagnostic(execute => execute(`apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py configure ${data}`));
        if (!existsSync(deployedInputsPath)) throw new Error('Missing deployed coordinator receipt; reconstruct actual inputs before host replacement.');
        const previous = JSON.parse(readFileSync(deployedInputsPath, 'utf8')) as HeadscaleRuntimeInputs;
        if (headscaleHostChanges(previous, inputs)) {
          await diagnostic(execute => execute('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py unmount'));
          cdk('destroy', names.runtime, previous);
        }
      }
      const needsAdmission = !stack(names.runtime);
      if (needsAdmission) { inputs.initialize = initializationPermission(); inputs.active = false; }
      cdk('diff', names.runtime, inputs); cdk('deploy', names.runtime, inputs);
      if (needsAdmission) await admitRuntime(inputs);
      // Planning may select newer unpublished images; replacement must reconstruct the actually deployed operation.
      save(deployedInputsPath, inputs);
      if (!needsAdmission) coordinatorAws(['ecs', 'update-service', '--cluster', names.cluster, '--service', names.service, '--desired-count', '1', '--force-new-deployment']);
    } else if (action === 'replace-host') {
      const inputs = JSON.parse(readFileSync(deployedInputsPath, 'utf8')) as HeadscaleRuntimeInputs;
      if (stack(names.runtime)) {
        await stopHeadscaleTasks();
        await diagnostic(execute => execute('apiclient exec ghostline-diagnostics -- python3 /opt/ghostline/headscale-host.py unmount'));
        cdk('destroy', names.runtime, inputs);
      }
      inputs.initialize = false; inputs.active = false;
      cdk('diff', names.runtime, inputs); cdk('deploy', names.runtime, inputs);
      await admitRuntime(inputs);
      save(deployedInputsPath, inputs);
    } else throw new Error('Unknown coordinator action.');
    for (let n = 0; n < 120; n++) {
      const status = await coordinatorStatus();
      if (status.service?.running === 1 && status.service?.pending === 0 && status.service.deployments.every((item: any) => item.rolloutState === 'COMPLETED')) {
        checkpointVerification();
        return verifyHeadscale();
      }
      await pause(5000);
    }
    throw new Error('Coordinator did not reach settled healthy state.');
  });
}
