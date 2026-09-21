export interface PublicationProfile { primaryRegion: string; disasterRecoveryRegion: string; subscribers: string[]; automation: boolean }
export const defaultPublishers = { primaryRegion: 'us-east-1', disasterRecoveryRegion: 'eu-west-2' };

export function publicationProfile(input: Partial<PublicationProfile>, initialSubscribers: string[] = []): PublicationProfile {
  // Persist the resolved defaults at the CLI boundary; synthesis itself never edits the profile.
  if (Object.keys(input).some(k => !['primaryRegion', 'disasterRecoveryRegion', 'subscribers', 'automation'].includes(k))) throw new Error('Unknown imagePublication field.');
  const result = { ...defaultPublishers, subscribers: initialSubscribers, automation: false, ...input };
  if (typeof result.automation !== 'boolean' || !Array.isArray(result.subscribers) || [result.primaryRegion, result.disasterRecoveryRegion, ...result.subscribers]
    .some(r => typeof r !== 'string' || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(r))
    || result.primaryRegion === result.disasterRecoveryRegion || new Set(result.subscribers).size !== result.subscribers.length) throw new Error('Invalid publication regions.');
  return result;
}

export interface ReplicationRule {
  destinations: Array<{ region: string; registryId: string }>;
  repositoryFilters?: Array<{ filter: string; filterType: 'PREFIX_MATCH' }>;
}
export function replicationRules(existing: ReplicationRule[], profile: PublicationProfile, account: string, origin: string, prefix: string): ReplicationRule[] {
  // The registry API replaces the whole document. Remove only our exact filter and retain unrelated rules.
  const publishers = [profile.primaryRegion, profile.disasterRecoveryRegion];
  if (!publishers.includes(origin)) throw new Error('Replication origin is not a configured publisher.');
  const retained = existing.flatMap(rule => {
    const filters = rule.repositoryFilters?.filter(f => f.filter !== prefix);
    return rule.repositoryFilters && !filters?.length ? [] : [{ ...rule, ...(filters ? { repositoryFilters: filters } : {}) }];
  });
  const destinations = [...new Set([...publishers, ...profile.subscribers])].filter(r => r !== origin).sort()
    .map(region => ({ region, registryId: account }));
  const rules = [...retained, { destinations, repositoryFilters: [{ filter: prefix, filterType: 'PREFIX_MATCH' as const }] }];
  if (rules.length > 25 || new Set(rules.flatMap(r => r.destinations.map(d => `${d.registryId}/${d.region}`))).size > 25) throw new Error('ECR replication quota exceeded.');
  return rules;
}
