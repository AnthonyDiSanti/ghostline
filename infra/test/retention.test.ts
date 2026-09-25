import { expect, it } from 'vitest';
import { artifacts, releaseRepository, repository, type Release } from '../lib/releases/model.js';
import { planArtifactCleanup, type ArtifactInventory } from '../lib/releases/retention.js';
const hash = (letter: string) => `sha256:${letter.repeat(64)}`;
const now = 20 * 24 * 60 * 60_000;
function fixture() {
  const release: Release = { schemaVersion: 2, promotionId: 'retention-test', origin: 'us-east-1', promotedAt: '2026-09-22T00:00:00Z',
    platform: 'linux/arm64', os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'] }, history: [],
    images: Object.fromEntries(artifacts.map(name => [name, { repository: repository(name), digest: hash('a'), runtimeDigest: hash('a'), buildTag: `sha-${'a'.repeat(64)}` }])) as Release['images'] };
  const window = [{ digest: hash('f'), release }];
  const inventory: ArtifactInventory[] = [...artifacts.map(name => ({ repository: repository(name), digest: hash('a'), pushedAt: 0, tags: ['sha-old'], children: [] })),
    { repository: releaseRepository, digest: hash('f'), pushedAt: 0, tags: ['release-old'], children: [] }];
  const extra = (letter: string, children: string[] = []): ArtifactInventory => ({ repository: repository('bootstrap'), digest: hash(letter), pushedAt: 0, tags: ['sha-candidate'], children: children.map(hash) });
  return { window, inventory, extra };
}
it('preserves a parked bootstrap and its children beyond the global release window', () => {
  const f = fixture(); f.inventory.push(f.extra('b',['c']),f.extra('c'),f.extra('d'));
  const result = planArtifactCleanup(f.inventory, f.window, [{ repository: repository('bootstrap'), digest: hash('b') }], true, now);
  expect(result.remove).toEqual([{ repository: repository('bootstrap'), digest: hash('d') }]);
});
it('refuses collection with unknown runtime observations or missing protected artifacts', () => {
  const f = fixture(); f.inventory.push(f.extra('b'));
  expect(planArtifactCleanup(f.inventory, f.window, [], false, now).remove).toEqual([]);
  f.inventory.shift(); expect(planArtifactCleanup(f.inventory, f.window, [], true, now).reason).toContain('missing');
});
it('bounds collection and deletes an obsolete index before its child manifests', () => {
  const f = fixture(); f.inventory.push(f.extra('b',['c']),f.extra('c'));
  expect(planArtifactCleanup(f.inventory, f.window, [], true, now, 1).remove).toEqual([{ repository: repository('bootstrap'), digest: hash('b') }]);
  expect(planArtifactCleanup(f.inventory, f.window, [], true, now).remove.map(r => r.digest)).toEqual([hash('b'),hash('c')]);
});
it('protects recent and interrupted-publication parents including old shared children', () => {
  const f = fixture(); const parent = f.extra('b',['c']); parent.tags = ['keep-publishing'];
  const recent = f.extra('d',['e']); recent.pushedAt = now;
  f.inventory.push(parent,f.extra('c'),recent,f.extra('e'));
  expect(planArtifactCleanup(f.inventory, f.window, [], true, now).remove).toEqual([]);
});
it('requires the full bounded historical document window and excludes other projects', () => {
  const f = fixture(); f.window[0]!.release.history = [hash('e')];
  expect(planArtifactCleanup(f.inventory, f.window, [], true, now).reason).toContain('document');
  f.inventory.push({...f.extra('b'),repository:'another/project'});
  expect(() => planArtifactCleanup(f.inventory, f.window, [], true, now)).toThrow('unowned');
});
