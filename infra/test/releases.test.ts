import { describe, expect, it, vi } from 'vitest';
import { bootstrapRaceIssue } from '../lib/bottlerocket-limitations.js';
import { artifacts, releaseRepository, digest, lifecyclePolicy, parseRelease, production, repository, releaseManifest, releaseSelector,
  retainHistory, readReleaseManifest, setIdentity, type Release } from '../lib/releases/model.js';
import { publicationProfile } from '../lib/releases/topology.js';
import { applyPromotion, cleanPublicationProtection, planPromotion, assertPublicationOrigin } from '../lib/releases/publication.js';
import { type Manifest, type Registry } from '../lib/releases/registry.js';
import { readiness } from '../lib/releases/gate.js';

function release(letter: string): Release {
  const hash = `sha256:${letter.repeat(64)}`;
  return { schemaVersion: 2, promotionId: `release-${letter.repeat(8)}`, promotedAt: '2026-09-21T00:00:00Z', origin: 'us-east-1',
    platform: 'linux/arm64', os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'] }, images: Object.fromEntries(artifacts.map(name => [name,
      { repository: repository(name), digest: hash, runtimeDigest: hash, buildTag: `sha-${letter.repeat(64)}` }])) as Release['images'], history: [] };
}
class MemoryRegistry implements Registry {
  readonly manifests = new Map<string, Manifest>();
  readonly tags = new Map<string, string>();
  readonly writes: string[] = [];
  async get(repo: string, ref: string) { return this.manifests.get(`${repo}/${this.tags.get(`${repo}/${ref}`) ?? ref}`); }
  async put(repo: string, manifest: Manifest, tag: string) {
    this.manifests.set(`${repo}/${manifest.digest}`, manifest); this.tags.set(`${repo}/${tag}`, manifest.digest); this.writes.push(`${repo}/${tag}`);
  }
  async removeTag(repo: string, tag: string) { this.tags.delete(`${repo}/${tag}`); }
  async add(r: Release, select = false) {
    for (const name of artifacts) await this.put(repository(name), { digest: r.images[name].digest, manifest: '{}', mediaType: 'test' }, r.images[name].buildTag);
    const text = releaseManifest(r);
    const doc = { digest: digest(text), manifest: text, mediaType: 'application/vnd.oci.image.manifest.v1+json' };
    await this.put(releaseRepository, doc, `release-${r.promotionId}`);
    if (select) await applyPromotion(this, doc);
    return doc;
  }
}

