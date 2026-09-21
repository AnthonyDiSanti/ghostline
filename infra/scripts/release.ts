import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getDeployment, getPublication, deploymentIds } from '../lib/config.js';
import { releaseTag } from '../lib/ecs-release.js';
import { artifacts, digestPattern, repository, releaseSelector, type Release } from '../lib/releases/model.js';
import { applyPromotion, planPromotion } from '../lib/releases/publication.js';
import { isQualifiedImage, readRelease, runtimeManifest } from '../lib/releases/registry.js';
import { readiness } from '../lib/releases/gate.js';
import { account, cleanPublicationRegions, command, credentials, deployReleaseRegion, operatorGate, persistPublication, reconcileReplication, registry,
  root, seedRegion, verifyAccount } from '../lib/releases/operator.js';

const [action, target, reference, ...extra] = process.argv.slice(2);
if (extra.length || !['publish', 'status', 'reconcile', 'retry', 'activate', 'retire'].includes(action ?? '')
  || (action !== 'publish' && reference)) throw new Error('Usage: npm run release <publish [primary|dr] [release-digest]|status [target]|reconcile target|retry target|activate target|retire target>');
verifyAccount();
const publication = getPublication();
const publishers = [publication.primaryRegion, publication.disasterRecoveryRegion];

async function publish() {
  if (target && !['primary', 'dr'].includes(target)) throw new Error('Select primary or dr publication origin.');
  const region = target === 'dr' ? publication.disasterRecoveryRegion : publication.primaryRegion;
  const destination = registry(region);
  const pending = await reconcileReplication();
  if (pending.includes(region)) throw new Error('Selected origin replication configuration is unresolved.');
  const unfinished = await readRelease(destination, repository('gateway-config'), 'keep-publishing-release');
  const active = await readRelease(destination, repository('gateway-config'), releaseSelector);
  if (unfinished && unfinished.digest !== active?.digest
    && (!active || Date.parse(unfinished.release.promotedAt) > Date.parse(active.release.promotedAt))) {
    // Resume an interrupted alias rotation before beginning another promotion; the document records its history.
    await applyPromotion(destination, (await destination.get(repository('gateway-config'), unfinished.digest))!);
    console.log(`Resumed ${unfinished.release.promotionId}. Run publish again for a new selection.`); return;
  }
  if (unfinished) {
    for (const name of artifacts) await destination.removeTag(repository(name), 'keep-publishing');
    await destination.removeTag(repository('gateway-config'), 'keep-publishing-release');
  }
  let images: Release['images'];
  if (reference) {
    if (!digestPattern.test(reference)) throw new Error('Select a retained release document by digest.');
    const old = await readRelease(destination, repository('gateway-config'), reference);
    if (!old) throw new Error('Retained release is unavailable at the selected publisher.');
    images = old.release.images;
  } else {
    const path = resolve(root, '.local/deployments/image-builds/qualified.json');
    if (!existsSync(path)) throw new Error('Run images:build once to qualify artifacts before publication.');
    const qualified = JSON.parse(readFileSync(path, 'utf8'));
    const dockerConfig = resolve(root, '.local/releases/docker');
    mkdirSync(dockerConfig, { recursive: true, mode: 0o700 });
    const host = `${account}.dkr.ecr.${region}.amazonaws.com`;
    const auth = await destination.client.send(new (await import('@aws-sdk/client-ecr')).GetAuthorizationTokenCommand({}));
    const token = auth.authorizationData?.[0]?.authorizationToken;
    if (!token) throw new Error('Registry authentication failed.');
    const password = Buffer.from(token, 'base64').toString().slice(4);
    command('docker', ['--config', dockerConfig, 'login', '--username', 'AWS', '--password-stdin', host], password);
    chmodSync(resolve(dockerConfig, 'config.json'), 0o600);
    images = {} as Release['images'];
    try {
      for (const name of artifacts) {
        const image = qualified.images?.[name];
        if (!image || image.buildTag !== releaseTag(name) || !digestPattern.test(image.imageId)) throw new Error('Qualification does not match the selected build inputs.');
        // Publish the qualified content ID directly; never rebuild or run tunnel tests in this command.
        const tag = `sha-${image.imageId.slice(7)}`;
        const uri = `${host}/${repository(name)}:${tag}`;
        if (!await destination.get(repository(name), tag)) {
          command('docker', ['--config', dockerConfig, 'tag', image.imageId, uri]);
          command('docker', ['--config', dockerConfig, 'push', uri], undefined, true);
        }
        const manifest = await destination.get(repository(name), tag);
        if (!manifest) throw new Error('Published manifest is missing.');
        const runtime = await runtimeManifest(destination, repository(name), manifest);
        if (!isQualifiedImage(image.imageId, manifest, runtime)) throw new Error('Published bytes differ from qualified image identity.');
        images[name] = { repository: repository(name), digest: manifest.digest, runtimeDigest: runtime.digest, buildTag: tag };
      }
    } finally { command('docker', ['--config', dockerConfig, 'logout', host]); rmSync(dockerConfig, { recursive: true, force: true }); }
  }
  const release = await planPromotion(destination, { schemaVersion: 1, promotionId: randomUUID(), promotedAt: new Date().toISOString(),
    origin: region, platform: 'linux/arm64', images, history: [] });
  if (!release) { console.log('Qualified image set is already production; history is unchanged.'); return; }
  const document = await destination.putRelease(repository('gateway-config'), release, `release-${release.promotionId}`);
  await applyPromotion(destination, document);
  console.log(`Published ${release.promotionId} at ${region}. Destinations reconcile independently as native replication arrives.`);
}

