import { randomUUID } from 'node:crypto';
import {
  CreateDetectorCommand, GetDetectorCommand, ListCoverageCommand, ListDetectorsCommand, UpdateDetectorCommand,
  type GetDetectorCommandOutput, type GuardDutyClient,
} from '@aws-sdk/client-guardduty';
import type { GuardDutySupport } from './guardduty-discovery.js';

type GuardDutyApi = Pick<GuardDutyClient, 'send'>;
type Detector = { id: string; settings: GetDetectorCommandOutput };
type PollOptions = { attempts?: number; pause?: () => Promise<void>; report?: (message: string) => void };
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function detectorId(client: GuardDutyApi): Promise<string | undefined> {
  // The singleton is discovered regionally; applications need no stack ownership or stored detector ID.
  const result = await client.send(new ListDetectorsCommand({}));
  if (result.NextToken || (result.DetectorIds?.length ?? 0) > 1) throw new Error('Unexpected multiple regional GuardDuty detectors.');
  return result.DetectorIds?.[0];
}

function runtimeEnabled(settings: GetDetectorCommandOutput): boolean {
  return settings.Features?.some(feature => feature.Name === 'RUNTIME_MONITORING' && feature.Status === 'ENABLED') ?? false;
}

export async function guardDutyPreflight(client: GuardDutyApi): Promise<Detector | undefined> {
  // Read-only discovery works before infrastructure creation and never assumes application ownership.
  const id = await detectorId(client);
  if (!id) return undefined;
  const settings = await client.send(new GetDetectorCommand({ DetectorId: id }));
  if (!['ENABLED', 'DISABLED'].includes(settings.Status ?? '')) throw new Error('GuardDuty returned an unknown detector status.');
  return { id, settings };
}

function runtimeGap(support: GuardDutySupport, settings?: GetDetectorCommandOutput): string | undefined {
  // Unsupported capabilities and incompatible legacy protection are preserved, never disabled to enable our preference.
  if (!support.runtime) return 'EC2 telemetry is unavailable in the selected region or Availability Zone.';
  if (!settings) return undefined;
  if (!Array.isArray(settings.Features) || !settings.Features.length) {
    throw new Error('Incomplete GuardDuty feature metadata; cannot determine runtime availability.');
  }
  if (!runtimeEnabled(settings) && settings.Features?.some(feature =>
    feature.Name === 'EKS_RUNTIME_MONITORING' && feature.Status === 'ENABLED')) {
    return 'Existing EKS-only monitoring is preserved; EC2 runtime requires a separate migration.';
  }
  if (!settings.Features?.some(feature => feature.Name === 'RUNTIME_MONITORING')) {
    return 'The regional detector does not offer Runtime Monitoring.';
  }
  return undefined;
}

function assertPreservedProtection(before: GetDetectorCommandOutput, after: GetDetectorCommandOutput): void {
  // Detect unexpected service-side loss of protection without replaying a stale configuration over other writers.
  for (const feature of before.Features ?? []) {
    const current = after.Features?.find(value => value.Name === feature.Name);
    if (feature.Status === 'ENABLED' && current?.Status !== 'ENABLED') {
      throw new Error(`Previously enabled GuardDuty feature is no longer enabled: ${feature.Name}.`);
    }
    for (const option of feature.AdditionalConfiguration ?? []) {
      if (option.Status === 'ENABLED' && !current?.AdditionalConfiguration?.some(value =>
        value.Name === option.Name && value.Status === 'ENABLED')) {
        throw new Error(`Previously enabled GuardDuty agent management is no longer enabled: ${option.Name}.`);
      }
    }
  }
}

