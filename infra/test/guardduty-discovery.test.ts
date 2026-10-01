import { afterAll, expect, it, vi } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import type { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { discoverGuardDuty, guardDutyForDeployment } from '../lib/guardduty-discovery.js';
import { ensureGuardDuty, verifyGuardDuty } from '../lib/guardduty.js';
import { hostTemplates } from '../lib/host-slot.js';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000' };
const path = '/aws/service/global-infrastructure/services/guardduty/regions';
const catalog = (regions = [config.region]) => ({ Parameters: regions.map(Value => ({ Name: `${path}/${Value}`, Value })) });
const endpoint = { ServiceDetails: [{ ServiceName: `com.amazonaws.${config.region}.guardduty-data`, Owner: 'amazon',
  ServiceType: [{ ServiceType: 'Interface' }], AvailabilityZones: [config.availabilityZone] }] };
const immediate = { attempts: 2, pause: async () => {} };

it('discovers current service and selected-AZ telemetry availability on every call', () => {
  let available = true;
  const aws = vi.fn((args, region) => {
    if (args[0] === 'ssm') {
      expect(region).toBe('eu-central-1');
      expect(args).toEqual(['ssm', 'get-parameters-by-path', '--path', path]);
      return catalog();
    }
    expect(region).toBe(config.region);
    expect(args).toEqual(['ec2', 'describe-vpc-endpoint-services', '--filters',
      `Name=service-name,Values=com.amazonaws.${config.region}.guardduty-data`]);
    return available ? endpoint : { ServiceDetails: [] };
  });
  expect(discoverGuardDuty(config, aws)).toEqual({ service: true, runtime: true });
  available = false;
  expect(discoverGuardDuty(config, aws)).toEqual({ service: true, runtime: false });
  expect(aws).toHaveBeenCalledTimes(4);
  expect(discoverGuardDuty({ ...config, availabilityZone: `${config.region}b` }, args => args[0] === 'ssm' ? catalog() : endpoint))
    .toEqual({ service: true, runtime: false });
});

it('supports the complete no-service path without GuardDuty calls or agent infrastructure', async () => {
  // This simulates a real AWS catalog omission; it never turns off monitoring in an existing region.
  const aws = vi.fn(() => catalog(['eu-west-1']));
  const support = discoverGuardDuty(config, aws);
  expect(support).toEqual({ service: false, runtime: false });
  expect(aws).toHaveBeenCalledTimes(1);
  const send = vi.fn(() => { throw new Error('No absent-service call is allowed'); });
  const client = { send } as unknown as GuardDutyClient;
  expect(await ensureGuardDuty(client, support)).toMatchObject({ status: 'UNAVAILABLE', created: false, updated: false });
  expect(await verifyGuardDuty(client, support, 'host')).toMatchObject({ status: 'UNAVAILABLE' });
  expect(send).not.toHaveBeenCalled();
  const resources = Template.fromStack(buildApp(config, support).stack).toJSON().Resources;
  const slot = JSON.parse(hostTemplates(config, false).a).Resources;
  expect(slot.Instance.Type).toBe('AWS::EC2::Instance');
  expect(resources.GatewayTask.Properties.ContainerDefinitions).toHaveLength(3);
  expect(resources.GuardDutyEndpoint).toBeUndefined();
  expect(resources.GuardDutySecurityGroup).toBeUndefined();
  expect(slot.Instance.Properties.Tags).not.toContainEqual({ Key: 'GuardDutyManaged', Value: 'true' });
  const policies = Object.values(resources).filter((r: any) => r.Type === 'AWS::IAM::Policy');
  expect(JSON.stringify(policies)).not.toMatch(/ssm:GetManifest|ssm:DescribeDocument|ssm:GetDocument/);
});

it('creates available foundational protection without unsupported runtime or coverage requests', async () => {
  const support = discoverGuardDuty(config, args => args[0] === 'ssm' ? catalog() : { ServiceDetails: [] });
  let created = false;
  const send = vi.fn(async (command: any) => {
    if (command.constructor.name === 'ListDetectorsCommand') return { DetectorIds: created ? ['detector'] : [] };
    if (command.constructor.name === 'CreateDetectorCommand') {
      expect(command.input).toEqual({ Enable: true, ClientToken: expect.any(String), Tags: undefined });
      created = true; return { DetectorId: 'detector' };
    }
    if (command.constructor.name === 'GetDetectorCommand') return { Status: 'ENABLED', Features: [
      { Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }, { Name: 'FUTURE_PLAN', Status: 'ENABLED' }] };
    throw new Error(`Unexpected runtime or mutation call: ${command.constructor.name}`);
  });
  const client = { send } as unknown as GuardDutyClient;
  expect(await ensureGuardDuty(client, support, immediate)).toMatchObject({ status: 'FOUNDATIONAL_ONLY', created: true });
  expect(await ensureGuardDuty(client, support, immediate)).toMatchObject({ status: 'FOUNDATIONAL_ONLY', created: false, updated: false });
  expect(await verifyGuardDuty(client, support, 'host', immediate)).toMatchObject({ status: 'FOUNDATIONAL_ONLY' });
  expect(Template.fromStack(buildApp(config, support).stack).toJSON().Resources.GuardDutyEndpoint).toBeUndefined();
});

it('tolerates a runtime feature absent from the live detector even when transport is advertised', async () => {
  const client = { send: vi.fn(async (command: any) => {
    if (command.constructor.name === 'ListDetectorsCommand') return { DetectorIds: ['detector'] };
    if (command.constructor.name === 'GetDetectorCommand') return { Status: 'ENABLED', Features: [{ Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }] };
    throw new Error('Absent runtime must not trigger an update or coverage request');
  }) } as unknown as GuardDutyClient;
  const support = { service: true, runtime: true };
  expect(await ensureGuardDuty(client, support, immediate)).toMatchObject({ status: 'FOUNDATIONAL_ONLY', updated: false });
  expect(await verifyGuardDuty(client, support, 'host', immediate)).toMatchObject({ status: 'FOUNDATIONAL_ONLY' });
});

it.each(['AccessDeniedException', 'ENOTFOUND', 'TimeoutError', 'ThrottlingException'])(
  'does not misclassify %s as a regional capability gap', name => {
    const failure = Object.assign(new Error('discovery failed'), { name });
    expect(() => discoverGuardDuty(config, () => { throw failure; })).toThrow(failure);
    expect(() => discoverGuardDuty(config, args => { if (args[0] === 'ssm') return catalog(); throw failure; })).toThrow(failure);
  });

it.each([{}, { Parameters: [] }, { ...catalog(), NextToken: 'more' }, { Parameters: [{ Name: 'wrong', Value: config.region }] }])(
  'rejects incomplete or malformed catalog evidence %#', response => {
    expect(() => discoverGuardDuty(config, () => response)).toThrow('Incomplete GuardDuty service catalog');
  });

it('rejects incomplete telemetry discovery instead of removing monitoring', () => {
  expect(() => discoverGuardDuty(config, args => args[0] === 'ssm' ? catalog() : {})).toThrow('Incomplete GuardDuty telemetry');
  expect(() => discoverGuardDuty(config, args => args[0] === 'ssm' ? catalog() : { ...endpoint, NextToken: 'more' }))
    .toThrow('Incomplete GuardDuty telemetry');
});

it('refuses to remove an existing telemetry endpoint on contradictory discovery', () => {
  let installed = true;
  const aws = (args: string[]) => {
    if (args[0] === 'ssm') return catalog(['eu-west-1']);
    if (args[1] === 'list-stacks') return { StackSummaries: [{ StackName: config.stackName, StackId: 'stack', StackStatus: 'CREATE_COMPLETE' }] };
    return { StackResourceSummaries: installed ? [{ LogicalResourceId: 'GuardDutyEndpoint', ResourceStatus: 'CREATE_COMPLETE' }] : [] };
  };
  expect(() => guardDutyForDeployment(config, aws)).toThrow('refusing to remove');
  installed = false;
  expect(guardDutyForDeployment(config, aws)).toEqual({ service: false, runtime: false });
});

it.each([undefined, []])('rejects incomplete detector feature evidence instead of accepting reduced protection (%s)', async Features => {
  const client = { send: vi.fn(async (command: any) => command.constructor.name === 'ListDetectorsCommand'
    ? { DetectorIds: ['detector'] } : { Status: 'ENABLED', Features }) } as unknown as GuardDutyClient;
  const support = { service: true, runtime: true };
  await expect(ensureGuardDuty(client, support, immediate)).rejects.toThrow('Incomplete GuardDuty feature metadata');
  await expect(verifyGuardDuty(client, support, 'host', immediate)).rejects.toThrow('Incomplete GuardDuty feature metadata');
});
