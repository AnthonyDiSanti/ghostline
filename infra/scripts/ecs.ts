import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { getDeployment } from '../lib/config.js';
import { ecsDeploymentCommand } from '../lib/commands.js';
import { credentialParameters, importParameters } from '../lib/parameters.js';
import { setEcsPower } from '../lib/ecs-power.js';
import { testEcsClients } from '../lib/ecs-client-test.js';
import { imageArtifacts, imagePlatform, releaseTag } from '../lib/ecs-release.js';
import { assertOfficialXray, prepareImage } from '../lib/ecs-images.js';
import { parseJson } from '../lib/runtime.js';
import { xrayLink } from '../lib/xray.js';
import { profileQr, vpnLink } from '../lib/profile-share.js';

const [target, action, ...extra] = process.argv.slice(2);
const config = getDeployment(target);
if (!config.ecs || extra.length) throw new Error('Usage: npm run ecs <ecs-target> <import|publish|deploy|start|stop|status|verify|profiles|test>');
const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.local/deployments', config.id, 'ecs');
mkdirSync(work, { recursive: true, mode: 0o700 });
const environment = { ...process.env, GHOSTLINE_DEPLOYMENT: config.id };
const parameters = new SSMClient({ region: config.region, credentials: fromIni({ profile: 'personal' }) });

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

function cdk(action: 'diff' | 'deploy', images = false) {
  // Scope every synthesis/deployment explicitly; no wildcard stack selection or SSH launch inputs.
  const command = ecsDeploymentCommand(action, config.id, resolve(root, 'infra'), images);
  run(process.execPath, [resolve(root, 'infra/node_modules/aws-cdk/bin/cdk'), ...command.args], undefined, true);
}

async function parameter(name: string): Promise<string> {
  const result = await parameters.send(new GetParameterCommand({ Name: `/ghostline/prod/${name}`, WithDecryption: true }));
  if (result.Parameter?.Type !== 'SecureString' || !result.Parameter.Value) throw new Error('Expected nonempty SecureString.');
  return result.Parameter.Value;
}

async function publish() {
  cdk('diff', true);
  cdk('deploy', true);
  // Keep registry authentication in an ignored task-local Docker config, never in process argv.
  const dockerConfig = resolve(work, 'docker');
  mkdirSync(dockerConfig, { recursive: true, mode: 0o700 });
  const registry = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
  const password = run('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password']);
  run('docker', ['--config', dockerConfig, 'login', '--username', 'AWS', '--password-stdin', registry], password);
  chmodSync(resolve(dockerConfig, 'config.json'), 0o600);
  try {
    for (const protocol of imageArtifacts) {
      const repository = `${config.resourceName}/${protocol}`;
      const tag = releaseTag(protocol);
      const existing = aws(['ecr', 'list-images', '--repository-name', repository]).imageIds;
      if (existing.some((image: { imageTag?: string }) => image.imageTag === tag)) {
        console.log(`${protocol}: immutable release already published.`); continue;
      }
      const docker = (args: string[]) => run('docker', args);
      const local = prepareImage(protocol, resolve(work, 'build'), docker);
      const image = `${registry}/${repository}:${tag}`;
      docker(['tag', local, image]);
      run('docker', ['--config', dockerConfig, 'push', image], undefined, true);
      if (protocol === 'xray') {
        run('docker', ['--config', dockerConfig, 'pull', '--platform', imagePlatform, image]);
        assertOfficialXray(image, docker);
      }
    }
  } finally {
    run('docker', ['--config', dockerConfig, 'logout', registry]);
  }
}

function power(action: 'start' | 'stop') {
  setEcsPower(action, config.stackName, state(), aws);
  console.log(`${config.id}: ${action === 'start' ? 'host running; both services stable' : 'host stopped; disk and EIPs retained'}.`);
}