describe('app release history', () => {
  it('binds v3 launches to a qualified OS and preserves historical v2 document reads', () => {
    const old = release('a');
    expect(readReleaseManifest(releaseManifest(old))).toEqual(old);
    const selected: Release = { ...old, schemaVersion: 3, os: { ...old.os, targetVersion: '1.65.0' } };
    expect(readReleaseManifest(releaseManifest(selected))).toEqual(selected);
    expect(setIdentity(selected)).not.toEqual(setIdentity(old));
    expect(() => parseRelease({ ...selected, os: { ...selected.os, targetVersion: '9.0.0' } })).toThrow('target OS');
    expect(() => parseRelease({ ...selected, os: { ...old.os } })).toThrow('target OS');
    expect(() => parseRelease({ ...old, os: selected.os })).toThrow('target OS');
  });
  it('publishes changed qualification limitations without retaining duplicate runtime sets', async () => {
    const registry = new MemoryRegistry();
    const older = await registry.add(release('a'), true);
    const current = (await planPromotion(registry, release('b')))!;
    await registry.add(current, true);
    // The accepted availability policy must reach consumers even when the images and compatible OS are unchanged.
    const candidate = { ...current, promotionId: 'release-policy-change', os: { ...current.os, knownLimitations: [bootstrapRaceIssue] } };
    const next = (await planPromotion(registry, candidate))!;
    expect(next.os.knownLimitations).toEqual([bootstrapRaceIssue]);
    expect(next.history).toEqual([older.digest]);
    await registry.add(next, true);
    expect(await planPromotion(registry, candidate)).toBeUndefined();
  });
  it('rotates whole release sets and documents, preserves a reused initializer, and skips unchanged publication', async () => {
    const registry = new MemoryRegistry();
    const originals: Release[] = [];
    for (const letter of ['a', 'b', 'c', 'd', 'e']) {
      const candidate = release(letter); candidate.images['gateway-config'] = release('a').images['gateway-config'];
      const next = (await planPromotion(registry, candidate))!; originals.push(next);
      await applyPromotion(registry, await registry.add(next));
    }
    expect(await planPromotion(registry, originals[4]!)).toBeUndefined();
    for (const [index, letter] of ['e', 'd', 'c', 'b'].entries()) {
      const tag = index ? `keep-mru-${index}` : production;
      expect((await registry.get(repository('xray'), tag))!.digest).toBe(release(letter).images.xray.digest);
      const doc = await registry.get(releaseRepository, `${tag}-release`);
      expect(doc).toBeDefined();
      expect(JSON.parse(doc!.manifest).subject).toBeUndefined();
    }
    const older = (await planPromotion(registry, originals[2]!))!;
    expect(older.history).toHaveLength(3);
    expect(new Set(older.history).size).toBe(3);
    expect(registry.writes.at(-1)).toBe(`${releaseRepository}/${releaseSelector}`);
  });
  it('requires a complete set before any alias moves and safely resumes interruption', async () => {
    const registry = new MemoryRegistry();
    await registry.add(release('a'), true);
    const next = (await planPromotion(registry, release('b')))!;
    const doc = await registry.add(next);
    registry.manifests.delete(`${repository('awg')}/${next.images.awg.digest}`);
    const before = [...registry.tags];
    await expect(applyPromotion(registry, doc)).rejects.toThrow('missing');
    expect([...registry.tags]).toEqual(before);
    await registry.add(next);
    const original = registry.put.bind(registry);
    let interrupted = false;
    registry.put = async (repo, image, tag) => {
      if (!interrupted && repo === repository('awg') && tag === production) { interrupted = true; throw new Error('network'); }
      await original(repo, image, tag);
    };
    await expect(applyPromotion(registry, doc)).rejects.toThrow('network');
    expect(await registry.get(releaseRepository, 'keep-publishing-release')).toEqual(doc);
    await applyPromotion(registry, doc);
    expect(await registry.get(releaseRepository, releaseSelector)).toEqual(doc);
  });
  it('protects exact aliases and leaves tagged cleanup to the observation-aware publisher', () => {
    for (const name of artifacts) {
      const rules = lifecyclePolicy(name).rules;
      expect(rules.at(-1)?.selection).toEqual({ tagStatus: 'untagged', countType: 'sinceImagePushed', countUnit: 'days', countNumber: 7 });
      expect(rules.slice(0, -1).every(r => r.selection.countNumber === 1)).toBe(true);
      expect(JSON.stringify(rules)).not.toContain('keep-region');
    }
    expect(lifecyclePolicy('gateway-config').rules).toHaveLength(6);
    expect(lifecyclePolicy('releases').rules).toHaveLength(6);
  });
  it('clears destination-only obsolete slots after the complete new window lands', async () => {
    const registry = new MemoryRegistry();
    const old = await registry.add(release('a'));
    const current = await registry.add(release('b'), true);
    // ECR replicates puts, never deletion of aliases from the origin's longer prior window.
    await registry.put(releaseRepository, old, 'keep-mru-3-release');
    for (const name of artifacts) await registry.put(repository(name), (await registry.get(repository(name), release('a').images[name].digest))!, 'keep-mru-3');
    await registry.removeTag(repository('bootstrap'), production);
    expect(await cleanPublicationProtection(registry)).toBe(false);
    expect(await registry.get(releaseRepository, 'keep-mru-3-release')).toEqual(old);
    await registry.put(repository('bootstrap'), (await registry.get(repository('bootstrap'), release('b').images.bootstrap.digest))!, production);
    expect(await cleanPublicationProtection(registry)).toBe(true);
    expect(await registry.get(releaseRepository, 'keep-mru-3-release')).toBeUndefined();
    for (const name of artifacts) expect(await registry.get(repository(name), 'keep-mru-3')).toBeUndefined();
    expect(await registry.get(releaseRepository, releaseSelector)).toEqual(current);
    expect(await cleanPublicationProtection(registry)).toBe(false);
  });
  it('keeps staged protection while a newer publication has not completed', async () => {
    const registry = new MemoryRegistry(); await registry.add(release('a'), true);
    const next = { ...release('b'), promotedAt: '2026-09-22T00:00:00Z' };
    const staged = await registry.add(next);
    await registry.put(releaseRepository, staged, 'keep-publishing-release');
    expect(await cleanPublicationProtection(registry)).toBe(false);
    expect(await registry.get(releaseRepository, 'keep-publishing-release')).toEqual(staged);
  });
  it('retains dedicated whole-stack documents and shared platform components across distinct application releases', async () => {
    const registry = new MemoryRegistry();
    const old = release('a'); const next = release('b');
    next.images.bootstrap = old.images.bootstrap; next.images['network-daemon'] = old.images['network-daemon'];
    const original = await registry.add(old, true);
    next.history = [original.digest]; const current = await registry.add(next, true);
    expect(await registry.get(releaseRepository, releaseSelector)).toEqual(current);
    expect(await registry.get(releaseRepository, 'keep-mru-1-release')).toEqual(original);
    expect((await registry.get(repository('bootstrap'), production))?.digest).toBe(old.images.bootstrap.digest);
    expect((await registry.get(repository('bootstrap'), 'keep-mru-1'))?.digest).toBe(old.images.bootstrap.digest);
    expect(await registry.get(repository('gateway-config'), releaseSelector)).toBeUndefined();
  });
  it('rejects documents that redirect a container to unowned images or unsupported platforms', () => {
    const bad = release('a'); bad.images.awg.repository = 'foreign/awg';
    expect(() => parseRelease(bad)).toThrow();
    expect(() => parseRelease({ ...release('a'), platform: 'linux/amd64' })).toThrow();
    expect(() => parseRelease({ ...release('a'), unexpected: 'untracked input' })).toThrow('Unknown');
  });
  it('does not consume history for changed index provenance around identical runtime children', async () => {
    const registry = new MemoryRegistry(); const first = release('a'); await registry.add(first, true);
    const next = release('b');
    for (const name of artifacts) next.images[name].runtimeDigest = first.images[name].runtimeDigest;
    expect(await planPromotion(registry, next)).toBeUndefined();
  });
});

