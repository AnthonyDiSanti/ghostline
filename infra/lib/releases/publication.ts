import { releaseArtifacts, releaseRepository, production, releaseSelector, repository, retainHistory, setIdentity, type Artifact, type Release } from './model.js';
import { dnsReleaseArtifacts, imageArtifacts } from '../image-artifacts.js';
import { readRelease, type Manifest, type Registry, type ReleaseRecord } from './registry.js';

export async function releaseHistory(registry: Registry, current: ReleaseRecord): Promise<ReleaseRecord[]> {
  const history: ReleaseRecord[] = [current];
  for (const hash of current.release.history) {
    const item = await readRelease(registry, releaseRepository, hash);
    if (!item) throw new Error('Retained release document is missing.');
    history.push(item);
  }
  return history;
}

export function publicationSlots(history: ReleaseRecord[]): Array<{ record: ReleaseRecord; tag: string; names: readonly Artifact[] }> {
  // Each retained document owns its exact image set; a mixed migration must not invent a DNS alias for a v3 slot.
  return history.map((record, index) => ({ record, tag: index ? `keep-mru-${index}` : production,
    names: releaseArtifacts(record.release) }));
}

export function releaseTransferPlan(history: ReleaseRecord[]) {
  // Regional seeding must transfer each retained document's own executable set before moving its selector.
  return history.map(record => ({ record, images: releaseArtifacts(record.release).map(name => ({
    name, image: record.release.images[name]!,
  })) }));
}

export async function seedReleaseHistory(source: Registry, target: Registry,
  copy: (repositoryName: string, imageDigest: string, tag: string) => Promise<void>,
  admission: PublicationAdmission = 'five-image'): Promise<void> {
  const current = await readRelease(source, releaseRepository, releaseSelector);
  if (!current) throw new Error('Source has no complete production release.');
  const local = await readRelease(target, releaseRepository, releaseSelector);
  assertAdmitted(current.release, local?.release, admission);
  if (local && Date.parse(local.release.promotedAt) > Date.parse(current.release.promotedAt)) {
    throw new Error('Seed source is older than this region’s existing production intent.');
  }
  // Transfer each retained schema's exact bytes before any destination alias can select them.
  for (const { record, images } of releaseTransferPlan(await releaseHistory(source, current))) {
    for (const { image } of images) await copy(image.repository, image.digest, image.buildTag);
    await copy(releaseRepository, record.digest, `release-${record.release.promotionId}`);
  }
  if ((await readRelease(source, releaseRepository, releaseSelector))?.digest !== current.digest) {
    throw new Error('Seed source changed during transfer; repeat from its new complete snapshot.');
  }
  const manifest = await target.get(releaseRepository, current.digest);
  if (!manifest) throw new Error('Transferred release document is missing.');
  await applyPromotion(target, manifest, admission);
}

function windowArtifacts(slots: Array<{ names: readonly Artifact[] }>): Artifact[] {
  // A five-image-only region may not have the DNS repository yet; touch only repositories present in this window.
  return [...new Set(slots.flatMap(slot => slot.names))];
}

export type PublicationAdmission = 'five-image' | 'dns-migration-trial';

export function publicationSelection(dnsRequired: readonly boolean[]): {
  schemaVersion: 3 | 4; names: readonly Artifact[]; admission: PublicationAdmission;
} {
  // A global selector must never expose a six-image intent while one maintained endpoint still expects five.
  if (!dnsRequired.length || dnsRequired.some(value => value !== dnsRequired[0])) {
    throw new Error('Maintained regions must agree on the DNS release schema before publication.');
  }
  return dnsRequired[0]
    ? { schemaVersion: 4, names: dnsReleaseArtifacts, admission: 'dns-migration-trial' }
    : { schemaVersion: 3, names: imageArtifacts, admission: 'five-image' };
}

export function assertPublicationSchema(selected: 3 | 4, candidate: Release): void {
  // Historical republishing must not strand endpoints on a document with the wrong task shape.
  if (candidate.schemaVersion !== selected) throw new Error('Retained release schema differs from maintained gateway configuration.');
}

function assertAdmitted(candidate: Release, current: Release | undefined, admission: PublicationAdmission): void {
  // The DNS migration stays closed to ordinary publishers until client and regional acceptance authorizes it.
  if (admission !== 'dns-migration-trial' && (candidate.schemaVersion === 4 || current?.schemaVersion === 4)) {
    throw new Error('DNS-bearing release publication is not enabled until all six-image runtime gates are qualified.');
  }
}

export async function planPromotion(registry: Registry, candidate: Release,
  admission: PublicationAdmission = 'five-image'): Promise<Release | undefined> {
  // Publication owns app history. Regional success/rollback never influences these aliases.
  const current = await readRelease(registry, releaseRepository, releaseSelector);
  assertAdmitted(candidate, current?.release, admission);
  // Qualification policy can change without new executable bytes; publish that intent without consuming an MRU slot.
  if (current && setIdentity(current.release) === setIdentity(candidate)
    && JSON.stringify(current.release.os.knownLimitations ?? []) === JSON.stringify(candidate.os.knownLimitations ?? [])) return undefined;
  return { ...candidate, history: retainHistory(candidate, current ? await releaseHistory(registry, current) : []) };
}

