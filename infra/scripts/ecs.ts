import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { fromIni } from '@aws-sdk/credential-providers';
import { getDeployment } from '../lib/config.js';
import { ecsDeploymentCommand } from '../lib/commands.js';
import { assertServerParameterMetadata, credentialParameters, importParameters, serverParameterNames } from '../lib/parameters.js';
import { setEcsPower } from '../lib/ecs-power.js';
import { deployedClientImages, testEcsClients } from '../lib/ecs-client-test.js';
import { imageArchitecture, imageArtifacts, imagePlatform, releaseTag } from '../lib/ecs-release.js';
import { assertOfficialXray, prepareImage, publishImageSet } from '../lib/ecs-images.js';
import { testEcsImages } from '../lib/ecs-image-tests.js';
import { ecsMemoryBudget } from '../lib/ecs-memory.js';
import { ecsVerificationCommand } from '../lib/ecs-verification.js';
import { parseJson } from '../lib/xray-config.js';
import { xrayLink } from '../lib/xray.js';
import { profileQr, vpnLink } from '../lib/profile-share.js';
import { ensureGuardDuty, guardDutyPreflight, verifyGuardDuty } from '../lib/guardduty.js';
import { discoverGuardDuty } from '../lib/guardduty-discovery.js';

const [target, action, ...extra] = process.argv.slice(2);
const config = getDeployment(target);
if (action === 'import' ? extra.length !== 1 : extra.length !== 0) {
  throw new Error('Usage: npm run ecs <target> <action>; import requires a credential directory.');
}
const platform = imagePlatform;
const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.local/deployments', config.id, 'ecs');
mkdirSync(work, { recursive: true, mode: 0o700 });
const environment = { ...process.env, GHOSTLINE_DEPLOYMENT: config.id };
const parameters = new SSMClient({ region: config.region, credentials: fromIni({ profile: 'personal' }) });
const guardDuty = new GuardDutyClient({ region: config.region, credentials: fromIni({ profile: 'personal' }) });

