import { createHash, randomUUID } from 'node:crypto';
import { validateDeployment, type DeploymentConfig } from './config.js';
import { serverParameterNamesFor } from './parameters.js';

export const alertParameterName = '/ghostline/prod/alerts/email';
export interface InitSource { id: string; account: string; region: string }
export interface InitParameter {
  name: string; type: 'SecureString'; tier: 'Standard'; version: number; modified: string; tags: Record<string, string>;
}
export interface InitInventory {
  account: string; regionEnabled: boolean; endpointExists: boolean; hosts: string[];
  parameters: InitParameter[]; sourceParameter?: InitParameter;
}
export interface InitializationPlan {
  schemaVersion: 1; id: string; createdAt: string; deployment: DeploymentConfig; alertsFrom?: InitSource;
  inventory: InitInventory; actions: { credentials: 'create' | 'preserve'; alert: 'copy' | 'preserve' }; digest: string;
}
export interface InitReceipt { schemaVersion: 1; planDigest: string; phase: 'prepared' | 'complete'; parameters?: InitParameter[] }
export interface InitExecutionPorts {
  observe(source?: InitSource): Promise<InitInventory>;
  receipt(): InitReceipt | undefined;
  prepare(plan: InitializationPlan): void;
  importCredentials(): Promise<{ created: number; verified: number }>;
  copyAlert(source: InitSource, expected: InitParameter): Promise<void>;
  complete(receipt: InitReceipt): void;
  cleanup(): void;
}

export function credentialNames(config: DeploymentConfig): string[] {
  // The plan discovers names only; native credential validation remains owned by the existing importer.
  const prefix = config.parameterPrefix ?? '/ghostline/prod';
  return [...serverParameterNamesFor(prefix), ...['macos', 'ios'].flatMap(device =>
    ['xray', 'awg'].map(protocol => `${prefix}/clients/${device}/${protocol}`))];
}

