import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ECRClient } from '@aws-sdk/client-ecr';
import { getDeployment } from '../lib/config.js';
import { deployedClientImages, testEcsClients } from '../lib/ecs-client-test.js';
import { EcrRegistry, readRelease } from '../lib/releases/registry.js';
import { releaseRepository, releaseSelector, repository } from '../lib/releases/model.js';
import { credentials } from '../lib/benchmark/cloud.js';
import { launchBrowser, localNetwork } from '../lib/benchmark/local.js';
import { checkAccess } from '../lib/benchmark/browser.js';
import { speedTest } from '../lib/benchmark/measurement.js';
import { buildBenchmarkAssets } from '../lib/benchmark/assets.js';
import { readJson, saveJson, validateCampaign } from '../lib/benchmark/model.js';

// Explicit live acceptance against an existing target; no server or image publication changes.
const [input, mode, ...extra] = process.argv.slice(2);
if (!input || extra.length || (mode && mode !== '--access-only')) throw new Error('Supply the private campaign configuration and optional --access-only.');
const campaign = validateCampaign(readJson(resolve(input))), config = getDeployment(campaign.source);
localNetwork();
const aws = (args: string[]) => JSON.parse(execFileSync('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
const outputs = Object.fromEntries(stack.Outputs.map((o: any) => [o.OutputKey, o.OutputValue]));
const images = deployedClientImages(config, outputs, aws);
const release = await readRelease(new EcrRegistry(new ECRClient({ region: config.region, credentials }), config.account, config.region), releaseRepository, releaseSelector);
if (!release) throw new Error('No selected release.');
const proxyImage = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${repository('bootstrap')}@${release.release.images.bootstrap.digest}`;
const login = spawnSync('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password'], { encoding: 'utf8' });
if (login.status !== 0) throw new Error('Authentication failed.');
const auth = spawnSync('docker', ['login', '--username', 'AWS', '--password-stdin', `${config.account}.dkr.ecr.${config.region}.amazonaws.com`], { input: login.stdout, encoding: 'utf8' });
if (auth.status !== 0) throw new Error('Docker login failed.');
for (const image of [...Object.values(images), proxyImage]) if (spawnSync('docker', ['pull', image], { encoding: 'utf8' }).status !== 0) throw new Error('Image pull failed.');
const root = resolve('..'), work = resolve(root, '.local/benchmarks/client-qualification'); mkdirSync(work, { recursive: true, mode: 0o700 });
const assets = await buildBenchmarkAssets(process.cwd(), work);
const direct = await launchBrowser();
const before = mode ? undefined : await speedTest(direct, assets.speed, 10);
console.log(JSON.stringify({ directBefore: before }));
const results: unknown[] = [];
try {
  await testEcsClients(config, root, work, outputs, images, async client => {
    const browser = await launchBrowser(client.proxy);
    try {
      const access = await checkAccess(browser, campaign.canary);
      // Qualify performance mechanics with neutral traffic, without claiming canary openness when access is inconclusive.
      const speed = mode ? undefined : await speedTest(browser, assets.speed, 30);
      const after = mode ? undefined : await speedTest(direct, assets.speed, 10);
      const result = { protocol: client.protocol, access, speed, directAfter: after };
      results.push(result); saveJson(resolve(work, mode ? 'access-results.json' : 'results.json'), { before, results }); console.log(JSON.stringify(result));
    } finally { await browser.close(); }
  }, { proxyImage, ...(mode ? { protocols: ['xray'] as const } : {}) });
} finally { await direct.close(); }
