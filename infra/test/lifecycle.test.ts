import { afterAll, describe, expect, it, vi } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { deploymentIds, getDeployment } from '../lib/config.js';
import { captureRelease, releaseAfterDeletion } from '../lib/lifecycle.js';
import { launch } from './fixture.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
it.each(deploymentIds)('parks %s with only the same retained, tagged allocations', id => {
  // Stable logical IDs and properties are what make a later active deployment reuse addresses.
  const config = { ...getDeployment(id), account: '000000000000' };
  const active = Template.fromStack(buildApp(launch, config).stack).toJSON();
  const parked = Template.fromStack(buildApp(launch, config, {}, 'parked').stack).toJSON();
  const addresses = Object.fromEntries(Object.entries(active.Resources).filter(([, r]: any) => r.Type === 'AWS::EC2::EIP')
    .map(([key, resource]: any) => { const { DependsOn: _dependency, ...rest } = resource; return [key, rest]; }));
  expect(parked.Resources).toEqual(addresses);
  expect(parked.Outputs).not.toHaveProperty('InstanceId');
  expect(parked.Outputs.EipAllocationId).toEqual(active.Outputs.EipAllocationId);
  for (const address of Object.values(parked.Resources) as any[]) expect(address.DeletionPolicy).toBe('Retain');
});

describe('explicit scoped address release', () => {
  const config = getDeployment('stockholm');
  const stackId = `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/test`;
  const ids = ['eipalloc-aaa', 'eipalloc-bbb'];
  const record = { account: config.account, region: config.region, stackId, allocations: ids };
  function address(id: string) {
    return { AllocationId: id, Tags: Object.entries({ ...config.globalTags, 'aws:cloudformation:stack-id': stackId })
      .map(([Key, Value]) => ({ Key, Value })) };
  }
  function mock(status = 'DELETE_COMPLETE', overrides = {}) {
    let addresses = [address(ids[0]!), { ...address(ids[1]!), ...overrides }, address('eipalloc-ccc')];
    return vi.fn((args: string[]) => {
      if (args[1] === 'describe-stacks') return { Stacks: [{ StackStatus: status }] };
      if (args[1] === 'describe-addresses') return { Addresses: addresses };
      addresses = addresses.filter(a => a.AllocationId !== args[3]);
      return {};
    });
  }
  it('captures exact live stack EIPs and rejects wrong account or incomplete inventory', () => {
    const stack = { StackId: stackId, StackStatus: 'UPDATE_COMPLETE', Outputs: [
      { OutputKey: 'EndpointIp', OutputValue: '203.0.113.1' }, { OutputKey: 'EipAllocationId', OutputValue: ids[0] },
      { OutputKey: 'AwgEndpointIp', OutputValue: '203.0.113.2' }, { OutputKey: 'AwgEipAllocationId', OutputValue: ids[1] },
    ] };
    const resources = ['203.0.113.1', '203.0.113.2'].map(PhysicalResourceId => ({ ResourceType: 'AWS::EC2::EIP', PhysicalResourceId }));
    expect(captureRelease(config, stack, resources)).toEqual(record);
    expect(() => captureRelease({ ...config, account: '000000000000' }, stack, resources)).toThrow('selected account');
    expect(() => captureRelease(config, stack, resources.slice(1))).toThrow('inventory');
    expect(() => captureRelease(config, { ...stack, Outputs: stack.Outputs.slice(1) }, resources)).toThrow('inventory');
  });
  it('releases only recorded allocations after deletion and allows an already-released retry', () => {
    const aws = mock();
    releaseAfterDeletion(config, record, aws);
    releaseAfterDeletion(config, record, aws);
    expect(aws.mock.calls.filter(([args]) => args[1] === 'release-address').map(([args]) => args[3])).toEqual(ids);
  });
  it.each([{ AssociationId: 'eipassoc-active' }, { Tags: [] }])('refuses all releases if any address is reused or foreign', overrides => {
    const aws = mock('DELETE_COMPLETE', overrides);
    expect(() => releaseAfterDeletion(config, record, aws)).toThrow('ownership changed');
    expect(aws.mock.calls.some(([args]) => args[1] === 'release-address')).toBe(false);
  });
  it('refuses release while deletion is incomplete or the record belongs to another region', () => {
    const aws = mock('DELETE_IN_PROGRESS');
    expect(() => releaseAfterDeletion(config, record, aws)).toThrow('deletion must finish');
    expect(() => releaseAfterDeletion(config, { ...record, region: 'af-south-1' }, aws)).toThrow('selected deployment');
    expect(aws.mock.calls.some(([args]) => args[1] === 'release-address')).toBe(false);
  });
});
