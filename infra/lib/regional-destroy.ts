import type { DeploymentConfig } from './config.js';
import type { ReleaseRecord } from './lifecycle.js';

export interface OwnedResource { type: string; logicalId: string; id: string; stackId: string }
export interface OwnedStack { id: string; name: string; resources: OwnedResource[]; outputs: Record<string, string> }
export type DestroyPhase = 'inventory' | 'quiesce' | 'replication' | 'endpoint' | 'support' | 'retained' | 'verify' | 'complete';
export interface DestroyJournal {
  schema: 1; account: string; region: string; target: string; startedAt: string; owner: string;
  phase: DestroyPhase; stacks: OwnedStack[]; endpoint?: ReleaseRecord; volumes: string[];
  formerMembers: string[]; pending: string[]; retained: Array<{ type: string; id: string; retention: string }>;
}

export function captureDetachedEndpoint(config: DeploymentConfig, addresses: any[]): ReleaseRecord | undefined {
  if (!addresses.length) return undefined;
  const prefix = `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/`;
  const owners = new Set<string>();
  for (const address of addresses) {
    // Stack records can expire after deletion; retained EIPs still carry their exact original CloudFormation ownership.
    const tags = Object.fromEntries((address.Tags ?? []).map((t: any) => [t.Key, t.Value]));
    if (typeof tags['aws:cloudformation:stack-id'] !== 'string' || !tags['aws:cloudformation:stack-id'].startsWith(prefix)
      || !['xrayAddress', 'awgAddress'].includes(tags['aws:cloudformation:logical-id'])
      || tags['aws:cloudformation:stack-name'] !== config.stackName
      || Object.entries(config.globalTags).some(([k,v]) => tags[k] !== v)
      || address.AssociationId || address.NetworkInterfaceId || !/^eipalloc-[a-f0-9]+$/.test(address.AllocationId)) {
      throw new Error('Detached endpoint address ownership or attachment is uncertain.');
    }
    owners.add(tags['aws:cloudformation:stack-id']);
  }
  if (owners.size !== 1 || addresses.length > 2 || new Set(addresses.map(a => a.AllocationId)).size !== addresses.length) {
    throw new Error('Multiple retained endpoint generations require ownership review.');
  }
  return { account: config.account, region: config.region, stackId: [...owners][0]!, allocations: addresses.map(a => a.AllocationId) };
}

export function assertExclusiveRegionalHosts(journal: DestroyJournal, instanceIds: string[]): void {
  // Regional repositories/controllers are shared by this app; never retire them under another live Ghostline host.
  const owned = new Set(journal.stacks.flatMap(s => s.resources).filter(r => r.type === 'AWS::EC2::Instance').map(r => r.id));
  if (instanceIds.some(id => !owned.has(id))) throw new Error('Another Ghostline host still uses this region; regional support cannot be destroyed.');
}

export interface DestroyPorts {
  inventory(): Promise<DestroyJournal>;
  save(journal: DestroyJournal): void;
  quiesce(journal: DestroyJournal): Promise<void>;
  retireReplication(journal: DestroyJournal): Promise<string[]>;
  endpoint(journal: DestroyJournal): Promise<void>;
  support(journal: DestroyJournal): Promise<void>;
  retained(journal: DestroyJournal): Promise<void>;
  verify(journal: DestroyJournal): Promise<string[]>;
}
const phases: DestroyPhase[] = ['inventory', 'quiesce', 'replication', 'endpoint', 'support', 'retained', 'verify', 'complete'];
export async function destroyRegion(config: DeploymentConfig, ports: DestroyPorts, saved?: DestroyJournal): Promise<DestroyJournal> {
  let journal = saved ?? await ports.inventory();
  if (journal.schema !== 1 || journal.account !== config.account || journal.region !== config.region || journal.target !== config.id
    || !phases.includes(journal.phase) || journal.stacks.some(s => !s.id.startsWith(`arn:aws:cloudformation:${config.region}:${config.account}:stack/${s.name}/`))) {
    throw new Error('Regional cleanup journal identity mismatch.');
  }
  if (journal.phase === 'complete') {
    // Repeated destroy verifies quietness: inflight replication can recreate a retained repository after an earlier pass.
    journal.pending = await ports.verify(journal);
    if (!journal.pending.length) return journal;
    journal.phase = 'retained'; ports.save(journal);
  }
  const run = async (phase: DestroyPhase, action: () => Promise<void>, next: DestroyPhase) => {
    if (phases.indexOf(journal.phase) > phases.indexOf(phase)) return;
    journal.phase = phase; journal.pending = []; ports.save(journal);
    try { await action(); }
    catch (error) {
      // Adapters expose only fixed, nonsecret operation errors; retain the exact failed step for resumption.
      if (!journal.pending.length) journal.pending = [`${phase}: ${error instanceof Error ? error.message : 'Unknown failure'}`];
      ports.save(journal); throw error;
    }
    journal.phase = next; ports.save(journal);
  };
  // Quiescence and all incoming/outgoing replication cleanup precede any destructive endpoint/support work.
  await run('inventory', async () => {}, 'quiesce');
  await run('quiesce', () => ports.quiesce(journal), 'replication');
  await run('replication', async () => {
    journal.pending = await ports.retireReplication(journal);
    if (journal.pending.length) throw new Error(`Registry retirement incomplete: ${journal.pending.join(', ')}`);
  }, 'endpoint');
  await run('endpoint', () => ports.endpoint(journal), 'support');
  await run('support', () => ports.support(journal), 'retained');
  await run('retained', () => ports.retained(journal), 'verify');
  await run('verify', async () => {
    journal.pending = await ports.verify(journal);
    if (journal.pending.length) {
      // Late replicated repositories require another bounded cleanup pass, not a false success or an endless loop.
      journal.phase = 'retained'; throw new Error(`Cleanup remains pending: ${journal.pending.join(', ')}`);
    }
  }, 'complete');
  return journal;
}
