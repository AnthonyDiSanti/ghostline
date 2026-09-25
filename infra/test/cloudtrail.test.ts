import { expect, it, vi } from 'vitest';
import type { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import type { S3Client } from '@aws-sdk/client-s3';
import { adequateTrail, discoverTrails, selectorCoverage } from '../lib/cloudtrail/coverage.js';
import { baselineBucketPolicy, baselineIdentity, ensureCloudTrail } from '../lib/cloudtrail/baseline.js';

const options = { account: '000000000000', region: 'eu-north-1', attempts: 3, pause: async () => {} };
const id = baselineIdentity(options);
const marker = { Key: 'AccountSecurityBaseline', Value: 'cloudtrail-v1' };
const trail = { TrailARN: id.arn, Name: id.name, HomeRegion: id.homeRegion, S3BucketName: id.bucket,
  IsMultiRegionTrail: true, IncludeGlobalServiceEvents: true, LogFileValidationEnabled: true };
const all = { EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'All' as const }] };
const error = (name: string) => Object.assign(new Error(name), { name });
function harness(overrides: { trails?: any[]; status?: any; selectors?: any; respond?: (operation: string, input: any, region: string) => any } = {}) {
  // Stateful external boundaries exercise retries and command shapes, not a copied implementation of the helper.
  let trails = overrides.trails ?? [];
  let status = overrides.status ?? { IsLogging: true };
  let bucket = false;
  let tags: any[] = [];
  const settings = new Map<string, any>();
  const responses: Record<string, string> = { PublicAccessBlock: 'PublicAccessBlockConfiguration', BucketEncryption: 'ServerSideEncryptionConfiguration',
    BucketOwnershipControls: 'OwnershipControls', BucketLifecycleConfiguration: 'LifecycleConfiguration', BucketPolicy: 'Policy' };
  const absent: Record<string, string> = { PublicAccessBlock: 'NoSuchPublicAccessBlockConfiguration', BucketEncryption: 'ServerSideEncryptionConfigurationNotFoundError',
    BucketOwnershipControls: 'OwnershipControlsNotFoundError', BucketLifecycleConfiguration: 'NoSuchLifecycleConfiguration', BucketPolicy: 'NoSuchBucketPolicy' };
  const send = vi.fn(async (region: string, command: any) => {
    const name = command.constructor.name; const input = command.input;
    const override = overrides.respond?.(name, input, region);
    if (override !== undefined) return override;
    if (name === 'DescribeTrailsCommand') { expect(input.includeShadowTrails).toBe(true); return { trailList: structuredClone(trails) }; }
    if (name === 'GetEventSelectorsCommand') { expect(region).toBe(id.homeRegion); return overrides.selectors ?? all; }
    if (name === 'GetTrailStatusCommand') return status;
    if (name === 'ListTagsCommand') return { ResourceTagList: [{ ResourceId: id.arn, TagsList: [marker] }] };
    if (name === 'CreateTrailCommand') { trails = [trail]; status = { IsLogging: false }; return trail; }
    if (name === 'StartLoggingCommand') { status = { IsLogging: true }; return {}; }
    if (name === 'HeadBucketCommand') { if (!bucket) throw error('NotFound'); return {}; }
    if (name === 'CreateBucketCommand') { bucket = true; return {}; }
    if (name === 'GetBucketTaggingCommand') { if (!tags.length) throw error('NoSuchTagSet'); return { TagSet: tags }; }
    if (name === 'PutBucketTaggingCommand') { tags = input.Tagging.TagSet; return {}; }
    const part = name.replace(/^(Get|Put)/, '').replace(/Command$/, '');
    if (name.startsWith('Get') && responses[part]) {
      if (!settings.has(part)) throw error(absent[part]!);
      if (part === 'BucketLifecycleConfiguration') return settings.get(part);
      return { [responses[part]]: settings.get(part) };
    }
    if (name.startsWith('Put') && responses[part]) { settings.set(part, input[responses[part]]); return {}; }
    throw new Error(`Unexpected command: ${name}`);
  });
  return { send, clients: (region: string) => ({ send: (command: any) => send(region, command) } as unknown as CloudTrailClient),
    s3: { send: (command: any) => send(id.homeRegion, command) } as unknown as S3Client, settings,
    calls: () => send.mock.calls.map(([region, c]) => ({ region, name: c.constructor.name, input: c.input })) };
}

