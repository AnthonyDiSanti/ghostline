import {
  CreateTrailCommand, ListTagsCommand, StartLoggingCommand,
} from '@aws-sdk/client-cloudtrail';
import {
  CreateBucketCommand, GetBucketTaggingCommand, PutBucketTaggingCommand, HeadBucketCommand,
  GetBucketPolicyCommand, PutBucketPolicyCommand, GetPublicAccessBlockCommand, PutPublicAccessBlockCommand,
  GetBucketEncryptionCommand, PutBucketEncryptionCommand, GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand,
  GetBucketOwnershipControlsCommand, PutBucketOwnershipControlsCommand, type S3Client, type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { adequateTrail, discoverTrails, type TrailClients, type TrailObservation } from './coverage.js';

export const baselineDefaults = { homeRegion: 'us-east-1', trailName: 'account-management-audit', retentionDays: 7 } as const;
const marker = { Key: 'AccountSecurityBaseline', Value: 'cloudtrail-v1' };
type Options = { account: string; region: string; homeRegion?: string; trailName?: string; retentionDays?: number;
  attempts?: number; pause?: () => Promise<void>; report?: (message: string) => void;
  // The operator durably records a successful CreateBucket before configuring it; only that exact claim can resume an untagged bucket.
  createdBucket?: string; recordBucketCreation?: (bucket: string) => void };
export type BaselineIdentity = { account: string; homeRegion: string; name: string; arn: string; bucket: string; retentionDays: number };
export function baselineIdentity(options: Options): BaselineIdentity {
  const homeRegion = options.homeRegion ?? baselineDefaults.homeRegion;
  const name = options.trailName ?? baselineDefaults.trailName;
  const retentionDays = options.retentionDays ?? baselineDefaults.retentionDays;
  if (!/^\d{12}$/.test(options.account) || !/^[a-z]{2}-[a-z]+-\d$/.test(homeRegion)
    || !/^[a-z][a-z0-9-]{2,40}$/.test(name) || !Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('Invalid account CloudTrail baseline settings.');
  return { account: options.account, homeRegion, name, arn: `arn:aws:cloudtrail:${homeRegion}:${options.account}:trail/${name}`,
    bucket: `${name}-${options.account}-${homeRegion}`, retentionDays };
}
export function baselineBucketPolicy(id: BaselineIdentity) {
  const resource = `arn:aws:s3:::${id.bucket}`;
  const source = { 'aws:SourceArn': id.arn, 'aws:SourceAccount': id.account };
  return { Version: '2012-10-17', Statement: [
    { Sid: 'TlsOnly', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [resource, `${resource}/*`], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
    { Sid: 'CloudTrailAcl', Effect: 'Allow', Principal: { Service: 'cloudtrail.amazonaws.com' }, Action: 's3:GetBucketAcl', Resource: resource, Condition: { StringEquals: source } },
    { Sid: 'CloudTrailWrite', Effect: 'Allow', Principal: { Service: 'cloudtrail.amazonaws.com' }, Action: 's3:PutObject', Resource: `${resource}/AWSLogs/${id.account}/*`,
      Condition: { StringEquals: { ...source, 's3:x-amz-acl': 'bucket-owner-full-control' } } },
  ] };
}
const named = (error: unknown, names: string[]) => error instanceof Error && names.includes(error.name);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value: unknown): unknown {
  // AWS JSON key order is irrelevant; preserve array order so policy changes remain explicit for review.
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

async function ensureBucket(s3: Pick<S3Client, 'send'>, id: BaselineIdentity, options: Options): Promise<void> {
  const bucket = { Bucket: id.bucket, ExpectedBucketOwner: id.account };
  let created = false;
  try { await s3.send(new HeadBucketCommand(bucket)); }
  catch (error) {
    if (!named(error, ['NotFound', 'NoSuchBucket'])) throw error;
    try {
      await s3.send(new CreateBucketCommand({ Bucket: id.bucket, ObjectOwnership: 'BucketOwnerEnforced',
        ...(id.homeRegion === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: id.homeRegion as BucketLocationConstraint } }) }));
      created = true; options.recordBucketCreation?.(id.bucket);
    } catch (error) {
      if (!named(error, ['BucketAlreadyOwnedByYou'])) throw error;
      // Concurrent creation is not authority to adopt an unmarked existing bucket.
    }
  }
  if (created) await s3.send(new PutBucketTaggingCommand({ ...bucket, Tagging: { TagSet: [marker, { Key: 'System', Value: 'security' }] } }));
  let tags: { Key?: string; Value?: string }[] = [];
  for (let attempt = 0; attempt < (options.attempts ?? 12); attempt++) {
    try { tags = (await s3.send(new GetBucketTaggingCommand(bucket))).TagSet ?? []; }
    catch (error) { if (!named(error, ['NoSuchTagSet'])) throw error; }
    if (tags.some(t => t.Key === marker.Key && t.Value === marker.Value)) break;
    if (!tags.length && options.createdBucket === id.bucket) {
      await s3.send(new PutBucketTaggingCommand({ ...bucket, Tagging: { TagSet: [marker, { Key: 'System', Value: 'security' }] } }));
      tags = [marker]; break;
    }
    if (attempt + 1 < (options.attempts ?? 12)) await options.pause?.();
  }
  if (!tags.some(t => t.Key === marker.Key && t.Value === marker.Value) || tags.some(t => t.Key?.startsWith('aws:cloudformation:'))) {
    throw new Error(`Refusing to adopt existing bucket ${id.bucket}; neutral baseline ownership is unproven.`);
  }
  // Repair only missing settings of our marked baseline. Existing different retention/policies require review, never silent replacement.
  const publicAccess = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
  const ownership = { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' as const }] };
  // Preserve S3's current default SSE-C block; omitting it must never reopen customer-key writes to audit storage.
  const encryption = { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' as const },
    BlockedEncryptionTypes: { EncryptionType: ['SSE-C' as const] } }] };
  const lifecycle = { Rules: [{ ID: 'AuditExpiry', Status: 'Enabled' as const, Filter: { Prefix: '' }, Expiration: { Days: id.retentionDays }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] };
  const policy = baselineBucketPolicy(id);
  const settings = [
    { read: async () => (await s3.send(new GetPublicAccessBlockCommand(bucket))).PublicAccessBlockConfiguration, missing: ['NoSuchPublicAccessBlockConfiguration'], desired: publicAccess,
      write: () => s3.send(new PutPublicAccessBlockCommand({ ...bucket, PublicAccessBlockConfiguration: publicAccess })) },
    { read: async () => (await s3.send(new GetBucketOwnershipControlsCommand(bucket))).OwnershipControls, missing: ['OwnershipControlsNotFoundError'], desired: ownership,
      write: () => s3.send(new PutBucketOwnershipControlsCommand({ ...bucket, OwnershipControls: ownership })) },
    { read: async () => { const v = (await s3.send(new GetBucketEncryptionCommand(bucket))).ServerSideEncryptionConfiguration;
      // S3 includes BucketKeyEnabled=false with ordinary SSE-S3, which does not change encryption.
      return v && { Rules: v.Rules?.map(r => { const { BucketKeyEnabled, ...rest } = r; return BucketKeyEnabled ? r : rest; }) }; },
      missing: ['ServerSideEncryptionConfigurationNotFoundError'], desired: encryption,
      write: () => s3.send(new PutBucketEncryptionCommand({ ...bucket, ServerSideEncryptionConfiguration: encryption })) },
    { read: async () => ({ Rules: (await s3.send(new GetBucketLifecycleConfigurationCommand(bucket))).Rules }), missing: ['NoSuchLifecycleConfiguration'], desired: lifecycle,
      write: () => s3.send(new PutBucketLifecycleConfigurationCommand({ ...bucket, LifecycleConfiguration: lifecycle })) },
    { read: async () => JSON.parse((await s3.send(new GetBucketPolicyCommand(bucket))).Policy ?? 'null') as unknown, missing: ['NoSuchBucketPolicy'], desired: policy,
      write: () => s3.send(new PutBucketPolicyCommand({ ...bucket, Policy: JSON.stringify(policy) })) },
  ];
  for (const setting of settings) {
    let actual: unknown;
    try { actual = await setting.read(); }
    catch (error) { if (!named(error, setting.missing)) throw error; }
    if (actual === undefined || actual === null) await setting.write();
    else if (!same(actual, setting.desired)) throw new Error(`Existing account audit bucket settings differ; review ownership/retention before changing ${id.bucket}.`);
  }
}

function result(observation: TrailObservation, created: boolean, report?: Options['report']) {
  const fullBaseline = Boolean(observation.fullManagement && observation.trail.IncludeGlobalServiceEvents && observation.trail.LogFileValidationEnabled);
  if (!fullBaseline) report?.('CloudTrail covers required management writes, but full read/write/global/validated account auditing is not established. Existing ownership/settings are preserved.');
  return { created, fullBaseline, observation };
}

export async function ensureCloudTrail(clients: TrailClients, s3: Pick<S3Client, 'send'>, options: Options) {
  const id = baselineIdentity(options);
  const pause = options.pause ?? (() => new Promise<void>(resolve => setTimeout(resolve, 5000)));
  const discovered = await discoverTrails(clients, options.region);
  const adequate = adequateTrail(discovered);
  if (adequate) return result(adequate, false, options.report);
  if (discovered.some(o => o.unreadable)) throw new Error('CloudTrail coverage is unknown; resolve unreadable settings before creating duplicate protection.');
  // Also inspect the deterministic home identity before configuring its destination or creating anything.
  const home = options.region === id.homeRegion ? discovered : await discoverTrails(clients, id.homeRegion);
  if (home.some(o => o.unreadable)) throw new Error('CloudTrail home-region coverage is unknown; no protection changed.');
  const homeAdequate = adequateTrail(home);
  let existing = home.find(o => o.trail.TrailARN === id.arn);
  if (!homeAdequate && existing) {
    const tags = (await clients(id.homeRegion).send(new ListTagsCommand({ ResourceIdList: [id.arn] }))).ResourceTagList?.[0]?.TagsList ?? [];
    if (!tags.some(t => t.Key === marker.Key && t.Value === marker.Value) || tags.some(t => t.Key?.startsWith('aws:cloudformation:'))) {
      throw new Error('Existing deterministic trail has external or unknown ownership; no adoption or mutation.');
    }
    if (!existing.trail.IsMultiRegionTrail || !existing.trail.IncludeGlobalServiceEvents || !existing.trail.LogFileValidationEnabled
      || existing.trail.S3BucketName !== id.bucket || !existing.fullManagement) throw new Error('Existing account trail settings differ; an explicit ownership/coverage review is required.');
  }
  let created = false;
  if (!homeAdequate) {
    await ensureBucket(s3, id, { ...options, pause });
    if (!existing) {
      try {
        // CreateTrail defaults to all management read/write, no data events or Insights. Logging is a separate operation.
        await clients(id.homeRegion).send(new CreateTrailCommand({ Name: id.name, S3BucketName: id.bucket,
          IsMultiRegionTrail: true, IncludeGlobalServiceEvents: true, EnableLogFileValidation: true,
          TagsList: [marker, { Key: 'System', Value: 'security' }] }));
        created = true;
      } catch (error) { if (!named(error, ['TrailAlreadyExistsException'])) throw error; }
      // A concurrent winner must have our ownership and full settings before StartLogging is allowed.
      existing = (await discoverTrails(clients, id.homeRegion)).find(o => o.trail.TrailARN === id.arn);
      const tags = (await clients(id.homeRegion).send(new ListTagsCommand({ ResourceIdList: [id.arn] }))).ResourceTagList?.[0]?.TagsList ?? [];
      if (!existing || existing.unreadable || !existing.fullManagement || existing.trail.S3BucketName !== id.bucket
        || !existing.trail.IsMultiRegionTrail || !existing.trail.IncludeGlobalServiceEvents || !existing.trail.LogFileValidationEnabled
        || !tags.some(t => t.Key === marker.Key && t.Value === marker.Value) || tags.some(t => t.Key?.startsWith('aws:cloudformation:'))) {
        throw new Error('Concurrent trail creation is not yet verifiably owned/complete; retry discovery.');
      }
    }
    if (!existing.status?.IsLogging) await clients(id.homeRegion).send(new StartLoggingCommand({ Name: id.arn }));
  }
  // Opt-in shadows can lag. Bound the wait; failure preserves all existing producers and never disables the new baseline.
  for (let attempt = 0; attempt < (options.attempts ?? 12); attempt++) {
    const ready = adequateTrail(await discoverTrails(clients, options.region));
    if (ready) return result(ready, created, options.report);
    if (attempt + 1 < (options.attempts ?? 12)) await pause();
  }
  throw new Error(`Shared CloudTrail coverage is pending in ${options.region}; existing trails must remain active. Retry later.`);
}
