import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeRegionsCommand, DescribeAvailabilityZonesCommand, DescribeInstanceTypeOfferingsCommand } from '@aws-sdk/client-ec2';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromIni } from '@aws-sdk/credential-providers';
import { benchmarkBucket } from './stack.js';
import type { AccessResult, Journal, RegionRecord } from './model.js';
import { saveJson } from './model.js';

export const credentials = fromIni({ profile: 'personal' });
const bounded = { maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 30_000, throwOnRequestTimeout: true } };
export async function command(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}, timeout = 45 * 60_000): Promise<string> {
  // Argument arrays and withheld stderr keep private URLs, credentials and browser output out of chat/logs.
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', data => { if (out.length < 16 * 1024 ** 2) out += data; });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Benchmark subprocess unavailable.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? accept(out) : reject(new Error('Benchmark subprocess failed; no sensitive output retained.')); });
  });
}

export class BenchmarkCloud {
  private fixtureUrl?: { url: string; expiresAt: number };
  constructor(readonly infra: string, readonly folder: string, readonly account: string, readonly journal: Journal,
    readonly asset: string, readonly catalog: string, readonly save: () => void) {}
  private env() { return { GHOSTLINE_CATALOG: this.catalog, GHOSTLINE_BENCHMARK_OWNER: this.journal.owner }; }
  private prefix() { return `GhostlineBenchmark-${this.journal.campaign.id}`; }
  async preflight(region: string): Promise<string | undefined> {
    // Live account/region/availability checks never turn an access failure into an absent capability.
    const identity = await new STSClient({ region: 'us-east-1', credentials, ...bounded }).send(new GetCallerIdentityCommand({}));
    if (identity.Account !== this.account) throw new Error('Benchmark AWS account mismatch.');
    const regions = await new EC2Client({ region: 'us-east-1', credentials, ...bounded }).send(new DescribeRegionsCommand({ AllRegions: true }));
    const found = regions.Regions?.find(r => r.RegionName === region);
    return found && ['opt-in-not-required', 'opted-in'].includes(found.OptInStatus ?? '') ? undefined : 'region-not-enabled';
  }
  async stack(region: string, name: string) {
    try { return (await new CloudFormationClient({ region, credentials, ...bounded }).send(new DescribeStacksCommand({ StackName: name }))).Stacks?.[0]; }
    catch (error) { if ((error as Error).name === 'ValidationError' && /does not exist/.test((error as Error).message)) return undefined; throw error; }
  }
  private async cdk(region: string, name: string, kind: 'probe' | 'fixture', action: 'diff' | 'deploy' | 'destroy') {
    console.log(`${region}: ${action} ${name}`);
    const app = `node --import=tsx bin/benchmark.ts ${this.journal.campaign.id} ${region} ${kind} ${JSON.stringify(this.asset)}`;
    // CDK's app is a shell command: all variable path bytes must be constrained before construction.
    if (!/^[a-zA-Z0-9_./-]+$/.test(this.asset)) throw new Error('Unsupported benchmark asset path.');
    return command(process.execPath, ['node_modules/aws-cdk/bin/cdk', action, name, '--app', app, '--profile', 'personal',
      '--region', region, '--output', resolve(this.folder, `cdk-${region}-${kind}`), ...(action === 'deploy' ? ['--require-approval', 'never'] : action === 'destroy' ? ['--force'] : [])], this.infra, this.env());
  }
  private async own(region: string, name: string, record: RegionRecord) {
    const stack = await this.stack(region, name);
    if (!stack) return undefined;
    if (stack.Tags?.find(t => t.Key === 'BenchmarkCampaign')?.Value !== this.journal.campaign.id
      || stack.Tags?.find(t => t.Key === 'BenchmarkOwner')?.Value !== this.journal.owner
      || (record.stacks?.[name] && record.stacks[name] !== stack.StackId)) throw new Error('Benchmark resource ownership changed.');
    record.stacks ??= {}; record.stacks[name] = stack.StackId!; this.save();
    return stack;
  }
  async probe(record: RegionRecord): Promise<AccessResult> {
    const unavailable = await this.preflight(record.region);
    if (unavailable) return { status: 'inconclusive', reason: unavailable };
    for (const suffix of ['assets', 'probe']) {
      const name = `${this.prefix()}-${suffix}`;
      await this.own(record.region, name, record);
      // Save intent before create; exact campaign tags permit recovery if creation finished before ARN capture.
      record.stacks ??= {}; this.save();
      await this.cdk(record.region, name, 'probe', 'diff');
      await this.cdk(record.region, name, 'probe', 'deploy');
      await this.own(record.region, name, record);
    }
    const stack = await this.stack(record.region, `${this.prefix()}-probe`);
    const name = stack?.Outputs?.find(o => o.OutputKey === 'FunctionName')?.OutputValue;
    if (!name) throw new Error('Probe function output missing.');
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await new LambdaClient({ region: record.region, credentials, requestHandler: { requestTimeout: 70_000 } })
        .send(new InvokeCommand({ FunctionName: name, Payload: Buffer.from(JSON.stringify({ canary: this.journal.campaign.canary })) }));
      const parsed = result.FunctionError ? { status: 'inconclusive', reason: 'probe-invocation-error' } : JSON.parse(Buffer.from(result.Payload ?? []).toString());
      if (!['pass', 'restricted', 'transport-failure', 'inconclusive'].includes(parsed.status) || !/^[a-z-]+$/.test(parsed.reason)) throw new Error('Unexpected probe response.');
      if (attempt || ['pass', 'restricted'].includes(parsed.status)) return parsed;
    }
    throw new Error('Unreachable probe state.');
  }
  private async emptyBucket(region: string, bucket: string) {
    const client = new S3Client({ region, credentials, ...bounded });
    // Delete bounded pages only from an already verified exclusive stack bucket.
    for (let page = 0; page < 100; page++) {
      const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
      if (!list.Contents?.length) return;
      const deleted = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: list.Contents.map(o => ({ Key: o.Key! })) } }));
      if (deleted.Errors?.length) throw new Error('Benchmark bucket cleanup incomplete.');
    }
    throw new Error('Benchmark bucket inventory exceeds expected bounds.');
  }
  async cleanupProbe(record: RegionRecord) {
    // Disabled regions never create an ownership inventory; do not invoke unavailable regional APIs.
    if (!record.stacks) return;
    for (const suffix of ['probe', 'assets']) {
      const name = `${this.prefix()}-${suffix}`;
      if (!await this.own(record.region, name, record)) continue;
      if (suffix === 'assets') await this.emptyBucket(record.region, benchmarkBucket(this.account, record.region, this.journal.campaign.id, 'code'));
      await this.cdk(record.region, name, 'probe', 'destroy');
      if (await this.stack(record.region, name)) throw new Error('Probe deletion remains pending.');
      delete record.stacks![name]; this.save();
    }
  }
  async fixture(): Promise<string> {
    // Reuse the prepared object and URL throughout a block; refresh signing before expiry without another upload.
    if (this.fixtureUrl && this.fixtureUrl.expiresAt > Date.now()) return this.fixtureUrl.url;
    const region = 'eu-west-2', name = `${this.prefix()}-fixture`;
    const record: RegionRecord = { region, phase: 'pending', stacks: this.journal.fixtureStacks };
    if (!this.journal.fixture) {
      this.journal.fixture = true; this.save();
      await this.own(region, name, record);
      await this.cdk(region, name, 'fixture', 'diff'); await this.cdk(region, name, 'fixture', 'deploy');
      await this.own(region, name, record); this.journal.fixtureStacks = record.stacks; this.save();
    }
    const stack = await this.own(region, name, record);
    if (!stack) { this.journal.fixture = false; this.save(); return this.fixture(); }
    const bucket = benchmarkBucket(this.account, region, this.journal.campaign.id, 'data');
    const client = new S3Client({ region, credentials, ...bounded });
    try {
      const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'segment.bin' }));
      if (object.ContentLength !== 12_500_000) throw new Error('Unexpected benchmark fixture size.');
    } catch (error) {
      // Access failures are not absence: only a confirmed missing object permits creation.
      if ((error as Error).name !== 'NotFound') throw error;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: 'segment.bin', Body: randomBytes(12_500_000), ContentType: 'application/octet-stream', CacheControl: 'no-store' }));
    }
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: 'segment.bin' }), { expiresIn: 3600 });
    this.fixtureUrl = { url, expiresAt: Date.now() + 50 * 60_000 };
    return url;
  }
  async cleanupFixture() {
    this.fixtureUrl = undefined;
    if (!this.journal.fixture) return;
    const name = `${this.prefix()}-fixture`, record: RegionRecord = { region: 'eu-west-2', phase: 'pending', stacks: this.journal.fixtureStacks };
    if (await this.own(record.region, name, record)) {
      await this.emptyBucket(record.region, benchmarkBucket(this.account, record.region, this.journal.campaign.id, 'data'));
      await this.cdk(record.region, name, 'fixture', 'destroy');
    }
    this.journal.fixture = false; this.save();
  }
  async selectZone(region: string): Promise<string> {
    const ec2 = new EC2Client({ region, credentials, ...bounded });
    const zones = (await ec2.send(new DescribeAvailabilityZonesCommand({}))).AvailabilityZones?.filter(z => z.State === 'available').map(z => z.ZoneName!);
    const offerings = await ec2.send(new DescribeInstanceTypeOfferingsCommand({ LocationType: 'availability-zone', Filters: [{ Name: 'instance-type', Values: ['t4g.small'] }] }));
    const selected = zones?.sort().find(z => offerings.InstanceTypeOfferings?.some(o => o.Location === z));
    if (!selected) throw new Error('No available t4g.small zone.');
    return selected;
  }
  async copyCredentials(sourceRegion: string, targetRegion: string) {
    const source = new SSMClient({ region: sourceRegion, credentials, ...bounded }), target = new SSMClient({ region: targetRegion, credentials, ...bounded });
    const names = ['server/xray', 'server/awg', ...['macos', 'ios'].flatMap(d => [`clients/${d}/xray`, `clients/${d}/awg`]), 'alerts/email'];
    const values = [];
    // Inspect every conflict before writing anything; never send values through CLI arguments or logs.
    for (const name of names) {
      const full = `/ghostline/prod/${name}`, p = (await source.send(new GetParameterCommand({ Name: full, WithDecryption: true }))).Parameter;
      if (!p?.Value || !p.Type) throw new Error('Source credential metadata incomplete.');
      let old;
      try { old = (await target.send(new GetParameterCommand({ Name: full, WithDecryption: true }))).Parameter; }
      catch (error) { if ((error as Error).name !== 'ParameterNotFound') throw error; }
      if (old && (old.Value !== p.Value || old.Type !== p.Type)) throw new Error('Benchmark credential conflict; refusing overwrite.');
      if (!old) values.push({ Name: full, Value: p.Value, Type: p.Type });
    }
    for (const value of values) await target.send(new PutParameterCommand({ ...value, Tier: 'Standard', Overwrite: false,
      Tags: [{ Key: 'Project', Value: 'ghostline' }, { Key: 'Environment', Value: 'prod' }, { Key: 'System', Value: 'benchmark' }] }));
    // Confirm private round-trip equality before any host is allowed to consume copied credentials.
    for (const value of values) {
      const actual = (await target.send(new GetParameterCommand({ Name: value.Name, WithDecryption: true }))).Parameter;
      if (actual?.Value !== value.Value || actual.Type !== value.Type) throw new Error('Credential copy verification failed.');
    }
  }
  async cli(script: string, args: string[]) { return command(process.execPath, ['--import=tsx', `scripts/${script}.ts`, ...args], this.infra, this.env()); }
}
