import { assertBenchmarkExclusion } from '../lib/benchmark/exclusion.js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LambdaClient, GetFunctionConfigurationCommand, InvokeCommand } from '@aws-sdk/client-lambda';
import { getDeployment, getPublication, deploymentIds } from '../lib/config.js';
import { releaseArtifacts, releaseRepository, digestPattern, repository, releaseSelector, type Release } from '../lib/releases/model.js';
import { applyPromotion, planPromotion, assertPublicationOrigin, publicationSelection, assertPublicationSchema } from '../lib/releases/publication.js';
import { readRelease } from '../lib/releases/registry.js';
import { publishQualifiedImage } from '../lib/releases/image-publication.js';
import { readiness } from '../lib/releases/gate.js';
import { dnsPublicationControllerMode, releaseAutomationMode, type ReleaseAutomationMode } from '../lib/releases/automation.js';
import { assertCurrentBuildQualification, loadNativeQualification, qualifiedOs } from '../lib/platform-qualification.js';
import { account, cleanPublicationRegions, command, credentials, deployReleaseRegion, operatorGate, persistPublication, reconcileReplication, registry,
  root, seedRegion, verifyAccount } from '../lib/releases/operator.js';

assertBenchmarkExclusion();
const [action, target, reference, ...extra] = process.argv.slice(2);
if (extra.length || !['publish', 'status', 'reconcile', 'retry', 'cleanup-failed', 'activate', 'mode'].includes(action ?? '')
  || (!['publish', 'mode'].includes(action ?? '') && reference)) throw new Error('Usage: npm run release <publish <target-or-region> [release-digest]|status [target]|reconcile target|retry target|cleanup-failed target|activate target|mode target <active|manual|held>>');
verifyAccount();
const publication = getPublication();
const publishers = publication.members;

async function assertDnsControllersReady() {
  // A replicated selector reaches every region, so migration must be held everywhere before alias rotation.
  const modes: ReleaseAutomationMode[] = [];
  for (const id of deploymentIds) {
    const config = getDeployment(id);
    const result = await new LambdaClient({ region: config.region, credentials }).send(new GetFunctionConfigurationCommand({
      FunctionName: 'ghostline-prod-release-gate',
    }));
    const env = result.Environment?.Variables;
    if (env?.ENDPOINT_STACK !== config.stackName || env.DNS_REQUIRED !== 'true')
      throw new Error(`${id}: install the DNS-aware release controller before six-image publication.`);
    modes.push(releaseAutomationMode(env.AUTOMATION, env.OPERATOR_ONLY));
  }
  if (dnsPublicationControllerMode(modes) === 'active') {
    // Once migration is over, allow normal publications only from a coherent six-image baseline.
    for (const id of deploymentIds) {
      const config = getDeployment(id);
      const ready = await readiness(registry(config.region), true);
      if (!ready.ready) throw new Error(`${id}: six-image production release is not ready: ${ready.reason}`);
    }
  }
}

