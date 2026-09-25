import { expect, it } from 'vitest';
import { EcrReplicationCluster, replicationRulesEqual, type ReplicationRule } from '../lib/releases/topology.js';
const account = '000000000000';
const members = ['us-east-1','eu-west-2','eu-north-1'].map(region => ({ account, region }));
it('uses direct full mesh, excludes self and emits no empty rule for a lone member', () => {
  for (const count of [1,2,3]) {
    const cluster = new EcrReplicationCluster(members.slice(0,count), ['ghostline/prod/']);
    for (const member of cluster.members) {
      const rules = cluster.rules([], member);
      expect(rules.length).toBe(count === 1 ? 0 : 1);
      expect(rules.flatMap(r => r.destinations)).toHaveLength(count - 1);
      expect(rules.flatMap(r => r.destinations).some(m => m.region === member.region)).toBe(false);
    }
  }
});
it('reconciles old/new union, clears retired outgoing rules and preserves unrelated filters/destinations', () => {
  const cluster = new EcrReplicationCluster(members.slice(0,2), ['ghostline/prod/']);
  const old: ReplicationRule[] = [{ destinations: [{ registryId: account, region: 'us-west-2' }], repositoryFilters: [
    { filter:'personal-assistant/',filterType:'PREFIX_MATCH' }, {filter:'ghostline/prod/',filterType:'PREFIX_MATCH'} ] }];
  expect(cluster.reconciliationMembers(members)).toHaveLength(3);
  expect(cluster.rules(old, members[2]!)).toEqual([{ ...old[0], repositoryFilters: [old[0]!.repositoryFilters![0]] }]);
  const next = cluster.rules(old, members[0]!);
  expect(next[0]?.destinations).toEqual(old[0]?.destinations);
  expect(next[1]?.destinations).toEqual([{registryId:account,region:'eu-west-2'}]);
  expect(cluster.rules(next,members[0]!)).toEqual(next);
});
it('refuses overlapping foreign filters and unscoped rules that defeat retirement', () => {
  const cluster = new EcrReplicationCluster(members,['ghostline/prod/']);
  for (const filter of [undefined,'ghostline/','ghostline/prod/foreign']) {
    expect(() => cluster.rules([{ destinations:[{registryId:account,region:'us-west-2'}],
      ...(filter ? {repositoryFilters:[{filter,filterType:'PREFIX_MATCH'}]} : {}) }],members[0]!)).toThrow();
  }
});

it('compares actual AWS readbacks independently of key and set ordering', () => {
  const intended = new EcrReplicationCluster(members, ['ghostline/prod/']).rules([], members[0]!);
  const observed = intended.map(r => ({ repositoryFilters: r.repositoryFilters,
    destinations: r.destinations.map(d => ({ region: d.region, registryId: d.registryId })).reverse() }));
  expect(replicationRulesEqual(intended, observed)).toBe(true);
  observed[0]!.destinations.pop();
  expect(replicationRulesEqual(intended, observed)).toBe(false);
});
