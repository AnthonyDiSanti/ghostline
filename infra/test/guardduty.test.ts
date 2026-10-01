import { afterAll, expect, it, vi } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { type GuardDutyClient } from '@aws-sdk/client-guardduty';
import { hostTemplates } from '../lib/host-slot.js';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { ensureGuardDuty, verifyGuardDuty } from '../lib/guardduty.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const detectorId = '0123456789abcdef0123456789abcdef';
const support = { service: true, runtime: true };
const enabled = { Status: 'ENABLED', Features: [{ Name: 'RUNTIME_MONITORING', Status: 'ENABLED' }] };
const immediate = { attempts: 3, pause: async () => {} };
function api(respond: (name: string, input: any) => any) {
  // Exercise actual SDK command shapes without AWS credentials or network traffic.
  const send = vi.fn(async (command: any) => respond(command.constructor.name, command.input));
  return { send, client: { send } as unknown as GuardDutyClient };
}
function error(name: string) { return Object.assign(new Error(name), { name }); }

it('keeps regional settings outside both active and parked CloudFormation lifecycles', () => {
  for (const lifecycle of ['active', 'parked'] as const) {
    const app = buildApp(config, { service: true, runtime: true }, {}, lifecycle);
    for (const stack of [app.stack]) Template.fromStack(stack).resourceCountIs('AWS::GuardDuty::Detector', 0);
    expect(app.app.synth().stacks).toHaveLength(1);
    const endpoint = Template.fromStack(app.stack).toJSON();
    if (lifecycle === 'active') {
      expect(JSON.parse(hostTemplates(config, true).a).Resources.Instance.Properties.Tags).toContainEqual({ Key: 'GuardDutyManaged', Value: 'true' });
      expect(endpoint.Resources.GuardDutyEndpoint.Properties.Tags).not.toContainEqual({ Key: 'GuardDutyManaged', Value: 'true' });
    } else expect(endpoint.Resources.GuardDutyEndpoint).toBeUndefined();
  }
});

it.each(['ENABLED', 'DISABLED'])(
  'accepts AWS creation defaults with %s agent management and preserves them on repeat', async management => {
  let settings: any;
  const tags = { Project: 'ghostline', System: 'shared' };
  const { client, send } = api((name, input) => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: settings ? [detectorId] : [] };
    if (name === 'CreateDetectorCommand') {
      // Defaults are supplied by AWS, including plans unknown to this SDK and variable enrollment settings.
      expect(input).toEqual({ Enable: true, ClientToken: expect.any(String), Tags: tags,
        Features: [{ Name: 'RUNTIME_MONITORING', Status: 'ENABLED' }] });
      settings = { Status: 'ENABLED', Tags: tags, Features: [
        { Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }, { Name: 'FUTURE_PLAN', Status: 'ENABLED' },
        { Name: 'RUNTIME_MONITORING', Status: 'ENABLED', AdditionalConfiguration: [
          { Name: 'EC2_AGENT_MANAGEMENT', Status: management },
        ] },
      ] };
      return { DetectorId: detectorId };
    }
    if (name === 'GetDetectorCommand') return structuredClone(settings);
    throw new Error(`Unexpected mutation: ${name}`);
  });
  expect(await ensureGuardDuty(client, support, { ...immediate, tags }))
    .toEqual({ detectorId, created: true, updated: false, status: 'RUNTIME_ENABLED' });
  const before = structuredClone(settings);
  expect(await ensureGuardDuty(client, support, immediate)).toEqual({ detectorId, created: false, updated: false, status: 'RUNTIME_ENABLED' });
  expect(settings).toEqual(before);
  expect(send.mock.calls.filter(([command]) => command.constructor.name === 'CreateDetectorCommand')).toHaveLength(1);
});

