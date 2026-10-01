import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getDeployment, getPublication, deploymentIds } from '../lib/config.js';
import { artifacts, releaseRepository, digestPattern, repository, releaseSelector, type Release } from '../lib/releases/model.js';
import { applyPromotion, planPromotion, assertPublicationOrigin } from '../lib/releases/publication.js';
import { readRelease } from '../lib/releases/registry.js';
import { publishQualifiedImage } from '../lib/releases/image-publication.js';
import { readiness } from '../lib/releases/gate.js';
import { account, cleanPublicationRegions, command, credentials, deployReleaseRegion, operatorGate, persistPublication, reconcileReplication, registry,
  root, seedRegion, verifyAccount } from '../lib/releases/operator.js';

assertBenchmarkExclusion();
const [action, target, reference, ...extra] = process.argv.slice(2);
if (extra.length || !['publish', 'status', 'reconcile', 'retry', 'cleanup-failed', 'activate'].includes(action ?? '')
  || (action !== 'publish' && reference)) throw new Error('Usage: npm run release <publish <target-or-region> [release-digest]|status [target]|reconcile target|retry target|cleanup-failed target|activate target>');
verifyAccount();
const publication = getPublication();
const publishers = publication.members;

async function publish() {
  const region = target && deploymentIds.includes(target) ? getDeployment(target).region : target;
  if (!region || !publication.members.includes(region)) throw new Error('Select an enrolled target or publication region.');
  const destination = registry(region);
  const pending = await reconcileReplication();
  if (pending.includes(region)) throw new Error('Selected origin replication configuration is unresolved.');
  const unfinished = await readRelease(destination, releaseRepository, 'keep-publishing-release');
  const active = await readRelease(destination, releaseRepository, releaseSelector);
  if (unfinished && unfinished.digest !== active?.digest
    && (!active || Date.parse(unfinished.release.promotedAt) > Date.parse(active.release.promotedAt))) {
    // Resume an interrupted alias rotation before beginning another promotion; the document records its history.
    await assertPublicationOrigin(destination, publication.members.filter(r => r !== region).map(region => ({ region, registry: registry(region) })), console.warn, 'keep-publishing-release');
    await applyPromotion(destination, (await destination.get(releaseRepository, unfinished.digest))!);
    console.log(`Resumed ${unfinished.release.promotionId}. Run publish again for a new selection.`); return;
  }
  if (unfinished) {
    for (const name of artifacts) await destination.removeTag(repository(name), 'keep-publishing');
    await destination.removeTag(releaseRepository, 'keep-publishing-release');
  }
  await assertPublicationOrigin(destination, publication.members.filter(r => r !== region).map(region => ({ region, registry: registry(region) })), console.warn);
  let images: Release['images'];
  let os: Release['os'];
  if (reference) {
    if (!digestPattern.test(reference)) throw new Error('Select a retained release document by digest.');
    const old = await readRelease(destination, releaseRepository, reference);
    if (!old) throw new Error('Retained release is unavailable at the selected publisher.');
    if (old.release.schemaVersion !== 3) throw new Error('Historical release has no selected OS; qualify its platform before republishing.');
    images = old.release.images; os = old.release.os;
  } else {
    const path = resolve(root, '.local/deployments/image-builds/qualified.json');
    if (!existsSync(path)) throw new Error('Run images:build once to qualify artifacts before publication.');
    const qualified = JSON.parse(readFileSync(path, 'utf8'));
    if (!qualified.os?.targetVersion) throw new Error('Native platform target OS qualification is missing.');
    os = qualified.os;
    // Never silently discard a newly introduced component from the centrally qualified release set.
    if (Object.keys(qualified.images ?? {}).sort().join(',') !== [...artifacts].sort().join(',')) throw new Error('Qualified components differ from the release schema; complete the manifest migration before publication.');
    images = {} as Release['images'];
    for (const name of artifacts) {
      images[name] = await publishQualifiedImage(destination, repository(name), name, qualified.images?.[name],
        args => { command('docker', args); }, console.log);
    }
  }
  const release = await planPromotion(destination, { schemaVersion: 3, promotionId: randomUUID(), promotedAt: new Date().toISOString(),
    origin: region, platform: 'linux/arm64', images, os, history: [] });
  if (!release) { console.log('Qualified image set is already production; history is unchanged.'); return; }
  const document = await destination.putRelease(releaseRepository, release, `release-${release.promotionId}`);
  await applyPromotion(destination, document);
  console.log(`Published ${release.promotionId} at ${region}. Destinations reconcile independently as native replication arrives.`);
}