it('classifies narrowed and full selectors without confusing required ECS writes with an account baseline', () => {
  expect(selectorCoverage(all)).toEqual({ writes: true, fullManagement: true });
  expect(selectorCoverage({ EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'WriteOnly' }] })).toEqual({ writes: true, fullManagement: false });
  expect(selectorCoverage({ EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'All', ExcludeManagementEventSources: ['kms.amazonaws.com'] }] })).toEqual({ writes: true, fullManagement: false });
  const fields = [{ Field: 'eventCategory', Equals: ['Management'] }, { Field: 'readOnly', Equals: ['false'] }, { Field: 'eventSource', Equals: ['ecs.amazonaws.com'] }];
  expect(selectorCoverage({ AdvancedEventSelectors: [{ FieldSelectors: fields }] })).toEqual({ writes: true, fullManagement: false });
  expect(selectorCoverage({ AdvancedEventSelectors: [{ FieldSelectors: [...fields, { Field: 'eventName', NotEquals: ['UpdateService'] }] }] }).writes).toBe(false);
  expect(selectorCoverage({ AdvancedEventSelectors: [{ FieldSelectors: [{ Field: 'eventCategory', Equals: ['Management'] }] }] }).fullManagement).toBe(true);
  expect(selectorCoverage({ AdvancedEventSelectors: [{ FieldSelectors: [...fields, { Field: 'userIdentity.arn', StartsWith: ['arn:aws:iam'] }] }] }).writes).toBe(false);
});
it.each([false, true])('reuses active external/organization shadow trails without mutations (organization=%s)', async organization => {
  const h = harness({ trails: [{ ...trail, IsOrganizationTrail: organization, S3BucketName: 'external-audit' }] });
  expect(await ensureCloudTrail(h.clients, h.s3, options)).toMatchObject({ created: false, fullBaseline: true });
  expect(h.calls().every(c => c.name.startsWith('Get') || c.name === 'DescribeTrailsCommand')).toBe(true);
  expect(h.calls().find(c => c.name === 'GetTrailStatusCommand')?.region).toBe(options.region);
});
it('reports partial shared coverage without changing the external control or creating duplicate trails', async () => {
  const h = harness({ trails: [trail], selectors: { EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'WriteOnly' }] } });
  const report = vi.fn();
  expect(await ensureCloudTrail(h.clients, h.s3, { ...options, report })).toMatchObject({ fullBaseline: false });
  expect(report).toHaveBeenCalledWith(expect.stringContaining('full read/write'));
  expect(h.calls().some(c => c.name.startsWith('Create'))).toBe(false);
});
it.each(['GetEventSelectorsCommand', 'GetTrailStatusCommand'])('does not treat denied %s as absence', async operation => {
  const h = harness({ trails: [trail], respond: name => { if (name === operation) throw error('AccessDeniedException'); } });
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('unknown');
  expect(h.calls().some(c => /^(Put|Create|Start)/.test(c.name))).toBe(false);
});
it('keeps delivery errors and single-region trails out of adequate shared coverage', async () => {
  const h = harness({ trails: [trail], status: { IsLogging: true, LatestDeliveryError: 'bucket denied' } });
  expect(adequateTrail(await discoverTrails(h.clients, options.region))).toBeUndefined();
  const local = harness({ trails: [{ ...trail, IsMultiRegionTrail: false }] });
  expect(adequateTrail(await discoverTrails(local.clients, options.region))).toBeUndefined();
});
it('creates one deterministic private baseline, starts it separately and is read-only on repetition', async () => {
  const h = harness(); const receipt = vi.fn();
  expect(await ensureCloudTrail(h.clients, h.s3, { ...options, recordBucketCreation: receipt })).toMatchObject({ created: true, fullBaseline: true });
  expect(receipt).toHaveBeenCalledWith(id.bucket);
  const before = h.calls().length;
  await ensureCloudTrail(h.clients, h.s3, options);
  expect(h.calls().slice(before).some(c => /^(Put|Create|Start)/.test(c.name))).toBe(false);
  expect(h.calls().filter(c => c.name === 'CreateTrailCommand')).toEqual([{ region: id.homeRegion, name: 'CreateTrailCommand', input: {
    Name: id.name, S3BucketName: id.bucket, IsMultiRegionTrail: true, IncludeGlobalServiceEvents: true, EnableLogFileValidation: true,
    TagsList: [marker, { Key: 'System', Value: 'security' }],
  } }]);
  expect(h.calls().findIndex(c => c.name === 'CreateTrailCommand')).toBeLessThan(h.calls().findIndex(c => c.name === 'StartLoggingCommand'));
  expect(h.settings.get('BucketLifecycleConfiguration').Rules[0].Expiration.Days).toBe(7);
  const policy = baselineBucketPolicy(id);
  expect(policy.Statement[2]).toMatchObject({ Resource: `arn:aws:s3:::${id.bucket}/AWSLogs/${id.account}/*`, Condition: {
    StringEquals: { 'aws:SourceArn': id.arn, 'aws:SourceAccount': options.account, 's3:x-amz-acl': 'bucket-owner-full-control' } } });
});
it('resumes after an interrupted StartLogging without creating another trail', async () => {
  let fail = true;
  const h = harness({ respond: name => { if (name === 'StartLoggingCommand' && fail) throw error('Interrupted'); } });
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('Interrupted');
  fail = false;
  expect(await ensureCloudTrail(h.clients, h.s3, options)).toMatchObject({ created: false, fullBaseline: true });
  expect(h.calls().filter(c => c.name === 'CreateTrailCommand')).toHaveLength(1);
});
it('accepts AWS default SSE-S3 with blocked SSE-C without rewriting encryption', async () => {
  // New buckets now include this security setting even before any encryption API write.
  const h = harness({ respond: name => name === 'GetBucketEncryptionCommand' ? {
    ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
      BucketKeyEnabled: false, BlockedEncryptionTypes: { EncryptionType: ['SSE-C'] } }] },
  } : undefined });
  expect(await ensureCloudTrail(h.clients, h.s3, options)).toMatchObject({ fullBaseline: true });
  expect(h.calls().some(c => c.name === 'PutBucketEncryptionCommand')).toBe(false);
});
it('converges after concurrent first creation without overwriting ownership or selectors', async () => {
  let concurrent = false;
  const h = harness({ respond: name => {
    if (name === 'CreateTrailCommand') { concurrent = true; throw error('TrailAlreadyExistsException'); }
    if (name === 'DescribeTrailsCommand' && concurrent) return { trailList: [trail] };
    if (name === 'GetTrailStatusCommand') return { IsLogging: true };
    return undefined;
  } });
  expect(await ensureCloudTrail(h.clients, h.s3, options)).toMatchObject({ created: false });
  expect(h.calls().some(c => /^(Start|Update|Stop|Delete)/.test(c.name))).toBe(false);
});
it('requires explicit ownership before resuming a stopped fixed-name trail', async () => {
  const h = harness({ trails: [trail], status: { IsLogging: false }, respond: name => {
    if (name === 'ListTagsCommand') return { ResourceTagList: [{ TagsList: [{ Key: 'aws:cloudformation:stack-name', Value: 'another-app' }] }] };
    return undefined;
  } });
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('ownership');
  expect(h.calls().some(c => /^(Start|Put|Create)/.test(c.name))).toBe(false);
});
it('bounds missing-shadow retries without disabling existing protection', async () => {
  const h = harness({ respond: (name, _input, region) => {
    if (name === 'DescribeTrailsCommand') return { trailList: region === id.homeRegion ? [trail] : [] };
    return undefined;
  } });
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('pending');
  expect(h.calls().some(c => /^(Stop|Delete|Create|Put)/.test(c.name))).toBe(false);
  expect(h.calls().filter(c => c.name === 'DescribeTrailsCommand')).toHaveLength(5);
});
it('does not change a deliberately adjusted retention policy while repairing a stopped baseline', async () => {
  let fail = true;
  const h = harness({ respond: name => { if (name === 'StartLoggingCommand' && fail) throw error('Interrupted'); } });
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('Interrupted');
  h.settings.get('BucketLifecycleConfiguration').Rules[0].Expiration.Days = 30; fail = false;
  await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow('review ownership/retention');
  expect(h.settings.get('BucketLifecycleConfiguration').Rules[0].Expiration.Days).toBe(30);
});

it('refuses an unmarked existing bucket and preserves denied S3 reads as errors', async () => {
  for (const denied of [false, true]) {
    const h = harness({ respond: name => {
      if (name === 'HeadBucketCommand') { if (denied) throw error('AccessDenied'); return {}; }
      return undefined;
    } });
    await expect(ensureCloudTrail(h.clients, h.s3, options)).rejects.toThrow(denied ? 'AccessDenied' : 'Refusing to adopt');
    expect(h.calls().some(c => /^(Put|Create|Start)/.test(c.name))).toBe(false);
  }
});
it('resumes interrupted bucket configuration with an exact successful-creation receipt', async () => {
  let interrupted = true;
  const h = harness({ respond: name => { if (name === 'PutBucketTaggingCommand' && interrupted) throw error('Interrupted'); } });
  const record = vi.fn();
  await expect(ensureCloudTrail(h.clients,h.s3,{...options,recordBucketCreation:record})).rejects.toThrow('Interrupted');
  expect(record).toHaveBeenCalledWith(id.bucket); interrupted = false;
  expect(await ensureCloudTrail(h.clients,h.s3,{...options,createdBucket:id.bucket})).toMatchObject({fullBaseline:true});
});
