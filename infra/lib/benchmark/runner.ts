import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ECRClient } from '@aws-sdk/client-ecr';
import { getDeployment, validateDeployment, type DeploymentConfig } from '../config.js';
import { EcrRegistry, readRelease } from '../releases/registry.js';
import { releaseRepository, releaseSelector, repository } from '../releases/model.js';
import { componentMatches } from '../releases/stack-action.js';
import { applicationArtifacts } from '../image-artifacts.js';
import { lifecycleStore } from '../lifecycle-operator.js';
import { cleanupBenchmarkClients, prepareBenchmarkCleanup } from './cleanup.js';
import { hostSample } from './telemetry.js';
import { deployedClientImages, testEcsClients } from '../ecs-client-test.js';
import { buildBenchmarkAssets } from './assets.js';
import { BenchmarkCloud, credentials } from './cloud.js';
import { checkAccess } from './browser.js';
import { launchBrowser, localNetwork, routerMonitor } from './local.js';
import { downloadTest, speedTest, streamingTest } from './measurement.js';
import { createJournal, readJson, saveJson, stableControls, validateCampaign, type Journal, type Measurement, type RegionRecord, type Speed } from './model.js';

import { pairedComparisons, requestCleanup, runCohort } from './cohort.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const infra = resolve(root, 'infra');
const activePath = resolve(root, '.local/benchmarks/active.json');
const permanent = () => readJson<any>(resolve(infra, 'deployment.json'));
export function assertDisposableRegion(region: string, catalog: any): void {
  // Regional release support uses fixed names: never share a disposable run with a maintained gateway/publisher.
  if (Object.values(catalog.deployments).some((c: any) => c.region === region)
    || catalog.imagePublication.members.includes(region) || region === 'il-central-1' || region === 'me-central-1') throw new Error('Region is protected or excluded from disposable benchmarks.');
}
function aws(region: string, args: string[]): any {
  const result = spawnSync('aws', ['--profile', 'personal', '--region', region, ...args, '--output', 'json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 ** 2 });
  if (result.status !== 0 || result.error) throw new Error(`Benchmark AWS ${args[0]} ${args[1]} failed; output withheld.`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}
function acquire(journal: Journal) {
  mkdirSync(resolve(root, '.local/benchmarks'), { recursive: true, mode: 0o700 });
  if (existsSync(activePath)) {
    const prior = readJson<{ owner: string; pid: number }>(activePath);
    if (prior.owner !== journal.owner) throw new Error('Another campaign requires cleanup first.');
    try { process.kill(prior.pid, 0); throw new Error('Campaign process is still running.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  } else writeFileSync(activePath, JSON.stringify({ owner: journal.owner, pid: process.pid }), { mode: 0o600, flag: 'wx' });
  saveJson(activePath, { owner: journal.owner, pid: process.pid });
  process.env.GHOSTLINE_BENCHMARK_OWNER = journal.owner;
}
export function report(journal: Journal) {
  // Public reports deliberately omit the private campaign/canary, signed URLs and raw page artifacts.
  const rows = journal.records.map(r => ({ region: r.region, phase: r.phase, access: r.access,
    measurements: r.measurements, error: r.error }));
  return { campaign: journal.campaign.id, complete: journal.cohort ? journal.cohort.phase === 'complete' : journal.complete ?? false,
    cleanupComplete: journal.complete ?? false, baseline: journal.baseline, regions: rows, cohort: journal.cohort,
    comparisons: pairedComparisons(journal.cohort?.blocks ?? [], journal.campaign.source) };
}

export function summary(journal: Journal): string {
  // Show the source and every round alongside candidates; never collapse retries into a flattering last sample.
  const label = (target: string) => journal.records.find(r => r.target === target)?.region ?? target;
  const rows = (journal.cohort?.blocks ?? []).flatMap(b => b.samples.map(({ target, measurement: m }) =>
    `| ${b.round}${b.complete ? '' : ' (incomplete)'} | ${label(target)} | ${m.protocol} | ${m.access.status} | ${m.outcome ?? '-'} | ${m.speed?.mbps.toFixed(1) ?? '-'} | ${m.confirmation?.mbps.toFixed(1) ?? '-'} |`));
  const pairs = pairedComparisons(journal.cohort?.blocks ?? [], journal.campaign.source).map(p =>
    `| ${p.round} | ${label(p.target)} | ${p.protocol} | ${p.result} | ${p.ratio?.toFixed(2) ?? '-'} |`);
  const probes = journal.records.map(r => `- ${r.region}: ${r.access?.status ?? 'pending'} (${r.access?.reason ?? 'not-yet-probed'})`);
  return ['# Benchmark results', '', `Phase: ${journal.cohort?.phase ?? 'pending'}.`, '', ...probes, '',
    '| Round | Target | Protocol | Access | Result | Mbps | Independent Mbps |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows, '',
    '| Round | Candidate | Protocol | Matched comparison | Candidate/source ratio |', '| --- | --- | --- | --- | --- |', ...pairs, '',
    `Completed streaming checks: ${journal.cohort?.deep.length ?? 0}. No automatic primary cutover.`, ''].join('\n');
}

export async function runBenchmark(action: string, input: string): Promise<void> {
  if (!['plan', 'run', 'resume', 'status', 'cleanup'].includes(action)) throw new Error('Unknown benchmark action.');
  const campaignFile = input.endsWith('.json') ? resolve(input) : undefined;
  const campaign = campaignFile ? validateCampaign(readJson(campaignFile)) : undefined;
  const id = campaign?.id ?? input;
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(id)) throw new Error('Invalid campaign identifier.');
  const folder = resolve(root, '.local/benchmarks', id), journalFile = resolve(folder, 'journal.json');
  const journal: Journal = existsSync(journalFile) ? readJson(journalFile) : createJournal(campaign ?? (() => { throw new Error('A new campaign needs a configuration file.'); })());
  validateCampaign(journal.campaign);
  if (campaign && JSON.stringify(campaign) !== JSON.stringify(journal.campaign)) throw new Error('Campaign changed; use a new id.');
  const maintained = permanent();
  for (const region of journal.campaign.regions) assertDisposableRegion(region, maintained);
  const source = getDeployment(journal.campaign.source);
  if (action === 'status') { console.log(JSON.stringify(report(journal), null, 2)); return; }
  if (action === 'plan') {
    console.log(JSON.stringify({ campaign: id, regions: journal.campaign.regions, source: source.id, probeFirst: true,
      throughputSeconds: 30, controlSeconds: 30, streamingSeconds: 180, streamMbps: 25, minimumMbps: 50,
      readyCandidates: journal.campaign.regions.length, provisioningConcurrency: 1, rounds: journal.campaign.rounds ?? 2, fixtureRegion: 'eu-west-2', retained: ['Standard parameters', 'expiring logs', 'shared security'] }, null, 2));
    const planner = new BenchmarkCloud(infra, folder, source.account, journal, '', '', () => {});
    for (const region of journal.campaign.regions) console.log(`${region}: ${await planner.preflight(region) ?? 'region-enabled'}`);
    return;
  }
  if (action !== 'cleanup' && journal.version !== 2) throw new Error('Use a new campaign for streamed-v2 measurements; old campaigns support cleanup/status only.');
  acquire(journal);
  const save = () => {
    saveJson(journalFile, journal); saveJson(resolve(folder, 'results.json'), report(journal));
    writeFileSync(resolve(folder, 'summary.md'), summary(journal), { mode: 0o600 });
  };
  save();
  const cleanupClients = () => {
    if (!journal.localClients) return;
    cleanupBenchmarkClients(journal.owner, folder, args => {
      const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
      if (result.status !== 0) throw new Error('Exact campaign client cleanup failed.');
      return result.stdout;
    });
    journal.localClients = false; save();
  };
  cleanupClients();
  const catalogPath = resolve(folder, 'deployment.json');
  if (!existsSync(catalogPath)) saveJson(catalogPath, maintained);
  journal.catalogHash ??= createHash('sha256').update(JSON.stringify(maintained)).digest('hex');
  const maintainedHash = journal.catalogHash; save();
  const assertCatalogUnchanged = () => { if (createHash('sha256').update(JSON.stringify(permanent())).digest('hex') !== maintainedHash) throw new Error('Maintained catalog changed during campaign.'); };
  const assets = await buildBenchmarkAssets(infra, folder);
  const cloud = new BenchmarkCloud(infra, folder, source.account, journal, assets.probe, catalogPath, save);
  const configFor = (record: RegionRecord): DeploymentConfig => {
    const catalog = readJson<any>(catalogPath), selected = catalog.deployments[record.target!];
    if (!selected) throw new Error('Benchmark target is absent from its private catalog.');
    const { deployments: _deployments, imagePublication: _publication, ...shared } = catalog;
    const config = validateDeployment({ ...shared, ...selected, id: record.target! });
    if (config.region !== record.region || config.id !== `bm-${id}-${record.region}` || config.stackName !== `GhostlineBenchmark-${id}-gateway`
      || config.resourceName !== config.id || config.account !== source.account) throw new Error('Campaign target ownership changed.');
    return config;
  };
  const cleanupGateway = async (record: RegionRecord) => {
    if (!record.target) return;
    assertDisposableRegion(record.region, permanent());
    console.log(`${record.region}: destroy/resume cleanup`);
    const config = configFor(record);
    await prepareBenchmarkCleanup(config, journal.owner, root, lifecycleStore(config), async () => (await cloud.stack(config.region, config.stackName))?.StackStatus);
    await cloud.cli('destroy', [record.target]);
  };
  const registry = (region: string) => new EcrRegistry(new ECRClient({ region, credentials }), source.account, region);
  const selected = action === 'cleanup' ? undefined : await readRelease(registry(source.region), releaseRepository, releaseSelector);
  if (action !== 'cleanup' && !selected) throw new Error('Source release unavailable.');
  if (selected) {
    if (journal.releaseDigest && journal.releaseDigest !== selected.digest) throw new Error('Source release changed; clean up this campaign and start another.');
    journal.releaseDigest = selected.digest; save();
  }
  const prepared = new Map<string, { outputs: Record<string, string>; images: ReturnType<typeof deployedClientImages>; proxyImage: string }>();
  async function prepare(config: DeploymentConfig): Promise<void> {
    if (prepared.has(config.id)) return;
    // Prepare the shared object before timed blocks, not midway through a matched regional comparison.
    await cloud.fixture();
    localNetwork();
    await cloud.cli('ecs', [config.id, 'profiles']);
    const stack = aws(config.region, ['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
    const outputs: Record<string, string> = Object.fromEntries(stack.Outputs.map((o: any) => [o.OutputKey, o.OutputValue]));
    const images = deployedClientImages(config, outputs, args => aws(config.region, args));
    const current = await readRelease(registry(config.region), releaseRepository, releaseSelector);
    if (current?.digest !== selected!.digest) throw new Error('Regional release changed during measurement.');
    if (!applicationArtifacts.every(name => componentMatches(current.release.images[name], images[name].split('@')[1]))) {
      throw new Error('Actual gateway images do not match the campaign release.');
    }
    const login = spawnSync('aws', ['--profile', 'personal', '--region', config.region, 'ecr', 'get-login-password'], { encoding: 'utf8' });
    if (login.status !== 0) throw new Error('ECR login failed.');
    const logged = spawnSync('docker', ['login', '--username', 'AWS', '--password-stdin', `${config.account}.dkr.ecr.${config.region}.amazonaws.com`], { input: login.stdout, encoding: 'utf8' });
    if (logged.status !== 0) throw new Error('Docker ECR authentication failed.');
    const bootstrap = current.release.images.bootstrap;
    const proxyImage = `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${repository('bootstrap')}@${bootstrap.digest}`;
    for (const image of [...Object.values(images), proxyImage]) {
      const pulled = spawnSync('docker', ['pull', image], { encoding: 'utf8', timeout: 300_000 });
      if (pulled.status !== 0) throw new Error('Benchmark client image pull failed.');
    }
    prepared.set(config.id, { outputs, images, proxyImage });
  }
  async function measure(config: DeploymentConfig, protocol: 'xray' | 'awg', controls: Speed[], deep: boolean): Promise<Measurement> {
    localNetwork();
    const { outputs, images, proxyImage } = prepared.get(config.id)!;
    const current = await readRelease(registry(config.region), releaseRepository, releaseSelector);
    if (current?.digest !== selected!.digest) throw new Error('Regional release changed during measurement.');
    const measured: Measurement[] = [];
    journal.localClients = true; save();
    try { await testEcsClients(config, root, folder, outputs, images, async client => {
      const browser = await launchBrowser(client.proxy);
      try {
        const access = await checkAccess(browser, journal.campaign.canary);
        const item: Measurement = { protocol: client.protocol, access, release: current.digest, exit: outputs[client.protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp'],
          measuredAt: new Date().toISOString(), browserVersion: browser.version(), images };
        measured.push(item);
        if (access.status !== 'pass') return;
        const direct = await launchBrowser();
        try {
          item.calibration = [...controls];
          const network = localNetwork(), stop = routerMonitor(network.gateway), windowStarted = Date.now();
          try {
            item.before = await speedTest(direct, assets.speed, 30);
            item.speed = await speedTest(browser, assets.speed, 30);
            item.after = await speedTest(direct, assets.speed, 30);
            const after = localNetwork();
            // A suspended controller must not pair old controls with a much later resumed download.
            item.controlWindowSeconds = (Date.now() - windowStarted) / 1000;
            item.valid = item.controlWindowSeconds >= 0 && item.controlWindowSeconds <= 180 && after.interface === network.interface && after.gateway === network.gateway && stableControls(item.before, item.after, controls);
            item.router = await stop();
            console.log(`${config.region}/${client.protocol}: ${item.speed.mbps.toFixed(1)} Mbps; controls ${item.before.mbps.toFixed(1)}/${item.after.mbps.toFixed(1)} Mbps; ${item.valid ? 'valid' : 'deferred'}`);
          } catch (error) { await stop(); throw error; }
          if (!item.valid) { item.outcome = 'unstable-controls'; return; }
          if (item.speed!.mbps < 50) {
            const url = await cloud.fixture();
            const started = Date.now();
            const before = await speedTest(direct, assets.speed, 30);
            item.confirmation = await downloadTest(browser, url, 30, assets.speed);
            const after = await speedTest(direct, assets.speed, 30);
            item.confirmationControls = { before, after, windowSeconds: (Date.now() - started) / 1000 };
            if (item.confirmationControls.windowSeconds! < 0 || item.confirmationControls.windowSeconds! > 180 || !stableControls(before, after, controls)) { item.valid = false; item.outcome = 'unstable-controls'; return; }
          }
          item.outcome = Math.max(item.speed!.mbps, item.confirmation?.mbps ?? 0) >= 50 ? 'qualified' : 'insufficient-throughput';
          if (deep && item.outcome === 'qualified') {
            const url = await cloud.fixture();
            const started = Date.now();
            const before = await speedTest(direct, assets.speed, 30);
            item.streaming = await streamingTest(browser, url, 180, assets.speed);
            const after = await speedTest(direct, assets.speed, 30);
            item.streamingControls = { before, after, windowSeconds: (Date.now() - started) / 1000 };
            if (item.streamingControls.windowSeconds! < 0 || item.streamingControls.windowSeconds! > 300 || !stableControls(before, after, controls)) { item.valid = false; item.outcome = 'unstable-streaming-controls'; }
          }
        } finally {
          await direct.close();
          item.finishedAt = new Date().toISOString();
          item.host = hostSample(outputs.InstanceId!, new Date(item.measuredAt!), args => aws(config.region, args));
          if ((item.host.cpuMaximumPercent ?? 0) >= 85) {
            item.valid = false; item.outcome = 'host-capacity-limited';
          }
        }
      } finally { await browser.close(); }
    }, { proxyImage, owner: journal.owner,
      onUnavailable: protocol => { measured.push({ protocol, access: { status: 'transport-failure', reason: 'tunnel-unavailable' },
        valid: false, outcome: 'tunnel-unavailable', release: current.digest, measuredAt: new Date().toISOString(), images }); },
      protocols: [protocol] }); }
    finally { cleanupClients(); }
    const afterImages = deployedClientImages(config, outputs, args => aws(config.region, args));
    if (JSON.stringify(afterImages) !== JSON.stringify(images)) throw new Error('Runtime changed during measurements.');
    return measured[0]!;
  }
  async function provision(record: RegionRecord) {
    assertCatalogUnchanged(); assertDisposableRegion(record.region, maintained);
    if (!record.target) {
      for (const name of ['GhostlineRelease', 'GhostlineReleaseAssets']) if (await cloud.stack(record.region, name)) throw new Error('Region already contains Ghostline support; refusing adoption.');
      if (aws(record.region, ['ecr', 'describe-repositories']).repositories.some((r: any) => r.repositoryName.startsWith('ghostline/'))
        || aws(record.region, ['ec2', 'describe-instances', '--filters', 'Name=tag:Project,Values=ghostline', 'Name=instance-state-name,Values=pending,running,stopping,stopped']).Reservations.some((r: any) => r.Instances.length)) {
        throw new Error('Untracked Ghostline resources exist; refusing disposable adoption.');
      }
      record.target = `bm-${id}-${record.region}`;
      const catalog = readJson<any>(catalogPath);
      catalog.deployments[record.target] = { region: record.region, availabilityZone: await cloud.selectZone(record.region),
        stackName: `GhostlineBenchmark-${id}-gateway`, resourceName: record.target };
      saveJson(catalogPath, catalog); save();
    }
    const config = configFor(record);
    console.log(`${record.region}: copy protected parameters and seed release`);
    await cloud.copyCredentials(source.region, record.region);
    await cloud.cli('benchmark-region', [config.id, source.region, selected!.digest]);
    console.log(`${record.region}: deploy and verify gateway`);
    await cloud.cli('ecs', [config.id, 'deploy']);
    await cloud.cli('ecs', [config.id, 'verify']);
    return config;
  }
  if (action === 'cleanup') {
    requestCleanup(journal); save();
    for (const record of journal.records) { await cloud.cleanupProbe(record); await cleanupGateway(record); record.phase = 'done'; save(); }
    await cloud.cleanupFixture();
    if (journal.cohort) journal.cohort.phase = journal.cohort.failure ? 'failed' : 'complete';
    journal.complete = true; save(); rmSync(activePath); return;
  }
  try {
    const targetConfig = (target: string) => target === source.id ? source : configFor(journal.records.find(r => r.target === target)!);
    await runCohort(journal, { save, probe: r => cloud.probe(r), cleanupProbe: r => cloud.cleanupProbe(r), provision,
      prepare: target => prepare(targetConfig(target)),
      calibrate: async () => {
        localNetwork(); const direct = await launchBrowser();
        try { const samples: Speed[] = []; for (let n = 0; n < 3; n++) samples.push(await speedTest(direct, assets.speed, 30)); return samples; }
        finally { await direct.close(); }
      },
      measure: (target, protocol, calibration, deep) => measure(targetConfig(target), protocol, calibration, deep),
      cleanupGateway, cleanupFixture: () => cloud.cleanupFixture() });
    rmSync(activePath, { force: true });
  } finally {
    // Leave the ownership receipt for resume after failure; do not silently start another campaign over leaked resources.
    journal.baseline = journal.cohort?.blocks.flatMap(b => b.samples.filter(s => s.target === source.id).map(s => s.measurement));
    for (const r of journal.records) r.measurements = journal.cohort?.blocks.flatMap(b => b.samples.filter(s => s.target === r.target).map(s => s.measurement));
    if (journal.complete) rmSync(activePath, { force: true });
    save();

  }
}
