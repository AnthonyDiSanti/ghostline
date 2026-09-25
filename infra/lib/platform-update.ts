import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DeploymentConfig } from './config.js';
import { withLifecycle } from './lifecycle-operator.js';
import { hostRemote } from './ecs-verification.js';
import { command, operatorGate, root } from './releases/operator.js';
import { readiness } from './releases/gate.js';
import type { ActionObservation, Step } from './releases/stack-reconcile.js';
import { componentMatches } from './releases/stack-action.js';
import { artifacts } from './releases/model.js';

export function selectedOsUpdate(status: any, versions: string[]): string | undefined {
  // Latest respects AWS rollout waves. Apply only an explicitly qualified target; no implicit OS change accompanies image publication.
  if (!status?.most_recent_command || status.most_recent_command.cmd_status !== 'Success') throw new Error('Native update discovery did not succeed.');
  const selected = status.chosen_update?.version;
  if (selected === undefined || status.update_state === 'Idle') return undefined;
  if (typeof selected !== 'string' || !/^\d+\.\d+\.\d+$/.test(selected) || !versions.includes(selected)) throw new Error('Latest native OS candidate needs isolated compatibility qualification first.');
  return selected === status.active_partition?.image?.version ? undefined : selected;
}

export async function updateHostOs(config: DeploymentConfig): Promise<void> {
  await withLifecycle(config, 'os-update', async () => {
    const gate = operatorGate(config.id);
    const lifecycle = await gate.record<{ mode: string }>('lifecycle');
    if (lifecycle?.mode !== 'active') { console.log('Preserved inactive regional power intent; no OS action requested.'); return; }
    const folder = resolve(root, '.local/deployments', config.id, 'os-update');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const path = resolve(folder, 'operation.json');
    const journal = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { requested: [], completed: [] };
    const save = () => writeFileSync(path, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
    const wait = async (predicate: (actual: ActionObservation) => boolean) => {
      for (let n = 0; n < 90; n++) {
        if (await gate.refresh() === 'ready') { const actual = await gate.observe(); if (predicate(actual)) return actual; }
        await new Promise(resolve => setTimeout(resolve, 10_000));
      }
      throw new Error('OS transition is unresolved; resume this command. No requested reboot or apply is repeated.');
    };
    const ready = await readiness(gate.registry);
    if (!ready.ready || !ready.current) throw new Error('Coherent local release required for intentional OS update.');
    if (journal.release && journal.release !== ready.current.digest) throw new Error('Release intent changed during OS update; inspect the recorded operation.');
    journal.release = ready.current.digest;
    if (!journal.before) {
      journal.before = await wait(actual => !!actual.gateway?.stable && !!actual.daemon?.stable && !!actual.bootstrap);
      const before = journal.before as ActionObservation;
      // Refuse to fold an unfinished component promotion into an OS-only action.
      for (const name of artifacts) {
        const observed = name === 'bootstrap' ? before.bootstrap?.digest : name === 'network-daemon' ? before.daemon?.digest : before.gateway?.images[name];
        if (!componentMatches(ready.current.release.images[name], observed, before.resolvedDigests)) throw new Error('Converge component release before OS update.');
      }
      save();
    }
    const host = journal.before.host.id;
    if (await gate.exactHost() !== host) throw new Error('OS update host ownership changed; inspect the recorded operation.');
    const aws = (args: string[]) => JSON.parse(command('aws', ['--profile', process.env.AWS_PROFILE ?? 'personal', '--region', config.region, ...args, '--output', 'json']) || '{}');
    const remote = hostRemote(host, folder, aws);
    if (!journal.checked) {
      const status = JSON.parse(await remote('apiclient update check'));
      journal.target = selectedOsUpdate(status, ready.current.release.os.compatibleVersions);
      journal.checked = true; save();
    }
    if (!journal.target) { renameSync(path, resolve(folder, 'last-operation.json')); console.log('Native OS already current under the latest stable rollout policy.'); return; }
    const effect = async (step: Exclude<Step, 'verify' | 'daemon-ready'>) => {
      if (journal.requested.includes(step)) return;
      // The journal crosses process failures; an uncertain mutation is observed instead of replayed.
      journal.requested.push(step); save(); await gate.request(step, host);
    };
    const phase = async (name: string, run: () => Promise<void>) => {
      // Completed phases never wait for an obsolete state after a later phase has changed it.
      if (journal.completed.includes(name)) return;
      await run(); journal.completed.push(name); save();
    };
    await phase('quiesce', async () => { await effect('quiesce'); await wait(a => a.gateway?.desired === 0 && a.gateway.tasks.length === 0); });
    await phase('drain', async () => { await effect('drain'); await wait(a => a.host?.registration === 'DRAINING' && a.daemon?.tasks.length === 0); });
    await phase('prepare', async () => {
      if (!journal.requested.includes('apply')) {
        journal.requested.push('apply'); save(); await remote('apiclient update apply');
      }
      const status = JSON.parse(await remote('apiclient -u /updates/status'));
      if (status.update_state !== 'Ready' || status.staging_partition?.image?.version !== journal.target) throw new Error('Native updater is not ready for the qualified target; inspect before resuming.');
    });
    await phase('reboot', async () => {
      await effect('reboot');
      await wait(a => a.host?.bootId !== journal.before.host.bootId && a.host?.version === journal.target && a.bootstrap?.bootId === a.host?.bootId);
    });
    await phase('activate', async () => { await effect('activate'); await wait(a => !!a.daemon?.stable); });
    await phase('restore', async () => { await effect('restore'); journal.after = await wait(a => !!a.gateway?.stable && !!a.daemon?.stable); });
    renameSync(path, resolve(folder, 'last-operation.json'));
    console.log(`Verified native OS ${journal.target}; existing endpoint and component release restored.`);
  });
}