async function status(id: string) {
  const gate = operatorGate(id);
  const ready = await readiness(gate.registry);
  const service = await gate.service();
  const attempt = ready.current ? await gate.attempt(ready.current.digest) : undefined;
  console.log(JSON.stringify({ target: id, release: ready.current, ready: ready.ready, reason: ready.reason, service, attempt }, null, 2));
}

async function invoke(id: string, action: 'reconcile' | 'retry') {
  const config = getDeployment(id);
  const result = await new LambdaClient({ region: config.region, credentials }).send(new InvokeCommand({
    FunctionName: 'ghostline-prod-release-gate', Payload: Buffer.from(JSON.stringify({ action })) }));
  if (result.FunctionError) throw new Error('Regional gate failed; inspect its bounded diagnostic logs.');
  console.log(Buffer.from(result.Payload ?? []).toString());
}

try {
  if (action === 'publish') await publish();
  else if (action === 'status') for (const id of target ? [getDeployment(target).id] : deploymentIds) await status(id);
  else if (action === 'reconcile' || action === 'retry') {
    await reconcileReplication();
    await invoke(getDeployment(target).id, action);
  } else if (action === 'activate') {
    const config = getDeployment(target);
    publication.subscribers = [...new Set([...publication.subscribers, config.region])];
    persistPublication(publication);
    // Prepare repositories at every destination before enabling replication's automatic repository creation.
    for (const region of [...new Set([...publishers, ...publication.subscribers])]) {
      try { deployReleaseRegion(region); } catch (error) {
        if (region === config.region) throw error;
        console.warn(`${region}: infrastructure reconciliation pending; continue preparing the requested region.`);
      }
    }
    const pending = await reconcileReplication(publication);
    let seeded = false;
    const sources = [];
    for (const region of publishers) {
      try {
        const selected = await readRelease(registry(region), repository('gateway-config'), releaseSelector);
        if (selected) sources.push({ region, selected });
      } catch { console.warn(`${region}: source metadata unavailable.`); }
    }
    sources.sort((a, b) => Date.parse(b.selected.release.promotedAt) - Date.parse(a.selected.release.promotedAt));
    for (const { region } of sources) {
      if (region === config.region || pending.includes(region)) continue;
      try {
        if (!await readRelease(registry(region), repository('gateway-config'), releaseSelector)) continue;
        await seedRegion(registry(region), registry(config.region)); seeded = true; break;
      } catch (error) { console.warn(`${region}: seed source unavailable (${(error as Error).name}); try the other publisher.`); }
    }
    if (!seeded) console.log('Region infrastructure is ready; no source release seeded. Publish the first qualified set or repair source availability before launching.');
  } else if (action === 'retire') {
    const config = getDeployment(target);
    const service = await operatorGate(config.id).service();
    const stacks = JSON.parse(command('aws', ['--profile', process.env.AWS_PROFILE ?? 'personal', '--region', config.region,
      'cloudformation', 'list-stacks', '--query', `StackSummaries[?StackName=='${config.stackName}' && StackStatus!='DELETE_COMPLETE'].StackStatus`, '--output', 'json']));
    if (service || stacks.length) throw new Error('Destroy the endpoint before retiring its release subscription. Stop/park retain subscription.');
    publication.subscribers = publication.subscribers.filter(r => r !== config.region);
    persistPublication(publication);
    await reconcileReplication(publication);
    console.log('Subscription retired. Regional images/history remain retained until explicit repository removal.');
  }
  if (['publish', 'reconcile', 'activate', 'retire'].includes(action!)) await cleanPublicationRegions();
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `Release operation failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
}
