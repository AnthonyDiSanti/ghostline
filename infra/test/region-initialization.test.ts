import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { credentialParameters, importParameters } from '../lib/parameters.js';
import { initializationOperator, stageFreshCredentials } from '../lib/region-initialization-operator.js';
import { alertParameterName, credentialNames, executeInitialization, planInitialization, validateInitializationPlan,
  type InitExecutionPorts, type InitInventory, type InitializationPlan, type InitParameter, type InitReceipt } from '../lib/region-initialization.js';

const config = { ...getDeployment('stockholm-ecs'), id: 'init-test', region: 'us-east-1', availabilityZone: 'us-east-1a',
  stackName: 'InitTest', resourceName: 'ghostline-init-test' };
const source = { id: 'stockholm-ecs', account: config.account, region: 'eu-north-1' };
const modified = '2026-11-07T12:00:00.000Z';
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function meta(name: string, version = 1): InitParameter {
  // Fixtures describe metadata only; generated credential values never enter assertions or snapshots.
  return { name, type: 'SecureString', tier: 'Standard', version, modified,
    tags: { Project: 'ghostline', Environment: 'prod', System: 'shared' } };
}

class Operation implements InitExecutionPorts {
  readonly work = mkdtempSync(resolve(tmpdir(), 'ghostline-init-test-'));
  readonly stage = resolve(this.work, 'credentials');
  readonly values = new Map<string, string>();
  readonly metadata = new Map<string, InitParameter>();
  currentReceipt?: InitReceipt;
  sourceParameter = meta(alertParameterName);
  account = config.account; regionEnabled = true; endpointExists = false; hosts: string[] = [];
  prepares = 0; writes = 0; imports = 0; copies = 0; cleanups = 0;
  failAtWrite?: number; failContact = false; sourceReads = 0;
  constructor() { temporary.push(this.work); }
  async observe(alertsFrom?: typeof source): Promise<InitInventory> {
    if (alertsFrom) this.sourceReads++;
    return { account: this.account, regionEnabled: this.regionEnabled, endpointExists: this.endpointExists,
      hosts: this.hosts, parameters: [...this.metadata.values()], ...(alertsFrom ? { sourceParameter: this.sourceParameter } : {}) };
  }
  receipt() { return this.currentReceipt; }
  prepare(plan: InitializationPlan) {
    this.prepares++;
    if (plan.actions.credentials === 'create') stageFreshCredentials(this.stage);
    this.currentReceipt = { schemaVersion: 1, planDigest: plan.digest, phase: 'prepared' };
  }
  async importCredentials() {
    // Exercise the actual validator/importer against a narrow fake SDK boundary, including partial writes.
    this.imports++;
    if (!existsSync(this.stage)) throw new Error('Protected staging is missing; explicit recovery required.');
    const client = { send: async (command: any): Promise<any> => {
      const { Name, Value, Overwrite, Tags } = command.input;
      if (command.constructor.name === 'GetParameterCommand') {
        if (!this.values.has(Name)) throw Object.assign(new Error('absent'), { name: 'ParameterNotFound' });
        return { Parameter: { Type: 'SecureString', Value: this.values.get(Name) } };
      }
      expect(command.constructor.name).toBe('PutParameterCommand');
      expect(Overwrite).toBe(false);
      this.writes++;
      if (this.writes === this.failAtWrite) throw new Error('Simulated interrupted import.');
      if (this.values.has(Name)) throw new Error('Refuse overwrite.');
      this.values.set(Name, Value);
      this.metadata.set(Name, { ...meta(Name), tags: Object.fromEntries(Tags.map((tag: any) => [tag.Key, tag.Value])) });
      return {};
    } };
    return importParameters(client, config, credentialParameters(this.stage));
  }
  async copyAlert() {
    this.copies++;
    if (this.failContact) { this.failContact = false; throw new Error('Simulated contact failure.'); }
    this.metadata.set(alertParameterName, meta(alertParameterName));
  }
  complete(receipt: InitReceipt) { this.currentReceipt = receipt; }
  cleanup() {
    this.cleanups++;
    if (existsSync(this.stage)) rmSync(this.stage, { recursive: true });
  }
  hashes() {
    return Object.fromEntries([...this.values].map(([key, value]) => [key, createHash('sha256').update(value).digest('hex')]));
  }
}