it('requires every local alias and exact ARM64 child before deliberate promotion', async () => {
  const registry = new MemoryRegistry(); const r = release('a');
  await registry.add(r, true); expect((await readiness(registry)).ready).toBe(true);
  await registry.removeTag(repository('bootstrap'), production);
  expect(await readiness(registry)).toMatchObject({ready:false,reason:'bootstrap production alias is not ready.'});
});

describe('publication profile', () => {
  it('defaults to retained NVA/London and preserves explicit membership overrides', () => {
    expect(publicationProfile({}).members).toEqual(['us-east-1', 'eu-west-2']);
    expect(publicationProfile({}).retainedMembers).toEqual(['us-east-1', 'eu-west-2']);
    expect(publicationProfile({ members: ['eu-north-1'], retainedMembers: [] }).members).toEqual(['eu-north-1']);
    expect(() => publicationProfile({ members: ['eu-north-1'] })).toThrow();
  });
});

describe('any-member origin freshness', () => {
  it('rejects a stale or divergent origin and permits a known newer complete source', async () => {
    const source = new MemoryRegistry(); const peer = new MemoryRegistry();
    const first = release('a'); await source.add(first,true); await peer.add(first,true);
    const next = (await planPromotion(peer,release('b')))!; await peer.add(next,true);
    await expect(assertPublicationOrigin(source,[{region:'eu-west-2',registry:peer}],()=>{})).rejects.toThrow('stale or divergent');
    await expect(assertPublicationOrigin(peer,[{region:'us-east-1',registry:source}],()=>{})).resolves.toBeUndefined();
    const divergent = new MemoryRegistry(); await divergent.add(release('c'),true);
    await expect(assertPublicationOrigin(peer,[{region:'eu-north-1',registry:divergent}],()=>{})).rejects.toThrow('divergent');
  });
  it('reports unreachable peers without pretending global freshness and requires locally complete history', async () => {
    const source = new MemoryRegistry(); const peer = new MemoryRegistry(); await source.add(release('a'),true);
    peer.get = async () => { throw new Error('unreachable'); }; const report = vi.fn();
    await assertPublicationOrigin(source,[{region:'eu-west-2',registry:peer}],report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('freshness is unknown'));
    source.manifests.delete(`${repository('awg')}/${release('a').images.awg.digest}`);
    await expect(assertPublicationOrigin(source,[],report)).rejects.toThrow('incomplete protected history');
  });
});
