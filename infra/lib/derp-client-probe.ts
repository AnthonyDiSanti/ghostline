import { execFileSync } from 'node:child_process';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { isIPv4 } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeployment, type DeploymentConfig } from './config.js';
import { deployedClientImages, testEcsClients } from './ecs-client-test.js';
import { imagePlatform, localImage, releaseTag } from './ecs-release.js';
import { credentials } from './releases/operator.js';
import type { DerpPublicIdentity } from './derp-identity.js';

export function maintainedProbeConfig(id: string): DeploymentConfig {
  // Native qualification uses a private catalog; the probe tunnel still belongs to the actual maintained fleet.
  const catalog = JSON.parse(readFileSync(new URL('../deployment.json', import.meta.url), 'utf8'));
  const { deployments, imagePublication: _publication, ...shared } = catalog;
  if (!Object.hasOwn(deployments, id)) throw new Error('Select a maintained tunnel for DERP probing.');
  return validateDeployment({ ...shared, ...deployments[id], id });
}

export async function probePublicDerp(relay: DeploymentConfig, via: DeploymentConfig): Promise<void> {
  // Two local upstream clients share a disposable AWG namespace, so admission sees an owned AWS EIP, not a personal IP.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const parent = resolve(root, '.local/derp-probes');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(resolve(parent, `${relay.id}-`));
  const command = (executable: string, args: string[], input?: string) => {
    try { return execFileSync(executable, args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], timeout: 45_000 }).trim(); }
    catch { throw new Error('Public DERP probe subprocess failed; output withheld.'); }
  };
  const aws = (args: string[]) => JSON.parse(command('aws', ['--profile', 'personal', '--region', via.region, ...args, '--output', 'json']));
  try {
    const output = await new CloudFormationClient({ region: via.region, credentials }).send(new DescribeStacksCommand({ StackName: via.stackName }));
    const outputs = Object.fromEntries((output.Stacks?.[0]?.Outputs ?? []).map(row => [row.OutputKey!, row.OutputValue!]));
    const response = await new SSMClient({ region: relay.region, credentials }).send(new GetParameterCommand({
      Name: `${relay.parameterPrefix ?? '/ghostline/prod'}/derp/public` }));
    const identity = JSON.parse(response.Parameter?.Value ?? '{}') as DerpPublicIdentity;
    if (!isIPv4(identity.ip) || !/^sha256-raw:[a-f0-9]{64}$/.test(identity.pin) || identity.ip === outputs.AwgEndpointIp) {
      throw new Error('DERP probe needs a public pinned identity and a different tunnel endpoint.');
    }
    if (!relay.derp?.allowedSources.includes(`${outputs.AwgEndpointIp}/32`)) throw new Error('The selected AWS tunnel is outside DERP probe admission.');
    const secret = await new SSMClient({ region: via.region, credentials }).send(new GetParameterCommand({
      Name: `${via.parameterPrefix ?? '/ghostline/prod'}/clients/macos/awg`, WithDecryption: true }));
    if (secret.Parameter?.Type !== 'SecureString' || !secret.Parameter.Value) throw new Error('Expected a private AWG test identity.');
    writeFileSync(resolve(work, 'macos-awg.conf'), secret.Parameter.Value.replace(/^Endpoint\s*=.*$/m, `Endpoint = ${outputs.AwgEndpointIp}:443`), { mode: 0o600 });
    const publicFile = resolve(work, 'public.json');
    writeFileSync(publicFile, JSON.stringify(identity), { mode: 0o444 });
    const images = deployedClientImages(via, outputs, aws);
    // Like the ordinary client test, work on a fresh machine without exposing temporary ECR authentication.
    const password = command('aws', ['--profile', 'personal', '--region', via.region, 'ecr', 'get-login-password']);
    command('docker', ['login', '--username', 'AWS', '--password-stdin', `${via.account}.dkr.ecr.${via.region}.amazonaws.com`], password);
    for (const image of Object.values(images)) command('docker', ['pull', '--platform', imagePlatform, image]);
    const proof = `ghostline-derp-proof:${releaseTag('derp')}`;
    command('docker', ['image', 'inspect', proof, '--format', '{{.Id}}']);
    const common = ['--rm', '--platform', imagePlatform, '--read-only', '--cap-drop', 'ALL', '--user', '65532:65532',
      '--security-opt', 'no-new-privileges:true', '--log-driver', 'none'];
    await testEcsClients(via, root, work, outputs, images, async client => {
      const options = [...common, '--network', `container:${client.container}`];
      const result = JSON.parse(command('docker', ['run', ...options, proof, '--host', identity.ip,
        '--identity', identity.ip, '--pin', identity.pin, '--port', '443']));
      if (result.relayBytes !== 1024 || !result.exactPayload || !result.upstreamMapPin) throw new Error('DERP transfer proof is incomplete.');
      command('docker', ['run', ...options, '-v', `${publicFile}:/etc/ghostline/derp/public.json:ro`,
        '--entrypoint', '/usr/local/bin/derp-tools', localImage('derp'), 'health', '--host', identity.ip, '--tls-port', '443']);
      console.log(`${relay.id}: public pinned TLS, two-client relay and STUN pass through ${via.id}; probe admission uses its AWS EIP.`);
    }, undefined, { profiles: work, protocols: ['awg'] });
  } finally { rmSync(work, { recursive: true, force: true }); }
}