function run(command: string, args: string[], input?: string | Buffer, visible = false): string {
  // Errors never reproduce captured secret values or the ECR authentication token.
  const result = spawnSync(command, args, { cwd: resolve(root, 'infra'), env: environment, input,
    encoding: 'utf8', stdio: [visible && input === undefined ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} operation failed; captured output withheld.`);
  return result.stdout ?? '';
}

function aws(args: string[]) {
  const text = run('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json']);
  return text.trim() ? parseJson(text) : {};
}

function state(): Record<string, string> {
  const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus)) throw new Error('Endpoint stack is not stable.');
  return Object.fromEntries(stack.Outputs.map((item: any) => [item.OutputKey, item.OutputValue]));
}

function cdk(action: 'diff' | 'deploy', component: 'endpoint' | 'images' = 'endpoint') {
  // Scope every synthesis/deployment explicitly; no wildcard stack selection or SSH launch inputs.
  const command = ecsDeploymentCommand(action, config.id, resolve(root, 'infra'), component);
  run(process.execPath, [resolve(root, 'infra/node_modules/aws-cdk/bin/cdk'), ...command.args], undefined, true);
}

async function parameter(name: string): Promise<string> {
  const result = await parameters.send(new GetParameterCommand({ Name: `/ghostline/prod/${name}`, WithDecryption: true }));
  if (result.Parameter?.Type !== 'SecureString' || !result.Parameter.Value) throw new Error('Expected nonempty SecureString.');
  return result.Parameter.Value;
}

async function publish() {
  cdk('diff', 'images');
  cdk('deploy', 'images');
  // Keep registry authentication in an ignored task-local Docker config, never in process argv.
  const dockerConfig = resolve(work, 'docker');
  mkdirSync(dockerConfig, { recursive: true, mode: 0o700 });
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  const password = run('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password']);
  run('docker', ['--config', dockerConfig, 'login', '--username', 'AWS', '--password-stdin', registry], password);
  chmodSync(resolve(dockerConfig, 'config.json'), 0o600);
  try {
    const docker = (args: string[]) => run('docker', args);
    // Prime the verified official source used to check a mirrored Xray image's exact content.
    prepareImage('xray', resolve(work, 'build'), docker);
    const tested = await publishImageSet({
      existing: (artifact, tag) => {
        const repository = `${config.resourceName}/${artifact}`;
        const existing = aws(['ecr', 'list-images', '--repository-name', repository]).imageIds;
        if (!existing.some((image: { imageTag?: string }) => image.imageTag === tag)) return undefined;
        const image = `${registry}/${repository}:${tag}`;
        run('docker', ['--config', dockerConfig, 'pull', '--platform', platform, image]);
        return docker(['image', 'inspect', image, '--format', '{{.Id}}']).trim();
      },
      build: artifact => docker(['image', 'inspect', prepareImage(artifact, resolve(work, 'build'), docker), '--format', '{{.Id}}']).trim(),
      test: testEcsImages,
      push: (artifact, tag, imageId) => {
        const image = `${registry}/${config.resourceName}/${artifact}:${tag}`;
        docker(['tag', imageId, image]);
        run('docker', ['--config', dockerConfig, 'push', image], undefined, true);
        run('docker', ['--config', dockerConfig, 'pull', '--platform', platform, image]);
        if (docker(['image', 'inspect', image, '--format', '{{.Id}}']).trim() !== imageId) throw new Error('Published image differs from tested content.');
        if (artifact === 'xray') assertOfficialXray(image, docker);
      },
    });
    writeFileSync(resolve(work, 'publication.json'), JSON.stringify({ testedAt: new Date().toISOString(),
      images: imageArtifacts.map(artifact => ({ artifact, tag: releaseTag(artifact), imageId: tested[artifact] })) }, null, 2) + '\n');
    console.log('All three regional images match the locally tested set.');
  } finally {
    run('docker', ['--config', dockerConfig, 'logout', registry]);
  }
}

function power(action: 'start' | 'stop') {
  setEcsPower(action, config.stackName, state(), aws);
  console.log(`${config.id}: ${action === 'start' ? 'host running; gateway service stable' : 'host stopped; disk and EIPs retained'}.`);
}

async function verify() {
  const outputs = state();
  const parametersFile = resolve(work, 'verify-command.json');
  writeFileSync(parametersFile, JSON.stringify({ commands: [ecsVerificationCommand()], executionTimeout: ['120'] }));
  const id = aws(['ssm', 'send-command', '--instance-ids', outputs.InstanceId!, '--document-name', 'AWS-RunShellScript',
    '--parameters', `file://${parametersFile}`]).Command.CommandId;
  // Poll bounded SSM invocations; errors contain only nonsecret diagnostics from the verification script.
  let invocation: any;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    invocation = aws(['ssm', 'get-command-invocation', '--instance-id', outputs.InstanceId!, '--command-id', id]);
    if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(invocation.Status)) break;
  }
  if (invocation.Status !== 'Success') {
    console.log(invocation.StandardErrorContent);
    throw new Error('Remote verification failed.');
  }
  const evidence = parseJson(invocation.StandardOutputContent);
  const budget = ecsMemoryBudget(config.instanceType);
  if (evidence.gatewayMemory.taskLimitMiB !== budget.task || evidence.gatewayMemory.agentReservedMiB !== budget.reserved) {
    throw new Error('Live task memory policy differs from IaC.');
  }
  // The verifier returns only hashes and selected metadata, never configuration or injected values.
  writeFileSync(resolve(work, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  for (const protocol of ['xray', 'awg'] as const) {
    const secret = await parameter(`server/${protocol}`);
    const bytes = protocol === 'xray' ? Buffer.from(parseJson(secret).files['server.json'], 'base64') : Buffer.from(secret);
    if (evidence[protocol].architecture !== imageArchitecture
      || evidence[protocol].configSha256 !== createHash('sha256').update(bytes).digest('hex')
      || evidence[protocol].publicIp !== outputs[protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp']) throw new Error('Runtime identity or egress mismatch.');
    console.log(`${protocol}: preserved configuration, bridge isolation and EIP egress passed (${evidence[protocol].publicIp}).`);
    console.log(`${protocol}: private read-only tmpfs, absent engine secret environment and disabled host swap verified.`);
  }
  console.log(`Gateway memory: ${budget.task} MiB enforced task limit; ${budget.reserved} MiB ECS reserve; no task OOM events.`);
  await monitoring(outputs);
}

async function monitoring(outputs: Record<string, string>) {
  // Coverage propagates asynchronously; persist only nonsecret host/status evidence after the bounded gate.
  const support = discoverGuardDuty(config);
  const evidence = await verifyGuardDuty(guardDuty, support, outputs.InstanceId!, { report: console.log });
  writeFileSync(resolve(work, 'guardduty.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log(evidence.status === 'HEALTHY'
    ? `GuardDuty: HEALTHY coverage for ${evidence.instanceId}; agent ${evidence.agentVersion}.`
    : `GuardDuty: ${evidence.status}; ${evidence.reason} Gateway validation continues with reduced protection.`);
}

async function profiles() {
  const outputs = state();
  const folder = resolve(root, '.local/recovery', `${config.id}-clients`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const device of ['macos', 'ios']) for (const protocol of ['xray', 'awg'] as const) {
    let value = await parameter(`clients/${device}/${protocol}`);
    // Apply the currently allocated endpoint; preserve the device's protocol identity.
    if (protocol === 'xray') {
      const profile = parseJson(value);
      profile.outbounds[0].settings.vnext[0].address = outputs.EndpointIp;
      value = JSON.stringify(profile, null, 2);
    } else value = value.replace(/^Endpoint\s*=.*$/m, `Endpoint = ${outputs.AwgEndpointIp}:443`);
    const basename = resolve(folder, `${device}-${protocol}`);
    writeFileSync(`${basename}.${protocol === 'xray' ? 'json' : 'conf'}`, value, { mode: 0o600 });
    const link = protocol === 'xray' ? xrayLink(parseJson(value), `Ghostline ${config.id} ${device}`) : vpnLink(value);
    writeFileSync(`${basename}.vpn`, link, { mode: 0o600 });
    writeFileSync(`${basename}-qr.png`, await profileQr(protocol === 'xray' ? link : value), { mode: 0o600 });
  }
  console.log(`Saved protected profiles: ${folder}`);
}

try {
  if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
  switch (action) {
    case 'import': console.log(await importParameters(parameters, config, credentialParameters(resolve(extra[0]!)))); break;
    case 'publish': await publish(); break;
    case 'deploy': {
      run(process.execPath, ['--import=tsx', 'scripts/deployment.ts', 'preflight', config.id], undefined, true);
      assertServerParameterMetadata(aws(['ssm', 'describe-parameters', '--parameter-filters',
        JSON.stringify([{ Key: 'Name', Option: 'Equals', Values: serverParameterNames }])]).Parameters);
      for (const protocol of imageArtifacts) {
        // Missing releases should fail here, not leave CloudFormation waiting on unstartable tasks.
        aws(['ecr', 'describe-images', '--repository-name', `${config.resourceName}/${protocol}`, '--image-ids', `imageTag=${releaseTag(protocol)}`]);
      }
      const support = discoverGuardDuty(config);
      if (support.service) await guardDutyPreflight(guardDuty);
      cdk('diff');
      // Transport and host permissions must exist before a new detector begins automatic installation.
      cdk('deploy');
      const protection = await ensureGuardDuty(guardDuty, support, { tags: { ...config.globalTags, System: 'shared' }, report: console.log });
      if (protection.status !== 'RUNTIME_ENABLED') console.log(`GuardDuty: ${protection.status}; ${protection.reason}`);
      await monitoring(state()); break;
    }
    case 'start': case 'stop': power(action); break;
    case 'status': {
      const outputs = state();
      if (!outputs.InstanceId) { console.log({ ...outputs, state: 'parked' }); break; }
      console.log({ ...outputs, state: aws(['ec2', 'describe-instances', '--instance-ids', outputs.InstanceId!]).Reservations[0].Instances[0].State.Name }); break;
    }
    case 'verify': await verify(); break;
    case 'profiles': await profiles(); break;
    case 'test': {
      const outputs = state();
      const images = deployedClientImages(config, outputs, aws);
      await profiles();
      await testEcsClients(config, root, work, outputs, images);
      break;
    }
    default: throw new Error('Select import, publish, deploy, start, stop, status, verify, profiles or test.');
  }
} catch (error) {
  // AWS SDK errors may carry request details; print only our fixed message or an error class.
  console.error(error instanceof Error && error.constructor === Error ? error.message : `ECS operation failed (${(error as { name?: string }).name ?? 'unknown'}); details withheld.`);
  process.exitCode = 1;
}
