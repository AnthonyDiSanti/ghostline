import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ECRClient } from '@aws-sdk/client-ecr';
import { fromIni } from '@aws-sdk/credential-providers';
import { getDeployment } from '../lib/config.js';
import { platformImage, platformInputs, platformRepository, platformSourceHash, platformStackName } from '../lib/platform-image.js';
import { copyImage, EcrRegistry, runtimeManifest } from '../lib/releases/registry.js';

const [target, action, sourceRegion, sourceRepository, ...extra] = process.argv.slice(2);
const config = getDeployment(target);
const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.local/deployments', config.id, 'platform');
mkdirSync(work, { recursive: true, mode: 0o700 });

function run(program: string, args: string[], input?: string, visible = false): string {
  // Registry credentials and captured errors stay out of logs.
  const result = spawnSync(program, args, { cwd: resolve(root, 'infra'),
    env: { ...process.env, GHOSTLINE_DEPLOYMENT: config.id }, input, encoding: 'utf8',
    stdio: ['pipe', visible ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${program} failed; captured output withheld.`);
  return result.stdout ?? '';
}

function cdk(operation: 'diff' | 'deploy') {
  run(process.execPath, [resolve(root, 'infra/node_modules/aws-cdk/bin/cdk'), operation, platformStackName,
    '--app', 'node --import=tsx bin/platform.ts', '--profile', 'personal', '--region', config.region,
    '--output', resolve(work, 'cdk.out'), ...(operation === 'deploy' ? ['--require-approval', 'never'] : [])], undefined, true);
}

const registry = (region: string) => new EcrRegistry(new ECRClient({ region, credentials: fromIni({ profile: 'personal' }) }), config.account, region);

try {
  if (extra.length || !['build', 'seed', 'check'].includes(action ?? '')
    || (action === 'seed' ? !sourceRegion || !sourceRepository : !!sourceRegion || !!sourceRepository)) {
    throw new Error('Usage: npm run platform <target> <build|check|seed source-region source-repository>.');
  }
  const identity = JSON.parse(run('aws', ['--profile', 'personal', '--region', config.region, 'sts', 'get-caller-identity', '--output', 'json']));
  if (identity.Account !== config.account) throw new Error('AWS account mismatch.');
  if (action === 'build' || action === 'seed') { cdk('diff'); cdk('deploy'); }
  if (action === 'build') {
    // Build a candidate without changing committed intent or deploying any host; qualify before selecting it.
    const sourceSha256 = platformSourceHash();
    const host = `${config.account}.dkr.ecr.${config.region}.amazonaws.com`;
    const image = `${host}/${platformRepository}:${sourceSha256}`;
    const password = run('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password']);
    run('docker', ['login', '--username', 'AWS', '--password-stdin', host], password);
    const current = await registry(config.region).get(platformRepository, sourceSha256);
    if (!current) {
      run('docker', ['build', '--platform', 'linux/arm64', '-f', resolve(root, 'runtime/ecs/bottlerocket/host.Dockerfile'),
        '-t', image, resolve(root, 'runtime/ecs')], undefined, true);
      run('docker', ['push', image], undefined, true);
    }
    const candidate = await registry(config.region).get(platformRepository, sourceSha256);
    if (!candidate) throw new Error('Candidate image is missing.');
    writeFileSync(resolve(work, 'candidate.json'), JSON.stringify({ ...platformInputs, sourceSha256, digest: candidate.digest }, null, 2) + '\n');
    console.log(`Candidate saved in ${work}/candidate.json; qualify before updating platform-inputs.json.`);
  } else {
    if (action === 'seed') {
      if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(sourceRegion!) || !/^[a-z0-9][a-z0-9/_.-]+$/.test(sourceRepository!)) throw new Error('Invalid source registry.');
      await copyImage(registry(sourceRegion!), registry(config.region), sourceRepository!, platformRepository,
        platformInputs.digest, platformInputs.sourceSha256);
    }
    const selected = await registry(config.region).get(platformRepository, platformInputs.digest);
    if (!selected) throw new Error('Selected regional platform image is missing; seed it before deployment.');
    await runtimeManifest(registry(config.region), platformRepository, selected);
    console.log(`Selected platform image available: ${platformImage(config)}`);
  }
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Platform operation failed; details withheld.');
  process.exitCode = 1;
}
