import { accountAudit } from '../cloudtrail/operator.js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ECRClient, DescribeRegistryCommand, PutReplicationConfigurationCommand } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { fromIni } from '@aws-sdk/credential-providers';
import { deploymentIds, getDeployment, getPublication } from '../config.js';
import { AwsStackGate } from './aws-stack.js';
import { EcrRegistry, copyImage, readRelease } from './registry.js';
import { artifacts, releaseRepository, repository, repositoryPrefix, releaseSelector } from './model.js';
import { EcrReplicationCluster, replicationRulesEqual, type PublicationProfile, type ReplicationRule } from './topology.js';
import { applyPromotion, cleanPublicationProtection, releaseHistory } from './publication.js';
import { pruneRegionalArtifacts } from './retention-operator.js';
import { withLifecycle } from '../lifecycle-operator.js';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const profilePath = resolve(root, 'infra/deployment.json');
export const account = getDeployment(deploymentIds[0]).account;
export const awsProfile = process.env.AWS_PROFILE ?? 'personal';
export const credentials = fromIni({ profile: awsProfile });
// Bounded I/O lets an interrupted seed resume instead of hanging indefinitely on an upload socket.
export const registry = (region: string) => new EcrRegistry(new ECRClient({ region, credentials,
  requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000, throwOnRequestTimeout: true } }), account, region);

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

export async function deployReleaseRegion(region: string, automation = true): Promise<void> {
  // Independent account protection precedes any regional audit-producer migration.
  await accountAudit(account, region);
  const endpoint = deploymentIds.map(getDeployment).find(config => config.region === region);
  const deploy = async () => {
    const folder = resolve(root, '.local/releases', region);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const args = ['--app', `node --import=tsx bin/releases.ts ${region} ${automation ? 'active' : 'held'}`, '--profile', awsProfile,
      '--region', region, '--output', resolve(folder, 'cdk.out')];
    // Every mutation follows a fresh diff; publishers need only this durable stack, never a VPN instance.
    for (const stack of endpoint ? ['GhostlineReleaseAssets', 'GhostlineRelease'] : ['GhostlineRelease']) {
      command(process.execPath, ['node_modules/aws-cdk/bin/cdk', 'diff', stack, ...args], undefined, true);
      command(process.execPath, ['node_modules/aws-cdk/bin/cdk', 'deploy', stack, ...args, '--require-approval', 'never'], undefined, true);
    }
  };
  let existing = false;
  if (endpoint) {
    try {
      await new LambdaClient({ region, credentials }).send(new GetFunctionConfigurationCommand({ FunctionName: 'ghostline-prod-release-gate' }));
      existing = true;
    } catch (error) { if ((error as Error).name !== 'ResourceNotFoundException') throw error; }
  }
  // Existing controllers/CLI must agree on exclusion. Only a genuinely new region has no lifecycle store yet.
  if (endpoint && existing) await withLifecycle(endpoint, 'release-infrastructure', deploy);
  else await deploy();
}

export async function reconcileReplication(profile = getPublication(), previousMembers = profile.members): Promise<string[]> {
  const pending: string[] = [];
  const cluster = new EcrReplicationCluster(profile.members.map(region => ({ account, region })), [repositoryPrefix]);
  for (const { region } of cluster.reconciliationMembers(previousMembers.map(region => ({ account, region })))) {
    try {
      const client = registry(region).client;
      const existing = (await client.send(new DescribeRegistryCommand({}))).replicationConfiguration?.rules ?? [];
      if (existing.some(rule => !rule.destinations?.length || rule.destinations.some(d => !d.region || !d.registryId)
        || rule.repositoryFilters?.some(f => !f.filter || f.filterType !== 'PREFIX_MATCH'))) throw new Error('Malformed registry replication configuration.');
      const desired = cluster.rules(existing as ReplicationRule[], { account, region });
      if (!replicationRulesEqual(existing as ReplicationRule[], desired)) await client.send(new PutReplicationConfigurationCommand({ replicationConfiguration: { rules: desired } }));
      const observed = (await client.send(new DescribeRegistryCommand({}))).replicationConfiguration?.rules ?? [];
      if (!replicationRulesEqual(observed as ReplicationRule[], desired)) throw new Error('Replication membership readback is pending.');
      console.log(`${region}: replication membership reconciled.`);
    } catch (error) {
      // Preserve desired membership and report every unreachable source, including departed members.
      pending.push(region); console.warn(`${region}: replication reconciliation pending (${(error as Error).name}).`);
    }
  }
  return pending;
}

export async function cleanPublicationRegions(): Promise<void> {
  const profile = getPublication();
  for (const region of new Set(profile.members)) {
    try {
      if (await cleanPublicationProtection(registry(region))) console.log(`${region}: completed publication protection cleared.`);
      await pruneRegionalArtifacts(registry(region), credentials, deploymentIds.map(getDeployment).find(config => config.region === region));
    }
    catch (error) { console.warn(`${region}: publication cleanup pending (${(error as Error).name}).`); }
  }
}

export async function seedRegion(source: EcrRegistry, target: EcrRegistry): Promise<void> {
  const current = await readRelease(source, releaseRepository, releaseSelector);
  if (!current) throw new Error('Source has no complete production release.');
  const local = await readRelease(target, releaseRepository, releaseSelector);
  if (local && Date.parse(local.release.promotedAt) > Date.parse(current.release.promotedAt)) {
    throw new Error('Seed source is older than this region’s existing production intent.');
  }
  // New destinations receive the entire fixed history explicitly; native replication is not a backfill API.
  for (const record of await releaseHistory(source, current)) {
    for (const name of artifacts) {
      const image = record.release.images[name];
      console.log(`${target.region}: seed ${name} from ${source.region} (${image.digest}).`);
      await copyImage(source, target, image.repository, repository(name), image.digest, image.buildTag, console.log);
    }
    await copyImage(source, target, releaseRepository, releaseRepository, record.digest, `release-${record.release.promotionId}`);
  }
  if ((await readRelease(source, releaseRepository, releaseSelector))?.digest !== current.digest) {
    throw new Error('Seed source changed during transfer; repeat from its new complete snapshot.');
  }
  const manifest = await target.get(releaseRepository, current.digest);
  await applyPromotion(target, manifest!);
}

export function operatorGate(target: string): AwsStackGate {
  const config = getDeployment(target);
  const options = { region: config.region, credentials, maxAttempts: 1 };
  // CLI observations share the same fixed read-only host document and exact physical ownership contract.
  return new AwsStackGate(registry(config.region), { stack: config.stackName, cluster: config.resourceName,
    service: `${config.resourceName}-gateway`, daemon: `${config.resourceName}-network`,
    table: 'ghostline-prod-release-attempts', topic: `arn:aws:sns:${config.region}:${account}:ghostline-prod-release-alerts`,
    observerDocument: 'GhostlineObserveHost', progressRule: 'ghostline-prod-release-progress' },
  { cfn: new CloudFormationClient(options), ec2: new EC2Client(options), ecs: new ECSClient(options),
    db: new DynamoDBClient(options), ssm: new SSMClient(options), sns: new SNSClient(options), events: new EventBridgeClient(options) }, 'active');
}
