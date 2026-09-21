import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ECRClient, DescribeRegistryCommand, PutReplicationConfigurationCommand } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { fromIni } from '@aws-sdk/credential-providers';
import { deploymentIds, getDeployment, getPublication } from '../config.js';
import { AwsGate } from './aws-gate.js';
import { EcrRegistry, copyImage, readRelease } from './registry.js';
import { artifacts, repository, repositoryPrefix, releaseSelector } from './model.js';
import { replicationRules, type PublicationProfile, type ReplicationRule } from './topology.js';
import { applyPromotion, cleanPublicationProtection, releaseHistory } from './publication.js';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const profilePath = resolve(root, 'infra/deployment.json');
export const account = getDeployment(deploymentIds[0]).account;
export const awsProfile = process.env.AWS_PROFILE ?? 'personal';
export const credentials = fromIni({ profile: awsProfile });
export const registry = (region: string) => new EcrRegistry(new ECRClient({ region, credentials }), account, region);

export function command(executable: string, args: string[], input?: string, visible = false): string {
  const result = spawnSync(executable, args, { cwd: resolve(root, 'infra'), input, encoding: 'utf8',
    stdio: ['pipe', visible ? 'inherit' : 'pipe', visible ? 'inherit' : 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${executable} failed; captured output withheld.`);
  return result.stdout ?? '';
}

export function verifyAccount(): void {
  if (JSON.parse(command('aws', ['--profile', awsProfile, 'sts', 'get-caller-identity', '--output', 'json'])).Account !== account) throw new Error('AWS account mismatch.');
}

export function persistPublication(profile: PublicationProfile): void {
  // Preserve user overrides and the whole gateway catalog when activation changes subscription membership.
  const json = JSON.parse(readFileSync(profilePath, 'utf8'));
  json.imagePublication = profile;
  writeFileSync(profilePath, JSON.stringify(json, null, 2) + '\n');
}

export function deployReleaseRegion(region: string): void {
  const folder = resolve(root, '.local/releases', region);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const args = ['--app', `node --import=tsx bin/releases.ts ${region}`, '--profile', awsProfile,
    '--region', region, '--output', resolve(folder, 'cdk.out')];
  // Every mutation follows a fresh diff; publishers need only this durable stack, never a VPN instance.
  const stacks = getPublication().subscribers.includes(region) && deploymentIds.some(id => getDeployment(id).region === region)
    ? ['GhostlineReleaseAssets', 'GhostlineRelease'] : ['GhostlineRelease'];
  for (const stack of stacks) {
    command(process.execPath, ['node_modules/aws-cdk/bin/cdk', 'diff', stack, ...args], undefined, true);
    command(process.execPath, ['node_modules/aws-cdk/bin/cdk', 'deploy', stack, ...args, '--require-approval', 'never'], undefined, true);
  }
}

export async function reconcileReplication(profile = getPublication()): Promise<string[]> {
  const pending: string[] = [];
  for (const region of [profile.primaryRegion, profile.disasterRecoveryRegion]) {
    try {
      const client = registry(region).client;
      const existing = (await client.send(new DescribeRegistryCommand({}))).replicationConfiguration?.rules ?? [];
      if (existing.some(rule => !rule.destinations?.length || rule.destinations.some(d => !d.region || !d.registryId)
        || rule.repositoryFilters?.some(f => !f.filter || f.filterType !== 'PREFIX_MATCH'))) throw new Error('Malformed registry replication configuration.');
      const desired = replicationRules(existing as ReplicationRule[], profile, account, region, repositoryPrefix);
      if (JSON.stringify(existing) !== JSON.stringify(desired)) await client.send(new PutReplicationConfigurationCommand({ replicationConfiguration: { rules: desired } }));
      console.log(`${region}: replication membership reconciled.`);
    } catch (error) {
      // Continue the other publisher; never drop a subscriber merely because its region is unavailable.
      pending.push(region); console.warn(`${region}: replication reconciliation pending (${(error as Error).name}).`);
    }
  }
  return pending;
}

export async function cleanPublicationRegions(): Promise<void> {
  const profile = getPublication();
  for (const region of new Set([profile.primaryRegion, profile.disasterRecoveryRegion, ...profile.subscribers])) {
    try { if (await cleanPublicationProtection(registry(region))) console.log(`${region}: completed publication protection cleared.`); }
    catch (error) { console.warn(`${region}: publication cleanup pending (${(error as Error).name}).`); }
  }
}

export async function seedRegion(source: EcrRegistry, target: EcrRegistry): Promise<void> {
  const current = await readRelease(source, repository('gateway-config'), releaseSelector);
  if (!current) throw new Error('Source has no complete production release.');
  const local = await readRelease(target, repository('gateway-config'), releaseSelector);
  if (local && Date.parse(local.release.promotedAt) > Date.parse(current.release.promotedAt)) {
    throw new Error('Seed source is older than this region’s existing production intent.');
  }
  // New destinations receive the entire fixed history explicitly; native replication is not a backfill API.
  for (const record of await releaseHistory(source, current)) {
    for (const name of artifacts) {
      const image = record.release.images[name];
      await copyImage(source, target, image.repository, repository(name), image.digest, image.buildTag);
    }
    await copyImage(source, target, repository('gateway-config'), repository('gateway-config'), record.digest, `release-${record.release.promotionId}`);
  }
  const manifest = await target.get(repository('gateway-config'), current.digest);
  await applyPromotion(target, manifest!);
}

export function operatorGate(target: string): AwsGate {
  const config = getDeployment(target);
  // Operator preflight uses the same read-side contract as Lambda; no SSM secret access is needed.
  return new AwsGate(registry(config.region), { cluster: config.resourceName, service: `${config.resourceName}-gateway`,
    table: 'ghostline-prod-release-attempts', topic: `arn:aws:sns:${config.region}:${account}:ghostline-prod-release-alerts` },
  new ECSClient({ region: config.region, credentials, maxAttempts: 1 }),
  new DynamoDBClient({ region: config.region, credentials }), new SNSClient({ region: config.region, credentials }));
}