it.each([
  ['ENABLED', 'ENABLED'], ['ENABLED', 'DISABLED'], ['DISABLED', 'ENABLED'], ['DISABLED', 'DISABLED'],
])('only patches missing requirements for detector %s / runtime %s and preserves shared settings', async (status, runtime) => {
  let settings: any = { Status: status, FindingPublishingFrequency: 'FIFTEEN_MINUTES', Tags: { Project: 'another-owner' },
    Features: [{ Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }, { Name: 'LAMBDA_NETWORK_LOGS', Status: 'DISABLED' },
      { Name: 'FUTURE_PLAN', Status: 'ENABLED' }, { Name: 'RUNTIME_MONITORING', Status: runtime,
        AdditionalConfiguration: [{ Name: 'EC2_AGENT_MANAGEMENT', Status: 'ENABLED' }] }] };
  const before = structuredClone(settings);
  const { client, send } = api((name, input) => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return structuredClone(settings);
    if (name === 'UpdateDetectorCommand') {
      expect(input).toEqual({ DetectorId: detectorId, ...(status === 'DISABLED' ? { Enable: true } : {}),
        ...(runtime === 'DISABLED' ? { Features: [{ Name: 'RUNTIME_MONITORING', Status: 'ENABLED' }] } : {}) });
      if (input.Enable) settings.Status = 'ENABLED';
      if (input.Features) settings.Features[3].Status = 'ENABLED';
      return {};
    }
    throw new Error(`Unexpected operation: ${name}`);
  });
  await ensureGuardDuty(client, support, immediate);
  before.Status = 'ENABLED'; before.Features[3].Status = 'ENABLED';
  expect(settings).toEqual(before);
  expect(send.mock.calls.filter(([command]) => command.constructor.name === 'UpdateDetectorCommand'))
    .toHaveLength(status === 'DISABLED' || runtime === 'DISABLED' ? 1 : 0);
});

it('recovers a concurrent creation with delayed discovery, then enables its missing requirement', async () => {
  let reads = 0;
  let settings: any = { Status: 'ENABLED', Features: [{ Name: 'RUNTIME_MONITORING', Status: 'DISABLED' }] };
  const { client } = api((name, input) => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: ++reads < 3 ? [] : [detectorId] };
    if (name === 'GetDetectorCommand') return structuredClone(settings);
    if (name === 'CreateDetectorCommand') throw error('BadRequestException');
    if (name === 'UpdateDetectorCommand') { settings.Features = input.Features; return {}; }
    throw new Error(name);
  });
  expect(await ensureGuardDuty(client, support, immediate)).toEqual({ detectorId, created: false, updated: true, status: 'RUNTIME_ENABLED' });
});

it.each([false, true])('accepts a rejected runtime request only with live absence evidence (feature present: %s)', async present => {
  const rejected = error('BadRequestException');
  const { client, send } = api((name, input) => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [] };
    if (name === 'CreateDetectorCommand') {
      if (input.Features) throw rejected;
      expect(input.Enable).toBe(true);
      return { DetectorId: detectorId };
    }
    if (name === 'GetDetectorCommand') return { Status: 'ENABLED', Features: [
      { Name: 'S3_DATA_EVENTS', Status: 'ENABLED' },
      ...(present ? [{ Name: 'RUNTIME_MONITORING', Status: 'DISABLED' }] : []),
    ] };
    throw new Error(`Unexpected write: ${name}`);
  });
  const result = ensureGuardDuty(client, support, immediate);
  if (present) await expect(result).rejects.toBe(rejected);
  else await expect(result).resolves.toMatchObject({ status: 'FOUNDATIONAL_ONLY', created: true });
  expect(send.mock.calls.filter(([c]) => c.constructor.name === 'CreateDetectorCommand')).toHaveLength(2);
});

it.each(['AccessDeniedException', 'InternalServerErrorException', 'BadRequestException'])(
  'preserves creation failure %s when there is no concurrent detector', async name => {
    const failure = error(name);
    const { client, send } = api(operation => {
      if (operation === 'ListDetectorsCommand') return { DetectorIds: [] };
      if (operation === 'CreateDetectorCommand') throw failure;
      throw new Error(operation);
    });
    await expect(ensureGuardDuty(client, support, immediate)).rejects.toBe(failure);
    expect(send.mock.calls.filter(([command]) => command.constructor.name === 'ListDetectorsCommand'))
      .toHaveLength(name === 'BadRequestException' ? 4 : 1);
  });