async function verify() {
  const outputs = state();
  const script = readFileSync(resolve(root, 'runtime/ecs/verify.py')).toString('base64');
  const parametersFile = resolve(work, 'verify-command.json');
  writeFileSync(parametersFile, JSON.stringify({ commands: [`echo '${script}' | base64 -d | python3`], executionTimeout: ['120'] }));
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
  for (const protocol of ['xray', 'awg'] as const) {
    const secret = await parameter(`server/${protocol}`);
    const bytes = protocol === 'xray' ? Buffer.from(parseJson(secret).files['server.json'], 'base64') : Buffer.from(secret);
    if (evidence[protocol].configSha256 !== createHash('sha256').update(bytes).digest('hex')
      || evidence[protocol].publicIp !== outputs[protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp']) throw new Error('Runtime identity or egress mismatch.');
    console.log(`${protocol}: preserved configuration, bridge isolation and EIP egress passed (${evidence[protocol].publicIp}).`);
  }
}

async function profiles() {
  const outputs = state();
  const folder = resolve(root, '.local/recovery', `${config.id}-clients`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const device of ['macos', 'ios']) for (const protocol of ['xray', 'awg'] as const) {
    let value = await parameter(`clients/${device}/${protocol}`);
    // Change only the endpoint for this parallel trial; preserve the device's protocol identity.
    if (protocol === 'xray') {
      const profile = parseJson(value);
      profile.outbounds[0].settings.vnext[0].address = outputs.EndpointIp;
      value = JSON.stringify(profile, null, 2);
    } else value = value.replace(/^Endpoint\s*=.*$/m, `Endpoint = ${outputs.AwgEndpointIp}:443`);
    const basename = resolve(folder, `${device}-${protocol}`);
    writeFileSync(`${basename}.${protocol === 'xray' ? 'json' : 'conf'}`, value, { mode: 0o600 });
    const link = protocol === 'xray' ? xrayLink(parseJson(value), `Ghostline ECS ${device}`) : vpnLink(value);
    writeFileSync(`${basename}.vpn`, link, { mode: 0o600 });
    writeFileSync(`${basename}-qr.png`, await profileQr(protocol === 'xray' ? link : value), { mode: 0o600 });
  }
  console.log(`Saved protected trial profiles: ${folder}`);
}

try {
  if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
  switch (action) {
    case 'import': console.log(await importParameters(parameters, config, credentialParameters(resolve(root, '.local/recovery'), config.ecs.credentialSource))); break;
    case 'publish': await publish(); break;
    case 'deploy':
      run(process.execPath, ['--import=tsx', 'scripts/deployment.ts', 'preflight', config.id], undefined, true);
      await parameter('server/xray'); await parameter('server/awg');
      for (const protocol of imageArtifacts) {
        // Missing releases should fail here, not leave CloudFormation waiting on unstartable tasks.
        aws(['ecr', 'describe-images', '--repository-name', `${config.resourceName}/${protocol}`, '--image-ids', `imageTag=${releaseTag(protocol)}`]);
      }
      cdk('diff'); cdk('deploy'); break;
    case 'start': case 'stop': power(action); break;
    case 'status': {
      const outputs = state();
      if (!outputs.InstanceId) { console.log({ ...outputs, state: 'parked' }); break; }
      console.log({ ...outputs, state: aws(['ec2', 'describe-instances', '--instance-ids', outputs.InstanceId!]).Reservations[0].Instances[0].State.Name }); break;
    }
    case 'verify': await verify(); break;
    case 'profiles': await profiles(); break;
    case 'test': await profiles(); await testEcsClients(config, root, work, state()); break;
    default: throw new Error('Select import, publish, deploy, start, stop, status, verify, profiles or test.');
  }
} catch (error) {
  // AWS SDK errors may carry request details; print only our fixed message or an error class.
  console.error(error instanceof Error && error.constructor === Error ? error.message : `ECS operation failed (${(error as { name?: string }).name ?? 'unknown'}); details withheld.`);
  process.exitCode = 1;
}