export async function applyPromotion(registry: Registry, document: Manifest,
  admission: PublicationAdmission = 'five-image'): Promise<void> {
  const pending = await readRelease(registry, releaseRepository, document.digest);
  if (!pending) throw new Error('Upload the immutable release document before promotion.');
  assertAdmitted(pending.release, (await readRelease(registry, releaseRepository, releaseSelector))?.release, admission);
  const history = await releaseHistory(registry, pending);
  // Preload all manifests before mutation; an interrupted operation resumes from the same immutable document.
  const slots = await Promise.all(publicationSlots(history).map(async slot => ({ ...slot, images: await Promise.all(slot.names.map(async name => {
    const image = await registry.get(repository(name), slot.record.release.images[name]!.digest);
    if (!image) throw new Error('Incomplete release: image missing.');
    return { name, image };
  })), document: await registry.get(releaseRepository, slot.record.digest) })));
  const names = windowArtifacts(slots);
  await registry.put(releaseRepository, document, 'keep-publishing-release');
  for (const { name, image } of slots[0]!.images) await registry.put(repository(name), image, 'keep-publishing');
  // Oldest first preserves each old slot while its successor receives the needed alias.
  for (let index = slots.length - 1; index >= 0; index--) {
    const slot = slots[index]!;
    for (const { name, image } of slot.images) await registry.put(repository(name), image, slot.tag);
    if (index) await registry.put(releaseRepository, slot.document!, `${slot.tag}-release`);
  }
  // The selector lands last. Consumers re-read all image aliases immediately before ECS deployment.
  await registry.put(releaseRepository, document, releaseSelector);
  // A narrower historical slot may retain a DNS tag from an earlier six-image window; clear it only after selector handoff.
  for (const slot of slots) for (const name of names) {
    if (!slot.names.includes(name)) await registry.removeTag(repository(name), slot.tag);
  }
  for (let index = slots.length; index <= 3; index++) {
    for (const name of names) await registry.removeTag(repository(name), `keep-mru-${index}`);
    await registry.removeTag(releaseRepository, `keep-mru-${index}-release`);
  }
  for (const name of names) await registry.removeTag(repository(name), 'keep-publishing');
  await registry.removeTag(releaseRepository, 'keep-publishing-release');
}

export async function cleanPublicationProtection(registry: Registry): Promise<boolean> {
  const current = await readRelease(registry, releaseRepository, releaseSelector);
  const staged = await readRelease(registry, releaseRepository, 'keep-publishing-release');
  if (!current || (staged && Date.parse(staged.release.promotedAt) > Date.parse(current.release.promotedAt))) return false;
  const history = await releaseHistory(registry, current);
  // Deletes do not replicate. Only an operator clears redundant destination protection after its complete aliases land.
  const slots = publicationSlots(history);
  const names = windowArtifacts(slots);
  for (const slot of slots) {
    if ((await registry.get(releaseRepository, `${slot.tag}-release`))?.digest !== slot.record.digest) return false;
    for (const name of slot.names) {
      if ((await registry.get(repository(name), slot.tag))?.digest !== slot.record.release.images[name]!.digest) return false;
    }
  }
  let changed = false;
  const remove = async (repo: string, tag: string) => {
    // A destination may retain an obsolete slot even after temporary publication protection is already gone.
    if (await registry.get(repo, tag)) { await registry.removeTag(repo, tag); changed = true; }
  };
  for (const slot of slots) for (const name of names) {
    if (!slot.names.includes(name)) await remove(repository(name), slot.tag);
  }
  for (let index = history.length; index <= 3; index++) {
    for (const name of names) await remove(repository(name), `keep-mru-${index}`);
    await remove(releaseRepository, `keep-mru-${index}-release`);
  }
  for (const name of names) await remove(repository(name), 'keep-publishing');
  await remove(releaseRepository, 'keep-publishing-release');
  return changed;
}

export async function assertPublicationOrigin(source: Registry, peers: Array<{ region: string; registry: Registry }>, report: (message: string) => void, selector = releaseSelector): Promise<void> {
  const selected = await readRelease(source, releaseRepository, selector);
  for (const peer of peers) {
    let remote;
    try { remote = await readRelease(peer.registry, releaseRepository, releaseSelector); }
    catch { report(`${peer.region}: freshness is unknown while metadata is unreachable; retain single-operator publication.`); continue; }
    if (!remote) continue;
    // Direct retained history proves ancestry. Timestamp alone cannot authorize overwriting a divergent promotion.
    if (!selected || (remote.digest !== selected.digest && !selected.release.history.includes(remote.digest))) {
      throw new Error(`Publication origin is stale or divergent from ${peer.region}; explicitly reseed before publishing.`);
    }
  }
  if (selected) for (const record of await releaseHistory(source, selected)) {
    for (const name of releaseArtifacts(record.release)) {
      const descriptor = record.release.images[name]!;
      if (!await source.get(descriptor.repository, descriptor.digest) || !await source.get(descriptor.repository, descriptor.runtimeDigest)) {
        throw new Error('Publication origin has an incomplete protected history; repair it before publishing.');
      }
    }
  }
}
