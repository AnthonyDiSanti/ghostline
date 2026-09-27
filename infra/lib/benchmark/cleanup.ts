import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DeploymentConfig } from '../config.js';
import { completeLifecycle, type LifecycleStore } from '../releases/lifecycle.js';
import { readJson } from './model.js';

export function cleanupBenchmarkClients(owner: string, folder: string, docker: (args: string[]) => string): void {
  if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid campaign owner.');
  const filter = `label=ghostline.benchmark.owner=${owner}`;
  // Query exact owner labels, never broad test-name prefixes that could belong to another session.
  const containers = docker(['ps', '-aq', '--filter', filter]).split(/\s+/).filter(Boolean);
  if (containers.length) docker(['rm', '-f', '-v', ...containers]);
  const volumes = docker(['volume', 'ls', '-q', '--filter', filter]).split(/\s+/).filter(Boolean);
  if (volumes.length) docker(['volume', 'rm', ...volumes]);
  if (docker(['ps', '-aq', '--filter', filter]).trim() || docker(['volume', 'ls', '-q', '--filter', filter]).trim()) throw new Error('Local client cleanup remains pending.');
  // Interrupted adapters can leave private temporary profile copies only inside this campaign directory.
  if (existsSync(folder)) for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory() && /^clients-[a-zA-Z0-9]+$/.test(entry.name)) rmSync(resolve(folder, entry.name), { recursive: true });
  }
}

export interface BenchmarkReceipt { account: string; region: string; kind: string; owner: string; pid: number; benchmarkOwner?: string }
export async function handoffInterruptedDeployment(config: DeploymentConfig, campaignOwner: string,
  receipt: BenchmarkReceipt, store: LifecycleStore, processAlive: (pid: number) => boolean,
  stackStatus: () => Promise<string | undefined>): Promise<void> {
  // Only the exact dead campaign child can hand its claim to destroy; uncertain cloud transitions stay locked.
  if (!config.id.startsWith('bm-') || receipt.benchmarkOwner !== campaignOwner || receipt.kind !== 'deploy'
    || receipt.account !== config.account || receipt.region !== config.region || !Number.isInteger(receipt.pid) || receipt.pid < 1
    || processAlive(receipt.pid)) throw new Error('Cannot retire an unrelated or running lifecycle operation.');
  const status = await stackStatus();
  if (status?.endsWith('_IN_PROGRESS')) throw new Error('Deployment is still changing resources; resume cleanup after CloudFormation settles.');
  const state = await store.read();
  if (state?.operation) {
    if (state.operation.owner !== receipt.owner || state.operation.kind !== receipt.kind) throw new Error('Regional lifecycle ownership changed.');
    // Destroy intent blocks the release controller in the gap before the normal destroy command acquires its claim.
    await completeLifecycle(store, state, 'destroying');
  } else if (state && state.mode !== 'destroying') {
    throw new Error('Interrupted deployment claim is absent; inspect lifecycle ownership before cleanup.');
  }
}

export async function prepareBenchmarkCleanup(config: DeploymentConfig, owner: string, root: string,
  store: LifecycleStore, stackStatus: () => Promise<string | undefined>) {
  const folder = resolve(root, '.local/deployments', config.id), path = resolve(folder, 'lifecycle-operation.json');
  if (!existsSync(path)) return;
  await handoffInterruptedDeployment(config, owner, readJson(path), store, pid => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  }, stackStatus);
  // Persist the handoff without deleting the ownership evidence, including after an interrupted prior handoff.
  renameSync(path, resolve(folder, 'last-lifecycle-operation.json'));
}