it('waits for enablement propagation without repeated writes', async () => {
  let reads = 0;
  const { client, send } = api(name => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return ++reads < 3 ? { Status: 'DISABLED', Features: [{ Name: 'RUNTIME_MONITORING', Status: 'DISABLED' }] } : enabled;
    if (name === 'UpdateDetectorCommand') return {};
    throw new Error(name);
  });
  await expect(ensureGuardDuty(client, support, immediate)).resolves.toMatchObject({ updated: true });
  expect(send.mock.calls.filter(([command]) => command.constructor.name === 'UpdateDetectorCommand')).toHaveLength(1);
});

it('does not roll back protection when final verification times out', async () => {
  const { client } = api(name => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return { Status: 'DISABLED', Features: [{ Name: 'RUNTIME_MONITORING', Status: 'DISABLED' }] };
    if (name === 'UpdateDetectorCommand') return {};
    throw new Error(`Unexpected operation: ${name}`);
  });
  await expect(ensureGuardDuty(client, support, immediate)).rejects.toThrow('not rolled back');
});

it('preserves legacy EKS monitoring and continues without requiring an implicit migration', async () => {
  const { client } = api(name => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return { Status: 'ENABLED', Features: [{ Name: 'EKS_RUNTIME_MONITORING', Status: 'ENABLED' }] };
    throw new Error(`Unexpected mutation: ${name}`);
  });
  await expect(ensureGuardDuty(client, support, immediate)).resolves.toMatchObject({ status: 'FOUNDATIONAL_ONLY', updated: false });
  await expect(verifyGuardDuty(client, support, 'host', immediate)).resolves.toMatchObject({ status: 'FOUNDATIONAL_ONLY' });
});

it('detects unexpected loss of existing protection without writing it back', async () => {
  let reads = 0;
  const { client } = api(name => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return ++reads === 1
      ? { Status: 'ENABLED', Features: [{ Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }] } : enabled;
    if (name === 'UpdateDetectorCommand') return {};
    throw new Error(name);
  });
  await expect(ensureGuardDuty(client, support, immediate)).rejects.toThrow('Previously enabled GuardDuty feature');
});

it('waits for actual host coverage and never accepts another healthy instance', async () => {
  let polls = 0;
  const coverage = (instance: string) => ({ CoverageStatus: 'HEALTHY',
    ResourceDetails: { Ec2InstanceDetails: { InstanceId: instance, AgentDetails: { Version: 'v1.17.1' } } } });
  const wait = vi.fn(async () => {});
  const { client } = api((name, input) => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: [detectorId] };
    if (name === 'GetDetectorCommand') return enabled;
    expect(name).toBe('ListCoverageCommand');
    expect(input.FilterCriteria).toEqual({ FilterCriterion: [{ CriterionKey: 'INSTANCE_ID', FilterCondition: { Equals: ['our-host'] } }] });
    polls++;
    return { Resources: polls === 1 ? [coverage('other-host')] : polls === 2 ? [] : [coverage('our-host')] };
  });
  expect(await verifyGuardDuty(client, support, 'our-host', { pause: wait, attempts: 3 }))
    .toEqual({ detectorId, instanceId: 'our-host', status: 'HEALTHY', agentVersion: 'v1.17.1' });
  expect(wait).toHaveBeenCalledTimes(2);
});

it('keeps verification read-only and bounded when protection or host telemetry is missing', async () => {
  let exists = false;
  const { client } = api(name => {
    if (name === 'ListDetectorsCommand') return { DetectorIds: exists ? [detectorId] : [] };
    if (name === 'GetDetectorCommand') return enabled;
    if (name === 'ListCoverageCommand') return { Resources: [] };
    throw new Error(`Unexpected mutation: ${name}`);
  });
  await expect(verifyGuardDuty(client, support, 'host', immediate)).rejects.toThrow('must be enabled');
  exists = true;
  await expect(verifyGuardDuty(client, support, 'host', immediate)).rejects.toThrow('did not become HEALTHY');
});
