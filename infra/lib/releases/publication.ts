import { artifacts, production, releaseSelector, repository, retainHistory, setIdentity, type Release } from './model.js';
import { readRelease, type Manifest, type Registry, type ReleaseRecord } from './registry.js';

export async function releaseHistory(registry: Registry, current: ReleaseRecord): Promise<ReleaseRecord[]> {
  const history: ReleaseRecord[] = [current];
  for (const hash of current.release.history) {
    const item = await readRelease(registry, repository('gateway-config'), hash);
    if (!item) throw new Error('Retained release document is missing.');
    history.push(item);
  }
  return history;
}

export async function planPromotion(registry: Registry, candidate: Release): Promise<Release | undefined> {
  // Publication owns app history. Regional success/rollback never influences these aliases.
  const current = await readRelease(registry, repository('gateway-config'), releaseSelector);
  if (current && setIdentity(current.release) === setIdentity(candidate)) return undefined;
  return { ...candidate, history: retainHistory(candidate, current ? await releaseHistory(registry, current) : []) };
}

export async function applyPromotion(registry: Registry, document: Manifest): Promise<void> {
  const pending = await readRelease(registry, repository('gateway-config'), document.digest);
  if (!pending) throw new Error('Upload the immutable release document before promotion.');
  const history = await releaseHistory(registry, pending);
  // Preload all manifests before mutation; an interrupted operation resumes from the same immutable document.
  const slots = await Promise.all(history.map(async item => ({ ...item, images: await Promise.all(artifacts.map(async name => {
    const image = await registry.get(repository(name), item.release.images[name].digest);
    if (!image) throw new Error('Incomplete release: image missing.');
    return { name, image };
  })), document: await registry.get(repository('gateway-config'), item.digest) })));
  await registry.put(repository('gateway-config'), document, 'keep-publishing-release');
  for (const { name, image } of slots[0]!.images) await registry.put(repository(name), image, 'keep-publishing');
  // Oldest first preserves each old slot while its successor receives the needed alias.
  for (let index = slots.length - 1; index >= 0; index--) {
    const slot = slots[index]!;
    const tag = index ? `keep-mru-${index}` : production;
    for (const { name, image } of slot.images) await registry.put(repository(name), image, tag);
    if (index) await registry.put(repository('gateway-config'), slot.document!, `${tag}-release`);
  }
  // The selector lands last. Consumers re-read all image aliases immediately before ECS deployment.
  await registry.put(repository('gateway-config'), document, releaseSelector);
  for (let index = slots.length; index <= 3; index++) {
    for (const name of artifacts) await registry.removeTag(repository(name), `keep-mru-${index}`);
    await registry.removeTag(repository('gateway-config'), `keep-mru-${index}-release`);
  }
  for (const name of artifacts) await registry.removeTag(repository(name), 'keep-publishing');
  await registry.removeTag(repository('gateway-config'), 'keep-publishing-release');
}

export async function cleanPublicationProtection(registry: Registry): Promise<boolean> {
  const current = await readRelease(registry, repository('gateway-config'), releaseSelector);
  const staged = await readRelease(registry, repository('gateway-config'), 'keep-publishing-release');
  if (!current || !staged || Date.parse(staged.release.promotedAt) > Date.parse(current.release.promotedAt)) return false;
  const history = await releaseHistory(registry, current);
  // Deletes do not replicate. Only an operator clears redundant destination protection after its complete aliases land.
  for (const [index, record] of history.entries()) {
    const tag = index ? `keep-mru-${index}` : production;
    if ((await registry.get(repository('gateway-config'), `${tag}-release`))?.digest !== record.digest) return false;
    for (const name of artifacts) if ((await registry.get(repository(name), tag))?.digest !== record.release.images[name].digest) return false;
  }
  for (const name of artifacts) await registry.removeTag(repository(name), 'keep-publishing');
  await registry.removeTag(repository('gateway-config'), 'keep-publishing-release');
  return true;
}
