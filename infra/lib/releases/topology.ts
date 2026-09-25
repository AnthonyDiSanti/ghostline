export interface PublicationProfile { members: string[]; retainedMembers: string[]; automation: boolean }
export const defaultPublicationRegions = ['us-east-1', 'eu-west-2'];
export function publicationProfile(input: Partial<PublicationProfile>, initialGateways: string[] = []): PublicationProfile {
  // Publication can originate at any member; retained members explicitly protect the owner's permanent publication regions.
  if (Object.keys(input).some(k => !['members', 'retainedMembers', 'automation'].includes(k))) throw new Error('Unknown imagePublication field.');
  const result = { members: [...new Set([...defaultPublicationRegions, ...initialGateways])], retainedMembers: [...defaultPublicationRegions], automation: false, ...input };
  if (typeof result.automation !== 'boolean' || !Array.isArray(result.members) || !Array.isArray(result.retainedMembers)
    || !result.members.length || [...result.members, ...result.retainedMembers].some(r => typeof r !== 'string' || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(r))
    || new Set(result.members).size !== result.members.length || new Set(result.retainedMembers).size !== result.retainedMembers.length
    || result.retainedMembers.some(r => !result.members.includes(r))) throw new Error('Invalid publication membership.');
  return result;
}

export interface ReplicationRule {
  destinations: Array<{ region: string; registryId: string }>;
  repositoryFilters?: Array<{ filter: string; filterType: 'PREFIX_MATCH' }>;
}
export interface RegistryMember { account: string; region: string }
export function replicationRulesEqual(left: ReplicationRule[], right: ReplicationRule[]): boolean {
  // AWS reorders object fields and may reorder rules/sets; compare routing meaning, not serialization.
  const canonical = (rules: ReplicationRule[]) => rules.map(rule => JSON.stringify({
    destinations: rule.destinations.map(d => [d.registryId, d.region]).sort(),
    filters: rule.repositoryFilters?.map(f => [f.filterType, f.filter]).sort() ?? null,
  })).sort();
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
export class EcrReplicationCluster {
  constructor(readonly members: RegistryMember[], readonly prefixes: string[]) {
    // Registry-level rules are shared state. Exact prefix ownership must be unambiguous before any replacement.
    if (!members.length || new Set(members.map(m => `${m.account}/${m.region}`)).size !== members.length
      || members.some(m => !/^\d{12}$/.test(m.account) || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(m.region))
      || !prefixes.length || prefixes.some(p => !/^[a-z0-9][a-z0-9/_-]*\/$/.test(p))
      || new Set(prefixes).size !== prefixes.length || prefixes.some(p => prefixes.some(q => p !== q && p.startsWith(q)))) {
      throw new Error('Invalid or overlapping ECR cluster membership/prefixes.');
    }
  }
  rules(existing: ReplicationRule[], origin: RegistryMember): ReplicationRule[] {
    const retained: ReplicationRule[] = [];
    for (const rule of existing) {
      // A broad/unfiltered foreign rule could keep replicating our images after retirement; require explicit ownership resolution.
      if (!rule.destinations.length || !rule.repositoryFilters?.length) throw new Error('Unscoped registry replication overlaps managed repositories.');
      for (const filter of rule.repositoryFilters) if (!this.prefixes.includes(filter.filter)
        && this.prefixes.some(p => p.startsWith(filter.filter) || filter.filter.startsWith(p))) {
        throw new Error(`Overlapping foreign replication prefix: ${filter.filter}`);
      }
      const filters = rule.repositoryFilters.filter(f => !this.prefixes.includes(f.filter));
      if (filters.length) retained.push({ ...rule, repositoryFilters: filters });
    }
    const enrolled = this.members.some(m => m.account === origin.account && m.region === origin.region);
    const destinations = enrolled ? this.members.filter(m => m.account !== origin.account || m.region !== origin.region)
      .map(m => ({ registryId: m.account, region: m.region })).sort((a,b) => `${a.registryId}/${a.region}`.localeCompare(`${b.registryId}/${b.region}`)) : [];
    const next = destinations.length ? [...retained, { destinations, repositoryFilters: this.prefixes.map(filter => ({ filter, filterType: 'PREFIX_MATCH' as const })) }] : retained;
    if (next.length > 25 || new Set(next.flatMap(r => r.destinations.map(d => `${d.registryId}/${d.region}`))).size > 25) throw new Error('ECR replication quota exceeded.');
    return next;
  }
  reconciliationMembers(previous: RegistryMember[]): RegistryMember[] {
    // Departed origins must clear their outgoing rules too; iterating only new membership leaves live producers behind.
    return [...new Map([...previous, ...this.members].map(m => [`${m.account}/${m.region}`, m])).values()];
  }
}
