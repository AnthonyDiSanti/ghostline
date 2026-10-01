import { BatchDeleteImageCommand, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import type { DeploymentConfig } from '../config.js';
import { withLifecycle } from '../lifecycle-operator.js';
import { releaseRepository, releaseSelector, repository, repositoryArtifacts } from './model.js';
import { readRelease, type EcrRegistry } from './registry.js';
import { releaseHistory } from './publication.js';
import { planArtifactCleanup, type ArtifactInventory, type ArtifactReference } from './retention.js';
import type { LifecycleState } from './lifecycle.js';
import type { Rollout } from './blue-green.js';
import { generationReferences, runtimeImageReferences, rolloutReferences, type RuntimeImages } from './runtime-retention.js';

async function retainedRuntime(config: DeploymentConfig, credentials: AwsCredentialIdentityProvider): Promise<ArtifactReference[] | undefined> {
  const db = new DynamoDBClient({ region: config.region, credentials });
  const record = async <T>(id: string): Promise<T | undefined> => {
    const response = await db.send(new GetItemCommand({ TableName: 'ghostline-prod-release-attempts', Key: { id: { S: id } }, ConsistentRead: true }));
    return response.Item?.record?.S ? JSON.parse(response.Item.record.S) as T : undefined;
  };
  const [lifecycle, stored, rollout] = await Promise.all([record<LifecycleState>('lifecycle'),
    record<RuntimeImages>('runtime/images'), record<Rollout>('rollout/current')]);
  if (!lifecycle || lifecycle.operation?.kind !== 'image-retention' || !stored) return undefined;
  const previous = runtimeImageReferences(stored.images), selected = rolloutReferences(rollout);
  if (!previous || !selected) return undefined;
  if (['stopped', 'parked'].includes(lifecycle.mode)) return [...previous, ...selected];
  if (lifecycle.mode !== 'active' || rollout && !['complete', 'cleaned', 'retired'].includes(rollout.phase)) return undefined;
  // Use the same fresh host/daemon/task proof as rollout selection; mutable aliases and stale hourly records are not runtime evidence.
  const { operatorGate } = await import('./operator.js');
  const actual = await (await operatorGate(config.id)).generation();
  const current = actual && generationReferences(actual);
  return current ? [...previous, ...selected, ...current] : undefined;
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