function canonical(value: unknown): unknown {
  // Object ordering is irrelevant to reviewed-plan identity; array ordering is explicit and stable.
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function parameters(config: DeploymentConfig, values: InitParameter[], allowed: string[]): InitParameter[] {
  // Refuse uncertain names, types, ownership or versions before any secret retrieval or mutation.
  if (!Array.isArray(values) || new Set(values.map(p => p.name)).size !== values.length) throw new Error('Invalid initialization parameter inventory.');
  for (const p of values) {
    if (!allowed.includes(p.name) || p.type !== 'SecureString' || p.tier !== 'Standard'
      || !Number.isInteger(p.version) || p.version < 1 || !p.modified || !Number.isFinite(Date.parse(p.modified))
      || p.tags?.Project !== config.globalTags.Project || p.tags?.Environment !== config.globalTags.Environment) {
      throw new Error('Initialization parameter identity, type or ownership is uncertain.');
    }
  }
  return [...values].sort((a, b) => a.name.localeCompare(b.name));
}

function inventory(config: DeploymentConfig, value: InitInventory, source?: InitSource): InitInventory {
  // Fresh credentials cannot be introduced under a live or partially retained endpoint.
  if (value.account !== config.account || value.regionEnabled !== true) throw new Error('Initialization account or enabled-region check failed.');
  if (typeof value.endpointExists !== 'boolean' || !Array.isArray(value.hosts)
    || value.hosts.some(id => !/^i-[a-f0-9]+$/.test(id))) throw new Error('Incomplete endpoint/host inventory.');
  if (source && (source.account !== config.account || !/^[a-z][a-z0-9-]*$/.test(source.id)
    || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(source.region))) throw new Error('Alert source must be explicit and in the same account.');
  const result = { ...value, hosts: [...value.hosts].sort(),
    parameters: parameters(config, value.parameters, [...credentialNames(config), alertParameterName]) };
  if (value.sourceParameter) {
    if (!source) throw new Error('Unexpected alert-source metadata.');
    parameters(config, [value.sourceParameter], [alertParameterName]);
  }
  return result;
}

export function planInitialization(config: DeploymentConfig, observed: InitInventory, alertsFrom?: InitSource,
  identity: { id: string; createdAt: string } = { id: randomUUID(), createdAt: new Date().toISOString() }): InitializationPlan {
  // Planning consumes metadata only; key generation and private contact copying occur solely on execute.
  config = validateDeployment(config);
  const state = inventory(config, observed, alertsFrom);
  const names = credentialNames(config);
  const existing = state.parameters.filter(p => names.includes(p.name));
  if (existing.length && existing.length !== names.length) throw new Error('Partial credential set exists; resume its original initialization or review recovery.');
  const credentials = existing.length ? 'preserve' : 'create';
  if (credentials === 'create' && (state.endpointExists || state.hosts.length)) throw new Error('An endpoint or host exists; fresh identity initialization is refused.');
  const alert = state.parameters.some(p => p.name === alertParameterName) ? 'preserve' : 'copy';
  if (alert === 'copy' && (!alertsFrom || !state.sourceParameter)) throw new Error('Missing alert contact; specify an explicit existing alert source.');
  if (!/^[a-f0-9-]{36}$/.test(identity.id) || !Number.isFinite(Date.parse(identity.createdAt))) throw new Error('Invalid initialization plan identity.');
  const body = { schemaVersion: 1 as const, ...identity, deployment: config,
    ...(alertsFrom ? { alertsFrom } : {}), inventory: state, actions: { credentials, alert } as const };
  return { ...body, digest: hash(body) };
}

export function validateInitializationPlan(plan: InitializationPlan, config: DeploymentConfig): void {
  // Rebuild the canonical schema so edited plans and catalog changes cannot silently expand execution scope.
  if (!plan || plan.schemaVersion !== 1 || !same(plan.deployment, config)) throw new Error('Initialization plan target changed.');
  const rebuilt = planInitialization(config, plan.inventory, plan.alertsFrom, { id: plan.id, createdAt: plan.createdAt });
  if (!same(plan, rebuilt)) throw new Error('Initialization plan changed; create and review a fresh plan.');
}

function assertState(plan: InitializationPlan, current: InitInventory, resume: boolean): void {
  // Resume may discover writes from this operation; their values are checked by the conflict-refusing importer.
  if (plan.actions.credentials === 'create' && (current.endpointExists || current.hosts.length)) throw new Error('Endpoint/host state changed after planning.');
  for (const old of plan.inventory.parameters) {
    if (!same(current.parameters.find(p => p.name === old.name), old)) throw new Error('Destination parameter state changed after planning.');
  }
  const unexpected = current.parameters.filter(p => !plan.inventory.parameters.some(old => old.name === p.name));
  if (unexpected.length && !resume) throw new Error('Destination parameters appeared after planning.');
  if (plan.actions.alert === 'copy' && !same(current.sourceParameter, plan.inventory.sourceParameter)) throw new Error('Alert-source state changed after planning.');
}

export async function executeInitialization(plan: InitializationPlan, config: DeploymentConfig, ports: InitExecutionPorts) {
  // Persisted staging binds retries to one generated identity set; no execution path rotates existing credentials.
  validateInitializationPlan(plan, config);
  const receipt = ports.receipt();
  if (receipt && (receipt.schemaVersion !== 1 || receipt.planDigest !== plan.digest
    || !['prepared', 'complete'].includes(receipt.phase))) throw new Error('Initialization operation receipt is invalid.');
  const current = inventory(config, await ports.observe(receipt?.phase === 'complete' ? undefined : plan.alertsFrom),
    receipt?.phase === 'complete' ? undefined : plan.alertsFrom);
  if (receipt?.phase === 'complete') {
    if (!same(current.parameters, receipt.parameters)) throw new Error('Completed initialization parameters have changed; no credentials replaced.');
    ports.cleanup();
    return { status: 'already-complete', created: 0, verified: 0, preserved: credentialNames(config).length, alert: 'preserved' };
  }
  assertState(plan, current, !!receipt);
  if (!receipt) ports.prepare(plan);
  const result = plan.actions.credentials === 'create' ? await ports.importCredentials()
    : { created: 0, verified: 0, preserved: credentialNames(config).length };
  if (plan.actions.alert === 'copy') await ports.copyAlert(plan.alertsFrom!, plan.inventory.sourceParameter!);
  const final = inventory(config, await ports.observe());
  // Recheck preserved identities and complete names before retiring private staging material.
  for (const old of plan.inventory.parameters) {
    if (!same(final.parameters.find(p => p.name === old.name), old)) throw new Error('Preserved parameter changed during initialization.');
  }
  if (final.parameters.length !== credentialNames(config).length + 1) throw new Error('Initialization did not establish the complete parameter set.');
  ports.complete({ schemaVersion: 1, planDigest: plan.digest, phase: 'complete', parameters: final.parameters });
  ports.cleanup();
  return { status: 'complete', ...result, alert: plan.actions.alert === 'copy' ? 'copied' : 'preserved' };
}
