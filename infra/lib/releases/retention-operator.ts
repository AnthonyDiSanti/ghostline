import { BatchDeleteImageCommand, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { ECSClient } from '@aws-sdk/client-ecs';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import type { DeploymentConfig } from '../config.js';
import { withLifecycle } from '../lifecycle-operator.js';
import { artifacts, digestPattern, releaseRepository, releaseSelector, repository, repositoryArtifacts } from './model.js';
import { readRelease, type EcrRegistry } from './registry.js';
import { releaseHistory } from './publication.js';
import { observeEcsService } from './ecs-observation.js';
import { planArtifactCleanup, type ArtifactInventory, type ArtifactReference } from './retention.js';
import type { ActionObservation } from './stack-reconcile.js';
import type { LifecycleState } from './lifecycle.js';

export function observationReferences(actual: ActionObservation): ArtifactReference[] | undefined {
  // A missing component means the snapshot cannot protect a complete cold-recovery set.
  const refs = artifacts.map(name => ({ repository: repository(name), digest: name === 'bootstrap' ? actual.bootstrap?.digest
    : name === 'network-daemon' ? actual.daemon?.digest : actual.gateway?.images[name] }));
  return refs.every(ref => ref.digest && digestPattern.test(ref.digest)) ? refs as ArtifactReference[] : undefined;
}

async function retainedRuntime(config: DeploymentConfig, credentials: AwsCredentialIdentityProvider): Promise<ArtifactReference[] | undefined> {
  const db = new DynamoDBClient({ region: config.region, credentials });
  const record = async <T>(id: string): Promise<T | undefined> => {
    const response = await db.send(new GetItemCommand({ TableName: 'ghostline-prod-release-attempts', Key: { id: { S: id } }, ConsistentRead: true }));
    return response.Item?.record?.S ? JSON.parse(response.Item.record.S) as T : undefined;
  };
  const [lifecycle, stored] = await Promise.all([record<LifecycleState>('lifecycle'), record<{ at: number; observation: ActionObservation }>('host/observed')]);
  if (!lifecycle || lifecycle.operation?.kind !== 'image-retention' || !stored) return undefined;
  const previous = observationReferences(stored.observation);
  if (!previous) return undefined;
  if (['stopped', 'parked'].includes(lifecycle.mode)) return previous;
  if (lifecycle.mode !== 'active' || Date.now() - stored.at > 75 * 60_000) return undefined;
  // The current service read catches task turnover after the last hourly bootstrap observation.
  const ecs = new ECSClient({ region: config.region, credentials });
  const [gateway, daemon] = await Promise.all([
    observeEcsService(ecs, config.resourceName, `${config.resourceName}-gateway`, 'gateway'),
    observeEcsService(ecs, config.resourceName, `${config.resourceName}-network`, 'daemon'),
  ]);
  if (!gateway?.stable || !daemon?.stable) return undefined;
  const current = observationReferences({ ...stored.observation, gateway,
    daemon: { ...daemon, digest: daemon.images['network-daemon'] } });
  return current ? [...previous, ...current] : undefined;
}

export async function pruneRegionalArtifacts(registry: EcrRegistry, credentials: AwsCredentialIdentityProvider,
  config?: DeploymentConfig, report: (message: string) => void = console.log): Promise<void> {
  // Hold the same exclusion as deployment/park/destroy for the entire observation-and-delete window.
  const run = () => prune(registry, credentials, config, report);
  if (config) await withLifecycle(config, 'image-retention', run);
  else await run();
}

async function prune(registry: EcrRegistry, credentials: AwsCredentialIdentityProvider,
  config: DeploymentConfig | undefined, report: (message: string) => void): Promise<void> {
  // Operator publication is serialized. Runtime Lambda has no image-write/delete authority.
  const current = await readRelease(registry, releaseRepository, releaseSelector);
  if (!current) return;
  const runtime = config ? await retainedRuntime(config, credentials) : [];
  if (!runtime) { report(`${registry.region}: image cleanup deferred until stable runtime/power observations are available.`); return; }
  const history = await releaseHistory(registry, current);
  const inventory: ArtifactInventory[] = [];
  for (const name of repositoryArtifacts) {
    const repo = repository(name);
    let nextToken: string | undefined;
    do {
      const page = await registry.client.send(new DescribeImagesCommand({ repositoryName: repo, nextToken, maxResults: 100 }));
      for (const item of page.imageDetails ?? []) {
        if (!item.imageDigest || !item.imagePushedAt) throw new Error('Incomplete cleanup inventory.');
        const manifest = await registry.get(repo, item.imageDigest);
        if (!manifest) throw new Error('Image inventory changed during cleanup.');
        inventory.push({ repository: repo, digest: item.imageDigest, pushedAt: item.imagePushedAt.getTime(),
          tags: item.imageTags ?? [], children: (JSON.parse(manifest.manifest).manifests ?? []).map((child: { digest: string }) => child.digest) });
        if (inventory.length > 2000) throw new Error('Cleanup inventory exceeds its bounded scan; inspect before pruning.');
      }
      nextToken = page.nextToken;
    } while (nextToken);
  }
  const plan = planArtifactCleanup(inventory, history, runtime, true, Date.now());
  if (plan.reason) { report(`${registry.region}: image cleanup deferred: ${plan.reason}`); return; }
  for (const item of plan.remove) {
    // Recheck publication intent and mutable protections before each bounded deletion, including interrupted publications.
    if ((await readRelease(registry, releaseRepository, releaseSelector))?.digest !== current.digest
      || await registry.get(releaseRepository, 'keep-publishing-release')) throw new Error('Release intent changed during cleanup.');
    const detail = await registry.client.send(new DescribeImagesCommand({ repositoryName: item.repository, imageIds: [{ imageDigest: item.digest }] }));
    if (detail.imageDetails?.some(image => image.imageTags?.some(tag => tag.startsWith('keep-')))) throw new Error('Image became protected during cleanup.');
    const removed = await registry.client.send(new BatchDeleteImageCommand({ repositoryName: item.repository, imageIds: [{ imageDigest: item.digest }] }));
    if (removed.failures?.some(f => f.failureCode !== 'ImageNotFound')) throw new Error('Image cleanup is incomplete.');
  }
  report(`${registry.region}: pruned ${plan.remove.length} old unreferenced artifacts; protected release/runtime identities remain.`);
}