async function publish() {
  const region = target && deploymentIds.includes(target) ? getDeployment(target).region : target;
  if (!region || !publication.members.includes(region)) throw new Error('Select an enrolled target or publication region.');
  const selection = publicationSelection(deploymentIds.map(id => getDeployment(id).dnsRequired === true));
  if (selection.schemaVersion === 4) await assertDnsControllersReady();
  const destination = registry(region);
  const pending = await reconcileReplication();
  if (pending.includes(region)) throw new Error('Selected origin replication configuration is unresolved.');
  const unfinished = await readRelease(destination, releaseRepository, 'keep-publishing-release');
  const active = await readRelease(destination, releaseRepository, releaseSelector);
  if (unfinished && unfinished.digest !== active?.digest
    && (!active || Date.parse(unfinished.release.promotedAt) > Date.parse(active.release.promotedAt))) {
    // Resume an interrupted alias rotation before beginning another promotion; the document records its history.
    await assertPublicationOrigin(destination, publication.members.filter(r => r !== region).map(region => ({ region, registry: registry(region) })), console.warn, 'keep-publishing-release');
    await applyPromotion(destination, (await destination.get(releaseRepository, unfinished.digest))!, selection.admission);
    console.log(`Resumed ${unfinished.release.promotionId}. Run publish again for a new selection.`); return;
  }
  if (unfinished) {
    for (const name of releaseArtifacts(unfinished.release)) await destination.removeTag(repository(name), 'keep-publishing');
    await destination.removeTag(releaseRepository, 'keep-publishing-release');
  }
  await assertPublicationOrigin(destination, publication.members.filter(r => r !== region).map(region => ({ region, registry: registry(region) })), console.warn);
  let images: Release['images'];
  let os: Release['os'];
  let schemaVersion: 3 | 4 = selection.schemaVersion;
  if (reference) {
    if (!digestPattern.test(reference)) throw new Error('Select a retained release document by digest.');
    const old = await readRelease(destination, releaseRepository, reference);
    if (!old) throw new Error('Retained release is unavailable at the selected publisher.');
    if (old.release.schemaVersion < 3) throw new Error('Historical release has no selected OS; qualify its platform before republishing.');
    assertPublicationSchema(selection.schemaVersion, old.release);
    schemaVersion = old.release.schemaVersion as 3 | 4;
    images = old.release.images; os = old.release.os;
  } else {
    const path = resolve(root, `.local/deployments/image-builds/${schemaVersion === 4 ? 'qualified-dns.json' : 'qualified.json'}`);
    if (!existsSync(path)) throw new Error('Run images:build once to qualify artifacts before publication.');
    const qualified = JSON.parse(readFileSync(path, 'utf8'));
    assertCurrentBuildQualification(qualified, selection.names);
    const nativeOs = qualifiedOs(qualified.images, loadNativeQualification());
    const claimedOs = (qualified as typeof qualified & { os?: Release['os'] }).os;
    if (!nativeOs || JSON.stringify(claimedOs) !== JSON.stringify(nativeOs)) throw new Error('Native platform target OS qualification is missing or differs from the selected bytes.');
    os = nativeOs;
    images = {} as Release['images'];
    for (const name of selection.names) {
      images[name] = await publishQualifiedImage(destination, repository(name), name, qualified.images?.[name],
        args => { command('docker', args); }, console.log);
    }
  }
  const release = await planPromotion(destination, { schemaVersion, promotionId: randomUUID(), promotedAt: new Date().toISOString(),
    origin: region, platform: 'linux/arm64', images, os, history: [] }, selection.admission);
  if (!release) { console.log('Qualified image set is already production; history is unchanged.'); return; }
  const document = await destination.putRelease(releaseRepository, release, `release-${release.promotionId}`);
  await applyPromotion(destination, document, selection.admission);
  console.log(`Published ${release.promotionId} at ${region}. Destinations reconcile independently as native replication arrives.`);
}

async function status(id: string) {
  const gate = await operatorGate(id);
  const ready = await readiness(gate.registry, gate.config.dnsRequired);
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
      try { await deployReleaseRegion(region, region !== config.region ? 'active' : 'held'); } catch (error) {
        if (region === config.region) throw error;
        console.warn(`${region}: infrastructure reconciliation pending; continue preparing the requested region.`);
      }
    }
    // Seed before enabling outbound replication from a newly enrolled registry.
    let seeded = (await readiness(registry(config.region), config.dnsRequired)).ready;
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
        await seedRegion(registry(region), registry(config.region), config.dnsRequired === true); seeded = true; break;
      } catch (error) { console.warn(`${region}: seed attempt incomplete (${(error as Error).name}); try another available member.`); }
    }
    if (!seeded && (sources.length || unavailableSources)) throw new Error('Region is prepared but seeding is incomplete; replication enrollment remains pending.');
    if (!seeded) console.log('No existing release is available; publish the first centrally qualified set before launching.');
    if (seeded) await assertPublicationOrigin(registry(config.region), previousMembers.filter(r => r !== config.region).map(region => ({ region, registry: registry(region) })), console.warn);
    persistPublication(publication);
    const unresolved = await reconcileReplication(publication, previousMembers);
    if (unresolved.length) throw new Error(`Replication enrollment incomplete: ${unresolved.join(', ')}`);
    await deployReleaseRegion(config.region);
  } else if (action === 'mode') {
    if (!reference || !['active', 'manual', 'held'].includes(reference)) throw new Error('Select active, manual or held release mode.');
    if (!publication.automation && reference === 'active') throw new Error('Global release automation is disabled.');
    const config = getDeployment(target);
    await deployReleaseRegion(config.region, reference as 'active' | 'manual' | 'held');
    // Read the deployed controller contract before reporting a migration hold as effective.
    const observed = await new LambdaClient({ region: config.region, credentials }).send(new GetFunctionConfigurationCommand({
      FunctionName: 'ghostline-prod-release-gate' }));
    if (releaseAutomationMode(observed.Environment?.Variables?.AUTOMATION, observed.Environment?.Variables?.OPERATOR_ONLY) !== reference) {
      throw new Error('Regional release mode readback differs from the requested mode.');
    }
    console.log(`${config.id}: regional release mode is ${reference}.`);
  }
  if (['publish', 'reconcile', 'activate'].includes(action!)) await cleanPublicationRegions();
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `Release operation failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
}
