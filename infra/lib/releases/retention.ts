import { artifacts, parseRelease, releaseRepository, repository, repositoryArtifacts, type Release } from './model.js';

export interface ArtifactReference { repository: string; digest: string }
export interface ArtifactInventory extends ArtifactReference { tags: string[]; pushedAt: number; children: string[] }
export interface RetentionPlan { remove: ArtifactReference[]; reason?: string }
const key = (ref: ArtifactReference) => `${ref.repository}@${ref.digest}`;

export function planArtifactCleanup(inventory: ArtifactInventory[], window: Array<{ digest: string; release: Release }>,
  observed: ArtifactReference[], observationsComplete: boolean, now: number, limit = 20): RetentionPlan {
  // Missing regional observations are uncertainty, not permission to delete the recovery image of a parked/lagging host.
  if (!observationsComplete || !window.length || window.length > 4) return { remove: [], reason: 'Protected release or runtime observations are incomplete.' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid cleanup bound.');
  const repositories = new Set(repositoryArtifacts.map(repository));
  if (inventory.some(item => !repositories.has(item.repository))) throw new Error('Cleanup inventory includes an unowned repository.');
  const items = new Map(inventory.map(item => [key(item), item]));
  if (items.size !== inventory.length) throw new Error('Duplicate cleanup inventory identity.');
  const protectedKeys = new Set<string>();
  const protect = (ref: ArtifactReference) => {
    const identity = key(ref);
    if (protectedKeys.has(identity)) return;
    protectedKeys.add(identity);
    // Native index/reference relationships are repository-local; protect every child, including attestations.
    for (const digest of items.get(identity)?.children ?? []) protect({ repository: ref.repository, digest });
  };
  if (window[0]!.release.history.some(hash => !window.some(record => record.digest === hash))) {
    return { remove: [], reason: 'A retained release document is unavailable.' };
  }
  for (const record of window) {
    parseRelease(record.release);
    protect({ repository: releaseRepository, digest: record.digest });
    for (const name of artifacts) {
      const image = record.release.images[name];
      protect(image); protect({ repository: image.repository, digest: image.runtimeDigest });
    }
  }
  for (const ref of observed) {
    if (!repositories.has(ref.repository)) throw new Error('Observed reference is outside owned repositories.');
    protect(ref);
  }
  for (const item of inventory) if (item.tags.some(tag => tag.startsWith('keep-'))) protect(item);
  if ([...protectedKeys].some(identity => !items.has(identity))) return { remove: [], reason: 'A protected artifact is missing locally.' };
  // Delete parents before children. An unselected or recent parent continues to protect its referenced artifacts.
  const remaining = new Map(items);
  const remove: ArtifactReference[] = [];
  while (remove.length < limit) {
    const referenced = new Set([...remaining.values()].flatMap(item => item.children.map(digest => key({ repository: item.repository, digest }))));
    const candidate = [...remaining.values()].filter(item => !protectedKeys.has(key(item)) && !referenced.has(key(item))
      && Number.isFinite(item.pushedAt) && item.pushedAt < now - 7 * 24 * 60 * 60_000)
      .sort((a, b) => a.pushedAt - b.pushedAt || key(a).localeCompare(key(b)))[0];
    if (!candidate) break;
    remove.push({ repository: candidate.repository, digest: candidate.digest }); remaining.delete(key(candidate));
  }
  return { remove };
}