async function reviewed(operation: Operation) {
  return planInitialization(config, await operation.observe(source), source);
}

it('plans new identities and an explicit contact using metadata without generating or copying secrets', async () => {
  const operation = new Operation();
  const plan = await reviewed(operation);
  expect(plan.actions).toEqual({ credentials: 'create', alert: 'copy' });
  expect(operation.prepares + operation.imports + operation.copies).toBe(0);
  expect(existsSync(operation.stage)).toBe(false);
  expect(operation.values.size).toBe(0);
  expect(JSON.stringify(plan)).not.toContain('PrivateKey');
});

it.each(['account', 'region', 'endpoint', 'host', 'partial', 'type', 'owner', 'source'])(
  'refuses an unsafe %s starting state', async kind => {
    const operation = new Operation();
    if (kind === 'account') operation.account = '000000000000';
    if (kind === 'region') operation.regionEnabled = false;
    if (kind === 'endpoint') operation.endpointExists = true;
    if (kind === 'host') operation.hosts = ['i-1234567890abcdef0'];
    if (kind === 'partial') operation.metadata.set(credentialNames(config)[0]!, meta(credentialNames(config)[0]!));
    if (kind === 'type') operation.sourceParameter = { ...operation.sourceParameter, type: 'String' as any };
    if (kind === 'owner') operation.sourceParameter.tags = { Project: 'other', Environment: 'prod' };
    const observed = await operation.observe(source);
    if (kind === 'source') delete observed.sourceParameter;
    expect(() => planInitialization(config, observed, source)).toThrow();
    expect(operation.prepares + operation.writes + operation.copies).toBe(0);
  },
);

it('rejects edited plans and catalog changes before executing', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  expect(() => validateInitializationPlan({ ...plan, actions: { ...plan.actions, alert: 'preserve' } }, config)).toThrow('plan changed');
  expect(() => validateInitializationPlan(plan, { ...config, stackName: 'DifferentEndpoint' })).toThrow('target changed');
  expect(operation.prepares).toBe(0);
});

it.each(['destination', 'source', 'endpoint'] as const)('rejects changed %s state after review', async kind => {
  const operation = new Operation(); const plan = await reviewed(operation);
  if (kind === 'destination') operation.metadata.set(credentialNames(config)[0]!, meta(credentialNames(config)[0]!));
  if (kind === 'source') operation.sourceParameter = meta(alertParameterName, 2);
  if (kind === 'endpoint') operation.endpointExists = true;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow(/after planning/);
  expect(operation.prepares + operation.writes + operation.copies).toBe(0);
});

it('resumes a partial import using the same set and writes only the missing credentials', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  operation.failAtWrite = 4;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('interrupted');
  expect(operation.values.size).toBe(3);
  const first = operation.hashes();
  const result = await executeInitialization(plan, config, operation);
  expect(result).toMatchObject({ status: 'complete', created: 3, verified: 6, alert: 'copied' });
  expect(operation.prepares).toBe(1);
  for (const [name, fingerprint] of Object.entries(first)) expect(operation.hashes()[name]).toBe(fingerprint);
  expect(operation.values.size).toBe(6);
  expect(existsSync(operation.stage)).toBe(false);
});

it('does not regenerate an incomplete operation whose private staging was lost', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  operation.failAtWrite = 4;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('interrupted');
  rmSync(operation.stage, { recursive: true });
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('staging');
  expect(operation.prepares).toBe(1); expect(operation.values.size).toBe(3);
});

it('refuses conflicting values during resume before writing missing parameters', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  operation.failAtWrite = 4;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('interrupted');
  operation.values.set(credentialNames(config)[0]!, 'synthetic-conflicting-value');
  const writes = operation.writes;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('refusing credential overwrite');
  expect(operation.writes).toBe(writes); expect(operation.prepares).toBe(1);
});

