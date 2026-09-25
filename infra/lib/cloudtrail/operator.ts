import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { S3Client } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import { baselineDefaults, baselineIdentity, ensureCloudTrail } from './baseline.js';
import { adequateTrail, discoverTrails } from './coverage.js';

export async function accountAudit(account: string, region: string, action: 'check' | 'ensure' = 'ensure') {
  // Nonsecret creation receipts recover interrupted bucket setup without adopting an unmarked pre-existing resource.
  const folder = fileURLToPath(new URL('../../../.local/account-security/', import.meta.url));
  const id = baselineIdentity({ account, region });
  const receipt = resolve(folder, `${id.account}-${id.homeRegion}-cloudtrail.json`);
  const previous = existsSync(receipt) ? JSON.parse(readFileSync(receipt, 'utf8')) : undefined;
  if (previous && (previous.account !== account || previous.arn !== id.arn || previous.bucket !== id.bucket)) throw new Error('Account audit creation receipt mismatch.');
  const credentials = fromIni({ profile: process.env.AWS_PROFILE ?? 'personal' });
  const clients = (region: string) => new CloudTrailClient({ region, credentials });
  if (action === 'check') {
    const observations = await discoverTrails(clients, region);
    return { observations, adequate: adequateTrail(observations)?.trail.TrailARN };
  }
  return ensureCloudTrail(clients, new S3Client({ region: baselineDefaults.homeRegion, credentials }), {
    account, region, createdBucket: previous?.bucket, report: console.log,
    recordBucketCreation: bucket => {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      writeFileSync(receipt, JSON.stringify({ account, arn: id.arn, bucket }) + '\n', { mode: 0o600 });
    },
  });
}
