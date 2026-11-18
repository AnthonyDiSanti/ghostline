import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageInputs, imagePlatform, releaseBuildArgs, releaseFiles, releaseTag } from './ecs-release.js';
import { prepareImage } from './ecs-images.js';
import { createTestRamStorage } from './ecs-test-storage.js';
import { derpPublicIdentity, generateDerpIdentity } from './derp-identity.js';
import { generateXrayProfiles } from './xray.js';
import { generateAwgProfiles } from './awg.js';

export async function testDerpImage(initializerImage?: string): Promise<string> {
  // This is an AWS-free protocol proof: no real node keys, public listeners or laptop route changes.
  if (!imageInputs.derp) throw new Error('Resolve official stable DERP inputs before the image proof.');
  const parent = fileURLToPath(new URL('../../.local/deployments/image-tests/', import.meta.url));
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(resolve(parent, 'derp-'));
  const stem = `ghostline-derp-test-${randomUUID()}`;
  const common = ['--platform', imagePlatform, '--read-only', '--cap-drop', 'ALL', '--user', '65532:65532',
    '--security-opt', 'no-new-privileges:true', '--log-driver', 'none'];
  function execute(args: string[], required = true, secret?: string | Record<string, string>) {
    // Synthetic private keys may cross stdin/environment only in captured child processes, never assertions/logs.
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024,
      input: secret === undefined ? undefined : typeof secret === 'string' ? secret : JSON.stringify({
        xray: secret.GHOSTLINE_XRAY_BUNDLE, awg: secret.GHOSTLINE_AWG_BUNDLE, derp: secret.GHOSTLINE_DERP_BUNDLE }) });
    if (required && (result.error || result.status !== 0)) throw new Error(`DERP Docker ${args[0]} failed; details withheld.`);
    return result;
  }
  const docker = (args: string[]) => execute(args).stdout.trim();
  const cleanups: Array<() => void> = [];
  try {
    const image = prepareImage('derp', work, docker);
    const imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']);
    assert.equal(docker(['image', 'inspect', imageId, '--format', '{{.Config.User}}']), '65532:65532');
    assert.ok(docker(['run', '--rm', ...common, '--network', 'none', imageId, '-version']).startsWith(imageInputs.derp.tag.slice(1)));
    const initializer = initializerImage ?? prepareImage('gateway-config', work, docker);
    const sharedVolume = `${stem}-shared`;
    cleanups.push(createTestRamStorage(sharedVolume, initializer, docker, 'derp'));
    const fixture = resolve(work, 'derp-initializer.sh');
    copyFileSync(new URL('../test/fixtures/derp-initializer.sh', import.meta.url), fixture);
    const sharedProbe = (action: string) => docker(['run', '--rm', ...common, '--network', 'none', '-v', `${sharedVolume}:/config`,
      '-v', `${fixture}:/test/probe.sh:ro`, '--entrypoint', '/bin/sh', initializer, '/test/probe.sh', action]);
    sharedProbe('prepare');
    const sharedIdentity = generateDerpIdentity('192.0.2.10');
    const secrets = { GHOSTLINE_XRAY_BUNDLE: JSON.stringify(generateXrayProfiles('192.0.2.10').bundle),
      GHOSTLINE_AWG_BUNDLE: generateAwgProfiles('192.0.2.10').serverConfig, GHOSTLINE_DERP_BUNDLE: sharedIdentity };
    const initialize = (values: Record<string, string>) => execute(['run', '--rm', '--interactive', ...common, '--network', 'none',
      '-v', `${sharedVolume}:/config`, '--entrypoint', '/usr/local/bin/ghostline-gateway-config', initializer], false, values);
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(initialize(secrets).status, 0, 'Whole initializer renders all three protocol identities repeatedly');
      assert.equal(JSON.parse(sharedProbe('evidence')).pin, derpPublicIdentity(sharedIdentity).pin);
    }
    for (const invalid of ['', '{}', JSON.stringify({ ...JSON.parse(sharedIdentity), ip: '192.0.2.11' })]) {
      assert.notEqual(initialize({ ...secrets, GHOSTLINE_DERP_BUNDLE: invalid }).status, 0, 'Bad/missing DERP fails the whole initializer');
      sharedProbe('empty');
    }
    const configVolume = `${stem}-config`;
    cleanups.push(createTestRamStorage(configVolume, initializer, docker, 'derp'));
    const identity = generateDerpIdentity('192.0.2.10');
    assert.ok(Buffer.byteLength(identity) <= 4096, 'DERP envelope fits standard SecureString');
    // Rendering must receive only the selected bundle; keep it out of the reusable command wrapper's parent environment.
    const rendered = execute(['run', '--rm', '--interactive', ...common, '--network', 'none',
      '-v', `${configVolume}:/config`, '--entrypoint', '/usr/local/bin/derp-tools', imageId, 'render', '--directory', '/config'], false, identity);
    assert.equal(rendered.status, 0, `DERP identity renders into private RAM: ${rendered.stderr.trim()}`);
    const metadata = JSON.parse(docker(['run', '--rm', ...common, '--network', 'none', '-v', `${configVolume}:/config:ro`,
      '--entrypoint', '/bin/cat', initializer, '/config/public.json'])) as { ip: string; pin: string };
    assert.equal(metadata.pin, derpPublicIdentity(identity).pin, 'Operator and initializer agree on the complete leaf-certificate pin');

    // Compile the disposable probe from the same pinned upstream module without adding it to the runtime image.
    const context = resolve(work, 'proof');
    mkdirSync(context);
    for (const [name, bytes] of Object.entries(releaseFiles('derp'))) writeFileSync(resolve(context, name), bytes);
    const proof = `ghostline-derp-proof:${releaseTag('derp')}`;
    docker(['buildx', 'build', '--platform', imagePlatform, '--load', '--target', 'proof',
      ...Object.entries(releaseBuildArgs('derp')).flatMap(([key, value]) => ['--build-arg', `${key}=${value}`]), '-t', proof, context]);
    const network = `${stem}-network`;
    docker(['network', 'create', network]);
    cleanups.push(() => { execute(['network', 'rm', network], false); });
    const server = `${stem}-server`;
    cleanups.push(() => { execute(['rm', '-f', '-v', server], false); });
    const start = (stun: boolean) => {
      // Keep a real bounded log driver here so the test can detect privacy regressions in the production entrypoint.
      docker(['run', '-d', '--name', server, ...common.slice(0, -2), '--network', network, '--memory', '128m',
        '-v', `${configVolume}:/etc/ghostline/derp:ro`, '--entrypoint', '/usr/local/bin/derp-tools', imageId, 'serve', `--stun=${stun}`]);
    };
    const healthy = async (stun: boolean) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        if (execute(['exec', server, '/usr/local/bin/derp-tools', 'health', `--stun=${stun}`], false).status === 0) return;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error('DERP/STUN local health did not become ready.');
    };
    const relay = (pin = metadata.pin) => {
      const address = docker(['inspect', server, '--format', `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`]);
      return execute(['run', '--rm', ...common, '--network', network, proof,
        '--host', address, '--identity', metadata.ip, '--pin', pin, '--port', '8443'], false);
    };
    start(true);
    await healthy(true);
    const normal = relay();
    assert.equal(normal.status, 0, 'Two synthetic upstream clients transfer data through DERP');
    assert.equal(JSON.parse(normal.stdout).relayBytes, 1024);
    assert.notEqual(relay(`sha256-raw:${'0'.repeat(64)}`).status, 0, 'Upstream DERP-map verification rejects a wrong leaf pin');
    assert.equal(docker(['logs', server]), '', 'DERP logs omit synthetic client addresses and keys');
    docker(['rm', '-f', '-v', server]);
    start(false);
    await healthy(false);
    assert.notEqual(execute(['exec', server, '/usr/local/bin/derp-tools', 'health'], false).status, 0,
      'STUN health detects the unavailable UDP listener');
    assert.equal(relay().status, 0, 'DERP relays the exact payload without STUN/UDP discovery');
    assert.equal(docker(['logs', server]), '', 'UDP-unavailable operation preserves quiet logging');
    console.log('DERP/STUN: ARM64 version/non-root/private RAM, pinned TLS, two-client data, STUN, wrong-pin rejection and UDP-unavailable relay pass.');
    return imageId;
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
    rmSync(work, { recursive: true, force: true });
  }
}
