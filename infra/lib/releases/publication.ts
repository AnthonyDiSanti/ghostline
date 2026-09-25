import { artifacts, releaseRepository, production, releaseSelector, repository, retainHistory, setIdentity, type Release } from './model.js';
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

export async function planPromotion(registry: Registry, candidate: Release): Promise<Release | undefined> {
  // Publication owns app history. Regional success/rollback never influences these aliases.
  const current = await readRelease(registry, releaseRepository, releaseSelector);
  if (current && setIdentity(current.release) === setIdentity(candidate)) return undefined;
  return { ...candidate, history: retainHistory(candidate, current ? await releaseHistory(registry, current) : []) };
}

export async function applyPromotion(registry: Registry, document: Manifest): Promise<void> {
  const pending = await readRelease(registry, releaseRepository, document.digest);
  if (!pending) throw new Error('Upload the immutable release document before promotion.');
  const history = await releaseHistory(registry, pending);
  // Preload all manifests before mutation; an interrupted operation resumes from the same immutable document.
  const slots = await Promise.all(history.map(async item => ({ ...item, images: await Promise.all(artifacts.map(async name => {
    const image = await registry.get(repository(name), item.release.images[name].digest);
    if (!image) throw new Error('Incomplete release: image missing.');
    return { name, image };
  })), document: await registry.get(releaseRepository, item.digest) })));
  await registry.put(releaseRepository, document, 'keep-publishing-release');
  for (const { name, image } of slots[0]!.images) await registry.put(repository(name), image, 'keep-publishing');
  // Oldest first preserves each old slot while its successor receives the needed alias.
  for (let index = slots.length - 1; index >= 0; index--) {
    const slot = slots[index]!;
    const tag = index ? `keep-mru-${index}` : production;
    for (const { name, image } of slot.images) await registry.put(repository(name), image, tag);
    if (index) await registry.put(releaseRepository, slot.document!, `${tag}-release`);
  }
  // The selector lands last. Consumers re-read all image aliases immediately before ECS deployment.
  await registry.put(releaseRepository, document, releaseSelector);
  for (let index = slots.length; index <= 3; index++) {
    for (const name of artifacts) await registry.removeTag(repository(name), `keep-mru-${index}`);
    await registry.removeTag(releaseRepository, `keep-mru-${index}-release`);
  }
  for (const name of artifacts) await registry.removeTag(repository(name), 'keep-publishing');
  await registry.removeTag(releaseRepository, 'keep-publishing-release');
}

export async function cleanPublicationProtection(registry: Registry): Promise<boolean> {
  const current = await readRelease(registry, releaseRepository, releaseSelector);
  const staged = await readRelease(registry, releaseRepository, 'keep-publishing-release');
  if (!current || (staged && Date.parse(staged.release.promotedAt) > Date.parse(current.release.promotedAt))) return false;
  const history = await releaseHistory(registry, current);
  // Deletes do not replicate. Only an operator clears redundant destination protection after its complete aliases land.
  for (const [index, record] of history.entries()) {
    const tag = index ? `keep-mru-${index}` : production;
    if ((await registry.get(releaseRepository, `${tag}-release`))?.digest !== record.digest) return false;
    for (const name of artifacts) if ((await registry.get(repository(name), tag))?.digest !== record.release.images[name].digest) return false;
  }
  let changed = false;
  const remove = async (repo: string, tag: string) => {
    // A destination may retain an obsolete slot even after temporary publication protection is already gone.
    if (await registry.get(repo, tag)) { await registry.removeTag(repo, tag); changed = true; }
  };
  for (let index = history.length; index <= 3; index++) {
    for (const name of artifacts) await remove(repository(name), `keep-mru-${index}`);
    await remove(releaseRepository, `keep-mru-${index}-release`);
  }
  for (const name of artifacts) await remove(repository(name), 'keep-publishing');
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
    for (const name of artifacts) {
      const descriptor = record.release.images[name];
      if (!await source.get(descriptor.repository, descriptor.digest) || !await source.get(descriptor.repository, descriptor.runtimeDigest)) {
        throw new Error('Publication origin has an incomplete protected history; repair it before publishing.');
      }
    }
  }
}
