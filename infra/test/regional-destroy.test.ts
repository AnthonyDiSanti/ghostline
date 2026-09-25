import { expect, it, vi } from 'vitest';
import { assertExclusiveRegionalHosts, captureDetachedEndpoint, destroyRegion, type DestroyJournal, type DestroyPorts } from '../lib/regional-destroy.js';
import { getDeployment } from '../lib/config.js';
const config = { ...getDeployment('stockholm-ecs'), id: 'disposable', region: 'eu-west-1' };
function fixture() {
  let saved: DestroyJournal | undefined;
  const calls: string[] = [];
  const journal: DestroyJournal = { schema: 1, account: config.account, region: config.region, target: config.id,
    owner: 'owner', startedAt: '2026-09-22T00:00:00Z', phase: 'inventory', stacks: [], volumes: [],
    formerMembers: ['us-east-1','eu-west-2','eu-west-1'], pending: [], retained: [] };
  const ports: DestroyPorts = { inventory: async () => journal, save: j => { saved = structuredClone(j); },
    quiesce: async () => { calls.push('quiesce'); }, retireReplication: async () => { calls.push('replication'); return []; },
    endpoint: async () => { calls.push('endpoint'); }, support: async () => { calls.push('support'); },
    retained: async () => { calls.push('retained'); }, verify: async () => { calls.push('verify'); return []; } };
  return { journal, ports, calls, saved: () => saved };
}
it('deletes in lifecycle order even when the endpoint is already absent, and repeats as a no-op', async () => {
  const f = fixture(); const completed = await destroyRegion(config, f.ports);
  expect(f.calls).toEqual(['quiesce', 'replication', 'endpoint', 'support', 'retained', 'verify']);
  expect(completed.phase).toBe('complete');
  await destroyRegion(config, f.ports, completed); expect(f.calls).toHaveLength(7);
});
it('persists unreachable former-source cleanup and refuses destructive phases until retirement finishes', async () => {
  const f = fixture(); const retire = f.ports.retireReplication;
  f.ports.retireReplication = async journal => { expect(journal.formerMembers).toContain('eu-west-1'); return ['us-east-1: unreachable']; };
  await expect(destroyRegion(config, f.ports)).rejects.toThrow('retirement incomplete');
  expect(f.saved()?.pending).toEqual(['us-east-1: unreachable']); expect(f.calls).toEqual(['quiesce']);
  f.ports.retireReplication = retire;
  await destroyRegion(config, f.ports, f.saved());
  expect(f.calls.filter(v => v === 'quiesce')).toHaveLength(1);
});
it('resumes a partially deleted support stack without repeating endpoint destruction', async () => {
  const f = fixture(); let fails = true;
  f.ports.support = async () => { if (fails) throw new Error('partial'); f.calls.push('support'); };
  await expect(destroyRegion(config, f.ports)).rejects.toThrow('partial');
  fails = false; await destroyRegion(config, f.ports, f.saved());
  expect(f.calls.filter(v => v === 'endpoint')).toHaveLength(1);
});
it('rechecks late replicated artifacts and preserves the exact pending cleanup instead of claiming completion', async () => {
  const f = fixture(); let pending = true;
  f.ports.verify = async () => pending ? ['repository: late-image'] : [];
  await expect(destroyRegion(config, f.ports)).rejects.toThrow('pending');
  expect(f.saved()?.phase).toBe('retained'); expect(f.saved()?.pending).toEqual(['repository: late-image']);
  pending = false; await destroyRegion(config, f.ports, f.saved());
  expect(f.calls.filter(v => v === 'retained')).toHaveLength(2);
});
it('rejects foreign journal account/stack identities before running any mutation', async () => {
  const f = fixture(); f.journal.stacks = [{ id: 'arn:aws:cloudformation:eu-west-1:111111111111:stack/foreign/id', name: 'foreign', resources: [], outputs: {} }];
  f.ports.quiesce = vi.fn();
  await expect(destroyRegion(config, f.ports)).rejects.toThrow('identity mismatch');
  expect(f.ports.quiesce).not.toHaveBeenCalled();
});

it('recovers only detached owned addresses when the endpoint stack has already disappeared', () => {
  const stackId = `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/old-id`;
  const addresses = ['xrayAddress','awgAddress'].map((name,i) => ({ AllocationId: `eipalloc-a${i}`, Tags: Object.entries({
    ...config.globalTags, 'aws:cloudformation:stack-id': stackId, 'aws:cloudformation:stack-name': config.stackName,
    'aws:cloudformation:logical-id': name,
  }).map(([Key,Value])=>({Key,Value})) }));
  expect(captureDetachedEndpoint(config,addresses)).toEqual({account:config.account,region:config.region,stackId,allocations:['eipalloc-a0','eipalloc-a1']});
  expect(captureDetachedEndpoint(config,[addresses[0]])?.allocations).toEqual(['eipalloc-a0']);
  expect(() => captureDetachedEndpoint(config,[{...addresses[0],AssociationId:'associated'}])).toThrow('attachment');
  expect(() => captureDetachedEndpoint(config,[{...addresses[0],Tags:[]}])).toThrow('ownership');
  expect(captureDetachedEndpoint(config,[])).toBeUndefined();
});

it('refuses regional support retirement while a separate live host still depends on it', () => {
  const f = fixture(); f.journal.stacks = [{ id:'stack',name:'stack',outputs:{},resources:[{type:'AWS::EC2::Instance',id:'our-host',logicalId:'Instance',stackId:'stack'}] }];
  expect(() => assertExclusiveRegionalHosts(f.journal,['our-host'])).not.toThrow();
  expect(() => assertExclusiveRegionalHosts(f.journal,[])).not.toThrow();
  expect(() => assertExclusiveRegionalHosts(f.journal,['our-host','trial-or-other-gateway'])).toThrow('Another Ghostline host');
});
