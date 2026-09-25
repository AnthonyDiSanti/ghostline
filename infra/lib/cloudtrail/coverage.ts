import {
  DescribeTrailsCommand, GetEventSelectorsCommand, GetTrailStatusCommand,
  type AdvancedFieldSelector, type CloudTrailClient, type GetEventSelectorsCommandOutput,
  type GetTrailStatusCommandOutput, type Trail,
} from '@aws-sdk/client-cloudtrail';

export type TrailClients = (region: string) => Pick<CloudTrailClient, 'send'>;
export type TrailObservation = {
  trail: Trail; observedRegion: string; status?: GetTrailStatusCommandOutput;
  selectors?: GetEventSelectorsCommandOutput; unreadable?: string;
  writes: boolean; fullManagement: boolean; active: boolean; deliveryErrors: string[];
};
const requiredWrites = ['RegisterTaskDefinition', 'UpdateService'];

function matches(field: AdvancedFieldSelector, value: string): boolean {
  // CloudTrail ORs positive operators and ANDs their result with every negative operator.
  const positive = [field.Equals?.includes(value), field.StartsWith?.some(v => value.startsWith(v)), field.EndsWith?.some(v => value.endsWith(v))];
  return (!(field.Equals?.length || field.StartsWith?.length || field.EndsWith?.length) || positive.some(Boolean))
    && !field.NotEquals?.includes(value) && !field.NotStartsWith?.some(v => value.startsWith(v)) && !field.NotEndsWith?.some(v => value.endsWith(v));
}

export function selectorCoverage(selectors: Pick<GetEventSelectorsCommandOutput, 'EventSelectors' | 'AdvancedEventSelectors'>): { writes: boolean; fullManagement: boolean } {
  const basic = selectors.EventSelectors ?? [];
  const advanced = selectors.AdvancedEventSelectors ?? [];
  // A selector narrowed to a particular service/event may cover our alerts, but is not an account audit baseline.
  const basicCovers = (readOnly: boolean, full: boolean) => basic.some(s => s.IncludeManagementEvents === true
    && (s.ReadWriteType === 'All' || s.ReadWriteType === (readOnly ? 'ReadOnly' : 'WriteOnly'))
    && (full ? !s.ExcludeManagementEventSources?.length : !s.ExcludeManagementEventSources?.includes('ecs.amazonaws.com')));
  const advancedCovers = (readOnly: boolean, eventName: string, full: boolean) => advanced.some(s => {
    const fields = s.FieldSelectors;
    if (!fields?.length || !fields.some(f => f.Field === 'eventCategory' && f.Equals?.includes('Management'))) return false;
    const event: Record<string, string> = { eventCategory: 'Management', readOnly: String(readOnly), eventSource: 'ecs.amazonaws.com', eventName };
    return fields.every(f => f.Field && (!full || ['eventCategory', 'readOnly'].includes(f.Field))
      && event[f.Field] !== undefined && matches(f, event[f.Field]!));
  });
  return {
    writes: requiredWrites.every(event => basicCovers(false, false) || advancedCovers(false, event, false)),
    fullManagement: [false, true].every(read => basicCovers(read, true) || advancedCovers(read, '', true)),
  };
}

export async function discoverTrails(clients: TrailClients, region: string): Promise<TrailObservation[]> {
  // Shadow trails include other home regions and organization-owned trails; never infer absence from denial.
  const described = await clients(region).send(new DescribeTrailsCommand({ includeShadowTrails: true }));
  if (!Array.isArray(described.trailList)) throw new Error(`CloudTrail discovery is unreadable in ${region}.`);
  const observations: TrailObservation[] = [];
  for (const trail of described.trailList) {
    if (!trail.TrailARN || !trail.HomeRegion) throw new Error('CloudTrail returned incomplete trail identity.');
    const observation: TrailObservation = { trail, observedRegion: region, writes: false, fullManagement: false, active: false, deliveryErrors: [] };
    try {
      // Read selectors in the home region; status in the target region proves the shadow is actually logging there.
      observation.selectors = await clients(trail.HomeRegion).send(new GetEventSelectorsCommand({ TrailName: trail.TrailARN }));
      if (!observation.selectors.EventSelectors?.length && !observation.selectors.AdvancedEventSelectors?.length) throw new Error('MissingSelectorSettings');
      observation.status = await clients(region).send(new GetTrailStatusCommand({ Name: trail.TrailARN }));
      if (typeof observation.status.IsLogging !== 'boolean') throw new Error('MissingLoggingStatus');
      Object.assign(observation, selectorCoverage(observation.selectors));
      observation.deliveryErrors = [observation.status.LatestDeliveryError, observation.status.LatestCloudWatchLogsDeliveryError,
        observation.status.LatestDigestDeliveryError, observation.status.LatestNotificationError].filter((v): v is string => Boolean(v));
      observation.active = observation.status.IsLogging && observation.deliveryErrors.length === 0;
    } catch (error) {
      observation.unreadable = (error as Error).name + ': ' + (error as Error).message;
    }
    observations.push(observation);
  }
  return observations;
}

export function adequateTrail(observations: TrailObservation[]): TrailObservation | undefined {
  // Prefer a full baseline, but reuse sufficient shared write coverage instead of creating duplicate account copies.
  return observations.filter(o => o.trail.IsMultiRegionTrail && o.active && o.writes && !o.unreadable)
    .sort((a, b) => Number(b.fullManagement && b.trail.IncludeGlobalServiceEvents) - Number(a.fullManagement && a.trail.IncludeGlobalServiceEvents))[0];
}
