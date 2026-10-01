import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';
import type { DeploymentConfig } from './config.js';
import { claimLifecycle, completeLifecycle, DynamoLifecycleStore, failLifecycle, handoffToRelease, type LifecycleMode } from './releases/lifecycle.js';

export function lifecycleStore(config: DeploymentConfig) {
  return new DynamoLifecycleStore(new DynamoDBClient({ region: config.region, credentials: fromIni({ profile: process.env.AWS_PROFILE ?? 'personal' }) }),
    'ghostline-prod-release-attempts');
}
export interface LifecycleControl { handoff(): Promise<void> }
export async function withLifecycle<T>(config: DeploymentConfig, kind: string, run: (control: LifecycleControl) => Promise<T>, completed?: LifecycleMode): Promise<T> {
  const gate = await new LambdaClient({ region: config.region, credentials: fromIni({ profile: process.env.AWS_PROFILE ?? 'personal' }) })
    .send(new GetFunctionConfigurationCommand({ FunctionName: 'ghostline-prod-release-gate' }));
  if (gate.Environment?.Variables?.LIFECYCLE_SCHEMA !== '1') throw new Error('Deploy the coordinated regional release controller before lifecycle mutations.');
  // Persist the token before acquiring ownership so the exact CLI operation can resume after process death.
  const folder = fileURLToPath(new URL(`../../.local/deployments/${config.id}/`, import.meta.url));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = resolve(folder, 'lifecycle-operation.json');
  let receipt = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  if (receipt && (receipt.kind !== kind || receipt.account !== config.account || receipt.region !== config.region)) {
    throw new Error('Another local lifecycle operation is incomplete. Resume it before starting a different mutation.');
  }
  if (receipt?.pid) {
    let live = false;
    try { process.kill(receipt.pid, 0); live = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    if (live) throw new Error('The recorded lifecycle CLI is still running; wait for it rather than resuming concurrently.');
  }
  if (!receipt) {
    receipt = { account: config.account, region: config.region, kind, owner: randomUUID(), pid: process.pid,
      ...(process.env.GHOSTLINE_BENCHMARK_OWNER ? { benchmarkOwner: process.env.GHOSTLINE_BENCHMARK_OWNER } : {}) };
    writeFileSync(path, JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' });
  }
  receipt.pid = process.pid;
  writeFileSync(path, JSON.stringify(receipt) + '\n', { mode: 0o600 });
  const store = lifecycleStore(config);
  const requested = ['stop', 'park', 'destroy'].includes(kind) ? ({ stop: 'stopped', park: 'parked', destroy: 'destroying' } as const)[kind as 'stop' | 'park' | 'destroy'] : undefined;
  const claim = await claimLifecycle(store, kind, receipt.owner, requested);
  if (!claim) {
    // No cloud operation occurred; the receipt can safely retire, while another actor's claim remains untouched.
    renameSync(path, resolve(folder, 'last-lifecycle-operation.json'));
    throw new Error('Regional lifecycle is held by another operation. Inspect release/lifecycle state before retrying.');
  }
  let result: T;
  let delegated = false;
  try { result = await run({ handoff: async () => {
    if (delegated) return;
    await handoffToRelease(store, claim, completed ?? claim.mode); delegated = true;
    // A crash after handoff cannot reclaim the controller's AWS effects through the old CLI token.
    receipt.delegated = true; writeFileSync(path, JSON.stringify(receipt) + '\n', { mode: 0o600 });
  } }); }
  catch (error) {
    if (delegated) renameSync(path, resolve(folder, 'last-lifecycle-operation.json'));
    else await failLifecycle(store, claim, `${kind} interrupted; resume the same command using its local receipt.`);
    throw error;
  }
  if (!delegated) await completeLifecycle(store, claim, completed ?? claim.mode);
  renameSync(path, resolve(folder, 'last-lifecycle-operation.json'));
  return result;
}