async function status(id: string) {
  const gate = await operatorGate(id);
  const ready = await readiness(gate.registry);
  const lifecycle = await gate.record<{ mode: string }>('lifecycle');
  const actual = lifecycle?.mode === 'active' ? await gate.generation() : undefined;
  console.log(JSON.stringify({ target: id, release: ready.current, ready: ready.ready, reason: ready.reason,
    actual, attempt: await gate.record('rollout/current'), retainedImages: await gate.record('runtime/images'), lifecycle }, null, 2));
}

async function invoke(id: string, action: 'reconcile' | 'retry' | 'cleanup-failed') {
  const config = getDeployment(id);
  const result = await new LambdaClient({ region: config.region, credentials }).send(new InvokeCommand({
    FunctionName: 'ghostline-prod-release-gate', Payload: Buffer.from(JSON.stringify({ action })) }));
  if (result.FunctionError) throw new Error('Regional gate failed; inspect its bounded diagnostic logs.');
  console.log(Buffer.from(result.Payload ?? []).toString());
}

try {
  if (action === 'publish') await publish();
  else if (action === 'status') for (const id of target ? [getDeployment(target).id] : deploymentIds) await status(id);
  else if (action === 'reconcile' || action === 'retry' || action === 'cleanup-failed') {
    await reconcileReplication();
    await invoke(getDeployment(target).id, action);
  } else if (action === 'activate') {
    const config = getDeployment(target);
    const previousMembers = [...publication.members];
    publication.members = [...new Set([...publication.members, config.region])];
    // Prepare repositories at every destination before enabling replication's automatic repository creation.
    for (const region of publication.members) {
      try { await deployReleaseRegion(region, region !== config.region); } catch (error) {
        if (region === config.region) throw error;
        console.warn(`${region}: infrastructure reconciliation pending; continue preparing the requested region.`);
      }
    }
    // Seed before enabling outbound replication from a newly enrolled registry.
    let seeded = (await readiness(registry(config.region))).ready;
    let unavailableSources = 0;
    const sources = [];
    for (const region of publishers) {
      try {
        const selected = await readRelease(registry(region), releaseRepository, releaseSelector);
        if (selected) sources.push({ region, selected });
      } catch { unavailableSources++; console.warn(`${region}: source metadata unavailable.`); }
    }
    sources.sort((a, b) => Date.parse(b.selected.release.promotedAt) - Date.parse(a.selected.release.promotedAt));
    for (const { region } of sources) {
      if (region === config.region) continue;
      try {
        if (!await readRelease(registry(region), releaseRepository, releaseSelector)) continue;
        await seedRegion(registry(region), registry(config.region)); seeded = true; break;
      } catch (error) { console.warn(`${region}: seed attempt incomplete (${(error as Error).name}); try another available member.`); }
    }
    if (!seeded && (sources.length || unavailableSources)) throw new Error('Region is prepared but seeding is incomplete; replication enrollment remains pending.');
    if (!seeded) console.log('No existing release is available; publish the first centrally qualified set before launching.');
    if (seeded) await assertPublicationOrigin(registry(config.region), previousMembers.filter(r => r !== config.region).map(region => ({ region, registry: registry(region) })), console.warn);
    persistPublication(publication);
    const unresolved = await reconcileReplication(publication, previousMembers);
    if (unresolved.length) throw new Error(`Replication enrollment incomplete: ${unresolved.join(', ')}`);
    await deployReleaseRegion(config.region);
  }
  if (['publish', 'reconcile', 'activate'].includes(action!)) await cleanPublicationRegions();
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `Release operation failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
}