it('resumes contact failure without generating or replacing completed credentials', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  operation.failContact = true;
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('contact failure');
  const before = operation.hashes();
  expect(await executeInitialization(plan, config, operation)).toMatchObject({ created: 0, verified: 6, alert: 'copied' });
  expect(operation.hashes()).toEqual(before); expect(operation.prepares).toBe(1);
});

it('preserves a complete existing set without treating metadata as a decrypted-value verification', async () => {
  const operation = new Operation();
  for (const name of [...credentialNames(config), alertParameterName]) operation.metadata.set(name, meta(name));
  operation.endpointExists = true;
  const plan = await reviewed(operation);
  expect(plan.actions).toEqual({ credentials: 'preserve', alert: 'preserve' });
  expect(await executeInitialization(plan, config, operation)).toMatchObject({ created: 0, verified: 0, preserved: 6 });
  expect(operation.imports + operation.copies + operation.writes).toBe(0);
  expect(existsSync(operation.stage)).toBe(false);
});

it('completed retries consult only destination metadata and never reinitialize a deployed endpoint', async () => {
  const operation = new Operation(); const plan = await reviewed(operation);
  await executeInitialization(plan, config, operation);
  const before = operation.hashes(); const reads = operation.sourceReads;
  operation.endpointExists = true; operation.hosts = ['i-1234567890abcdef0'];
  expect(await executeInitialization(plan, config, operation)).toMatchObject({ status: 'already-complete', created: 0 });
  expect(operation.sourceReads).toBe(reads); expect(operation.prepares).toBe(1); expect(operation.hashes()).toEqual(before);
  operation.metadata.set(credentialNames(config)[0]!, meta(credentialNames(config)[0]!, 2));
  await expect(executeInitialization(plan, config, operation)).rejects.toThrow('parameters have changed');
});

it('stages matching native files privately and rejects permissive staging roots', () => {
  const operation = new Operation();
  stageFreshCredentials(operation.stage);
  expect(credentialParameters(operation.stage)).toHaveLength(6);
  expect(statSync(operation.stage).mode & 0o777).toBe(0o700);
  for (const path of ['server/xray.json', 'server/awg.conf', 'clients/macos/xray.json', 'clients/macos/awg.conf', 'clients/ios/xray.json', 'clients/ios/awg.conf']) {
    expect(statSync(resolve(operation.stage, path)).mode & 0o777).toBe(0o600);
  }
  const publicRoot = resolve(operation.work, 'permissive'); mkdirSync(publicRoot); chmodSync(publicRoot, 0o755);
  expect(() => stageFreshCredentials(publicRoot)).toThrow('must be private');
});

it('publishes the real filesystem receipt with one protected set and refuses to replace it', async () => {
  // The operator's local preparation/cleanup must be testable without sending a single AWS request.
  const operation = new Operation(); const plan = await reviewed(operation);
  const ports = initializationOperator(config, operation.work).execution(plan);
  ports.prepare(plan);
  expect(ports.receipt()).toEqual({ schemaVersion: 1, planDigest: plan.digest, phase: 'prepared' });
  const stage = resolve(operation.work, config.id, plan.digest, 'operation/credentials');
  const fingerprints = () => credentialParameters(stage).map(p => createHash('sha256').update(p.value).digest('hex'));
  const before = fingerprints();
  expect(() => ports.prepare(plan)).toThrow('Unclaimed initialization operation');
  expect(fingerprints()).toEqual(before);
  const resumed = initializationOperator(config, operation.work).execution(plan);
  expect(resumed.receipt()?.planDigest).toBe(plan.digest);
  resumed.complete({ schemaVersion: 1, planDigest: plan.digest, phase: 'complete', parameters: [] });
  resumed.cleanup(); expect(existsSync(stage)).toBe(false);
  expect(resumed.receipt()?.phase).toBe('complete');
});