export async function ensureGuardDuty(client: GuardDutyApi, support: GuardDutySupport,
  options: PollOptions & { tags?: Record<string, string> } = {}) {
  if (!support.service) {
    // Positive catalog evidence permits a region with no GuardDuty; do not call an absent service endpoint.
    return { status: 'UNAVAILABLE' as const, reason: 'GuardDuty is absent from the live AWS regional service catalog.', created: false, updated: false };
  }
  let existing = await guardDutyPreflight(client);
  let created = false;
  let updated = false;
  const attempts = options.attempts ?? 10;
  const wait = options.pause ?? (() => pause(2000));
  if (!existing) {
    try {
      // Accept current AWS defaults; request Runtime Monitoring only where live telemetry discovery supports it.
      const result = await client.send(new CreateDetectorCommand({ Enable: true,
        ...(support.runtime ? { Features: [{ Name: 'RUNTIME_MONITORING' as const, Status: 'ENABLED' as const }] } : {}),
        ClientToken: randomUUID(), Tags: options.tags }));
      if (!result.DetectorId) throw new Error('GuardDuty creation returned no detector ID.');
      existing = { id: result.DetectorId, settings: {} as GetDetectorCommandOutput };
      created = true;
      options.report?.('GuardDuty: created regional protection with AWS defaults.');
    } catch (error) {
      // A concurrent creator can win between discovery and create. Authorization/transport failures still propagate.
      if (!(error instanceof Error) || error.name !== 'BadRequestException') throw error;
      for (let attempt = 0; attempt < attempts; attempt++) {
        existing = await guardDutyPreflight(client);
        if (existing) break;
        if (attempt + 1 < attempts) await wait();
      }
      if (!existing) {
        if (!support.runtime) throw error;
        // A telemetry endpoint can precede feature rollout. Accept a fallback only when live detector metadata
        // confirms the rejected runtime feature is absent; unrelated validation failures must still surface.
        const fallback = await client.send(new CreateDetectorCommand({ Enable: true, ClientToken: randomUUID(), Tags: options.tags }));
        if (!fallback.DetectorId) throw new Error('GuardDuty creation returned no detector ID.');
        const settings = await client.send(new GetDetectorCommand({ DetectorId: fallback.DetectorId }));
        if (!Array.isArray(settings.Features) || !settings.Features.length
          || settings.Features.some(feature => feature.Name === 'RUNTIME_MONITORING')) throw error;
        existing = { id: fallback.DetectorId, settings };
        created = true;
        options.report?.('GuardDuty: created AWS defaults; the regional detector confirms Runtime Monitoring is unavailable.');
      }
    }
  }
  const gap = runtimeGap(support, created ? undefined : existing.settings);
  if (!created && (existing.settings.Status !== 'ENABLED' || (!gap && !runtimeEnabled(existing.settings)))) {
    // Updates only enable missing requirements. Omitted features, enrollment, tags and finding settings stay untouched.
    await client.send(new UpdateDetectorCommand({ DetectorId: existing.id,
      ...(existing.settings.Status !== 'ENABLED' ? { Enable: true } : {}),
      ...(!gap && !runtimeEnabled(existing.settings) ? { Features: [{ Name: 'RUNTIME_MONITORING', Status: 'ENABLED' }] } : {}),
    }));
    updated = true;
    options.report?.('GuardDuty: enabled missing regional protection; unrelated settings preserved.');
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Verify actual state after writes, including preservation of already enabled protection.
    const settings = await client.send(new GetDetectorCommand({ DetectorId: existing.id }));
    const actualGap = runtimeGap(support, settings);
    if (settings.Status === 'ENABLED' && (actualGap || runtimeEnabled(settings))) {
      assertPreservedProtection(existing.settings, settings);
      return { detectorId: existing.id, created, updated,
        ...(actualGap ? { status: 'FOUNDATIONAL_ONLY' as const, reason: actualGap } : { status: 'RUNTIME_ENABLED' as const }) };
    }
    if (attempt + 1 < attempts) await wait();
  }
  throw new Error('Available regional GuardDuty protection did not become enabled; protection was not rolled back.');
}

export async function verifyGuardDuty(client: GuardDutyApi, support: GuardDutySupport, instanceId: string, options: PollOptions = {}) {
  if (!support.service) return { status: 'UNAVAILABLE' as const, instanceId,
    reason: 'GuardDuty is absent from the live AWS regional service catalog.' };
  const detector = await guardDutyPreflight(client);
  if (!detector || detector.settings.Status !== 'ENABLED') {
    throw new Error('Available regional GuardDuty must be enabled. Run ecs deploy first.');
  }
  const gap = runtimeGap(support, detector.settings);
  if (gap) return { status: 'FOUNDATIONAL_ONLY' as const, detectorId: detector.id, instanceId, reason: gap };
  if (!runtimeEnabled(detector.settings)) throw new Error('Available Runtime Monitoring must be enabled. Run ecs deploy first.');
  const wait = options.pause ?? (() => pause(10_000));
  const attempts = options.attempts ?? 60;
  let issue = 'Waiting for initial agent telemetry';
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Filter and recheck exact identity: unrelated healthy coverage must never satisfy this host's gate.
    const coverage = await client.send(new ListCoverageCommand({ DetectorId: detector.id,
      FilterCriteria: { FilterCriterion: [{ CriterionKey: 'INSTANCE_ID', FilterCondition: { Equals: [instanceId] } }] } }));
    const host = coverage.Resources?.find(resource => resource.ResourceDetails?.Ec2InstanceDetails?.InstanceId === instanceId);
    if (host?.CoverageStatus === 'HEALTHY') {
      return { detectorId: detector.id, instanceId, status: 'HEALTHY' as const, agentVersion: host.ResourceDetails?.Ec2InstanceDetails?.AgentDetails?.Version };
    }
    issue = host?.Issue || issue;
    if (attempt % 3 === 0) options.report?.(`GuardDuty: ${issue}.`);
    if (attempt + 1 < attempts) await wait();
  }
  throw new Error(`GuardDuty coverage did not become HEALTHY for ${instanceId}: ${issue}.`);
}
