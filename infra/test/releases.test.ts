import { describe, expect, it, vi } from 'vitest';
import { bootstrapRaceIssue } from '../lib/bottlerocket-limitations.js';
import { dnsReleaseArtifacts, legacyReleaseArtifacts } from '../lib/image-artifacts.js';
import { artifacts, releaseArtifacts, releaseRepository, digest, lifecyclePolicy, parseRelease, production, repository, releaseManifest, releaseSelector,
  retainHistory, readReleaseManifest, setIdentity, type Release } from '../lib/releases/model.js';
import { publicationProfile } from '../lib/releases/topology.js';
import { applyPromotion, cleanPublicationProtection, planPromotion, publicationSelection, assertPublicationSchema, publicationSlots, releaseTransferPlan,
  seedReleaseHistory, assertPublicationOrigin } from '../lib/releases/publication.js';
import { EcrRegistry, type Manifest, type Registry } from '../lib/releases/registry.js';
import { aliasReadiness, assertStartReady, readiness } from '../lib/releases/gate.js';

it('selects six-image publication only when every maintained endpoint opts into DNS', () => {
  expect(publicationSelection([false, false])).toMatchObject({ schemaVersion: 3, admission: 'five-image', names: legacyReleaseArtifacts });
  expect(publicationSelection([true, true])).toMatchObject({ schemaVersion: 4, admission: 'dns-migration-trial', names: dnsReleaseArtifacts });
  expect(() => publicationSelection([true, false])).toThrow('agree on the DNS release schema');
  expect(() => publicationSelection([])).toThrow('agree on the DNS release schema');
  expect(() => assertPublicationSchema(4, release('a'))).toThrow('differs from maintained gateway');
  expect(() => assertPublicationSchema(3, dnsRelease('a'))).toThrow('differs from maintained gateway');
  expect(() => assertPublicationSchema(4, dnsRelease('a'))).not.toThrow();
});

function release(letter: string): Release {
  const hash = `sha256:${letter.repeat(64)}`;
  return { schemaVersion: 2, promotionId: `release-${letter.repeat(8)}`, promotedAt: '2026-09-21T00:00:00Z', origin: 'us-east-1',
    platform: 'linux/arm64', os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'] }, images: Object.fromEntries(legacyReleaseArtifacts.map(name => [name,
      { repository: repository(name), digest: hash, runtimeDigest: hash, buildTag: `sha-${letter.repeat(64)}` }])) as Release['images'], history: [] };
}
function dnsRelease(letter: string): Release {
  const old = release(letter);
  return { ...old, schemaVersion: 4, os: { ...old.os, targetVersion: '1.65.0' },
    images: { ...old.images, 'dns-policy': { repository: repository('dns-policy'), digest: `sha256:${'f'.repeat(64)}`,
      runtimeDigest: `sha256:${'f'.repeat(64)}`, buildTag: `sha-${'f'.repeat(64)}` } } };
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
    for (const name of releaseArtifacts(r)) await this.put(repository(name), { digest: r.images[name]!.digest, manifest: '{}', mediaType: 'test' }, r.images[name]!.buildTag);
    const text = releaseManifest(r);
    const doc = { digest: digest(text), manifest: text, mediaType: 'application/vnd.oci.image.manifest.v1+json' };
    await this.put(releaseRepository, doc, `release-${r.promotionId}`);
    if (select) await applyPromotion(this, doc);
    return doc;
  }
}

describe('app release history', () => {
  it('reads exact DNS-bearing v4 documents without admitting them to the five-image controller', async () => {
    const old = release('a');
    const next = dnsRelease('a');
    expect(releaseArtifacts(old)).toEqual(legacyReleaseArtifacts);
    expect(releaseArtifacts(next)).toEqual(dnsReleaseArtifacts);
    expect(readReleaseManifest(releaseManifest(next))).toEqual(next);
    expect(setIdentity(next)).not.toBe(setIdentity({ ...next, schemaVersion: 3, images: old.images }));
    expect(() => parseRelease({ ...next, images: old.images })).toThrow();
    expect(() => parseRelease({ ...next, images: { ...next.images, extra: next.images.xray } })).toThrow();
    expect(() => parseRelease({ ...next, images: { ...next.images, 'dns-policy': next.images.xray } })).toThrow();
    expect(() => parseRelease({ ...old, schemaVersion: 3, images: next.images,
      os: { ...old.os, targetVersion: '1.65.0' } })).toThrow();
    const registry = new MemoryRegistry();
    const document = await registry.add(next);
    await registry.put(releaseRepository, document, releaseSelector);
    expect(await readiness(registry)).toMatchObject({ ready: false, reason: expect.stringContaining('Five-image gateway') });
    expect(await readiness(registry, true)).toMatchObject({ ready: false, reason: expect.stringContaining('production alias') });
    await expect(planPromotion(registry, old)).rejects.toThrow('not enabled');
    await expect(applyPromotion(registry, document)).rejects.toThrow('not enabled');
  });
  it('allows exact six-image aliases only for a DNS-enabled target', async () => {
    // Isolated runtime qualification can exercise the normal controller without admitting v4 on five-image endpoints.
    const registry = new MemoryRegistry(); const next = dnsRelease('a');
    const document = await registry.add(next);
    await registry.put(releaseRepository, document, releaseSelector);
    for (const name of releaseArtifacts(next)) {
      await registry.put(repository(name), (await registry.get(repository(name), next.images[name]!.digest))!, production);
    }
    expect((await readiness(registry, true)).ready).toBe(true);
    expect(await readiness(registry)).toMatchObject({ ready: false, reason: expect.stringContaining('Five-image gateway') });
    const ports = { registry, record: async <T>(_key: string): Promise<T | undefined> => undefined };
    await expect(assertStartReady(ports, true)).resolves.toBeUndefined();
    await expect(assertStartReady(ports)).rejects.toThrow('Five-image gateway');
    await registry.removeTag(repository('dns-policy'), production);
    expect(await readiness(registry, true)).toMatchObject({ ready: false, reason: 'dns-policy production alias is not ready.' });
  });
  it('plans mixed release aliases by document and removes stale DNS tags only after complete readback', async () => {
    // A v3 MRU slot must not acquire a DNS alias left by an older six-image publication.
    const registry = new MemoryRegistry();
    const older = { ...release('a'), schemaVersion: 3 as const,
      os: { ...release('a').os, targetVersion: '1.65.0' } };
    const oldDocument = await registry.add(older);
    const current = { ...dnsRelease('b'), history: [oldDocument.digest] };
    const currentDocument = await registry.add(current);
    const slots = publicationSlots([{ digest: currentDocument.digest, release: current },
      { digest: oldDocument.digest, release: older }]);
    expect(slots.map(slot => [slot.tag, slot.names])).toEqual([
      [production, dnsReleaseArtifacts], ['keep-mru-1', legacyReleaseArtifacts],
    ]);
    await registry.put(releaseRepository, currentDocument, releaseSelector);
    await registry.put(releaseRepository, oldDocument, 'keep-mru-1-release');
    for (const name of releaseArtifacts(current)) await registry.put(repository(name), (await registry.get(repository(name), current.images[name]!.digest))!, production);
    for (const name of releaseArtifacts(older)) await registry.put(repository(name), (await registry.get(repository(name), older.images[name]!.digest))!, 'keep-mru-1');
    const dnsImage = (await registry.get(repository('dns-policy'), current.images['dns-policy']!.digest))!;
    await registry.put(repository('dns-policy'), dnsImage, 'keep-mru-1');
    await registry.put(repository('dns-policy'), dnsImage, 'keep-publishing');
    await registry.removeTag(repository('awg'), 'keep-mru-1');
    expect(await cleanPublicationProtection(registry)).toBe(false);
    expect(await registry.get(repository('dns-policy'), 'keep-mru-1')).toEqual(dnsImage);
    await registry.put(repository('awg'), (await registry.get(repository('awg'), older.images.awg.digest))!, 'keep-mru-1');
    expect(await cleanPublicationProtection(registry)).toBe(true);
    expect(await registry.get(repository('dns-policy'), 'keep-mru-1')).toBeUndefined();
    expect(await registry.get(repository('dns-policy'), 'keep-publishing')).toBeUndefined();
    expect(await registry.get(repository('dns-policy'), production)).toEqual(dnsImage);
  });
  it('rotates v3 to v4 and back with exact per-slot aliases under explicit qualification', async () => {
    const registry = new MemoryRegistry();
    const old = { ...release('a'), schemaVersion: 3 as const,
      os: { ...release('a').os, targetVersion: '1.65.0' } };
    const oldDocument = await registry.add(old, true);
    const candidate = (await planPromotion(registry, dnsRelease('b'), 'dns-migration-trial'))!;
    expect(candidate.history).toEqual([oldDocument.digest]);
    const dnsDocument = await registry.add(candidate);
    await expect(applyPromotion(registry, dnsDocument)).rejects.toThrow('not enabled');
    await applyPromotion(registry, dnsDocument, 'dns-migration-trial');
    expect((await readiness(registry, true)).ready).toBe(true);
    expect(await registry.get(repository('dns-policy'), 'keep-mru-1')).toBeUndefined();
    expect((await registry.get(releaseRepository, 'keep-mru-1-release'))?.digest).toBe(oldDocument.digest);

    // A rollback publication retains the six-image generation without giving the five-image slot a DNS alias.
    const newer = { ...release('c'), schemaVersion: 3 as const,
      os: { ...release('c').os, targetVersion: '1.65.0' } };
    const rollback = (await planPromotion(registry, newer, 'dns-migration-trial'))!;
    expect(rollback.history).toEqual([dnsDocument.digest, oldDocument.digest]);
    const rollbackDocument = await registry.add(rollback);
    await applyPromotion(registry, rollbackDocument, 'dns-migration-trial');
    expect((await readiness(registry)).ready).toBe(true);
    expect(await registry.get(repository('dns-policy'), production)).toBeUndefined();
    expect((await registry.get(repository('dns-policy'), 'keep-mru-1'))?.digest).toBe(candidate.images['dns-policy']!.digest);
    expect(await registry.get(repository('dns-policy'), 'keep-mru-2')).toBeUndefined();
    expect((await registry.get(releaseRepository, releaseSelector))?.digest).toBe(rollbackDocument.digest);
  });
  it('preloads all six images before changing a v4 selector', async () => {
    const registry = new MemoryRegistry();
    const old = { ...release('a'), schemaVersion: 3 as const,
      os: { ...release('a').os, targetVersion: '1.65.0' } };
    await registry.add(old, true);
    const candidate = (await planPromotion(registry, dnsRelease('b'), 'dns-migration-trial'))!;
    const document = await registry.add(candidate);
    registry.manifests.delete(`${repository('dns-policy')}/${candidate.images['dns-policy']!.digest}`);
    const before = [...registry.tags];
    await expect(applyPromotion(registry, document, 'dns-migration-trial')).rejects.toThrow('missing');
    expect([...registry.tags]).toEqual(before);
    await registry.add(candidate);
    await applyPromotion(registry, document, 'dns-migration-trial');
    expect((await readiness(registry, true)).ready).toBe(true);
  });
  it('seeds a mixed v4/v3 window only under trial admission and resumes a failed copy', async () => {
    const source = new MemoryRegistry(); const target = new MemoryRegistry();
    const old = { ...release('a'), schemaVersion: 3 as const,
      os: { ...release('a').os, targetVersion: '1.65.0' } };
    const oldDocument = await source.add(old, true);
    const current = (await planPromotion(source, dnsRelease('b'), 'dns-migration-trial'))!;
    const currentDocument = await source.add(current);
    await applyPromotion(source, currentDocument, 'dns-migration-trial');
    const copied: string[] = [];
    let interrupted = true;
    const copy = async (repo: string, imageDigest: string, tag: string) => {
      if (interrupted && repo === repository('dns-policy')) {
        interrupted = false; throw new Error('copy interrupted');
      }
      const manifest = await source.get(repo, imageDigest);
      if (!manifest) throw new Error('Source image missing.');
      await target.put(repo, manifest, tag);
      copied.push(`${repo}/${tag}`);
    };
    await expect(seedReleaseHistory(source, target, copy)).rejects.toThrow('not enabled');
    expect(copied).toEqual([]);
    await expect(seedReleaseHistory(source, target, copy, 'dns-migration-trial')).rejects.toThrow('copy interrupted');
    expect(await target.get(releaseRepository, releaseSelector)).toBeUndefined();
    await seedReleaseHistory(source, target, copy, 'dns-migration-trial');
    expect((await readiness(target, true)).ready).toBe(true);
    expect((await target.get(releaseRepository, 'keep-mru-1-release'))?.digest).toBe(oldDocument.digest);
    expect(await target.get(repository('dns-policy'), 'keep-mru-1')).toBeUndefined();
    expect(copied).toContain(`${repository('dns-policy')}/${current.images['dns-policy']!.buildTag}`);
  });
  it('refuses to select a transferred snapshot when the source changes during seeding', async () => {
    const source = new MemoryRegistry(); const target = new MemoryRegistry();
    await source.add(release('a'), true);
    let changed = false;
    const copy = async (repo: string, imageDigest: string, tag: string) => {
      const manifest = await source.get(repo, imageDigest);
      if (!manifest) throw new Error('Source image missing.');
      await target.put(repo, manifest, tag);
      if (!changed) {
        changed = true;
        await source.add(release('b'), true);
      }
    };
    await expect(seedReleaseHistory(source, target, copy)).rejects.toThrow('Seed source changed');
    expect(await target.get(releaseRepository, releaseSelector)).toBeUndefined();
  });
  it('retains the DNS artifact when seeding a five-image current release with six-image history', () => {
    const current = { ...release('b'), schemaVersion: 3 as const,
      os: { ...release('b').os, targetVersion: '1.65.0' } };
    const prior = dnsRelease('a');
    const transfers = releaseTransferPlan([{ digest: `sha256:${'b'.repeat(64)}`, release: current },
      { digest: `sha256:${'a'.repeat(64)}`, release: prior }]);
    expect(transfers.map(slot => slot.images.map(item => item.name))).toEqual([legacyReleaseArtifacts, dnsReleaseArtifacts]);
    expect(transfers[1]!.images.at(-1)).toEqual({ name: 'dns-policy', image: prior.images['dns-policy'] });
  });
  it('uploads a v4 document only under its candidate identity tag', async () => {
    // Uploading immutable bytes is preparatory; publication aliases remain guarded elsewhere.
    const registry = new EcrRegistry({} as ConstructorParameters<typeof EcrRegistry>[0], '000000000000', 'us-east-1');
    const upload = vi.spyOn(registry, 'uploadBlob').mockResolvedValue(undefined);
    const put = vi.spyOn(registry, 'put').mockResolvedValue(undefined);
    const candidate = dnsRelease('a');
    await expect(registry.putRelease(releaseRepository, candidate, production)).rejects.toThrow('identity tag');
    expect(upload).not.toHaveBeenCalled();
    const document = await registry.putRelease(releaseRepository, candidate, `release-${candidate.promotionId}`);
    expect(readReleaseManifest(document.manifest)).toEqual(candidate);
    expect(put).toHaveBeenCalledWith(releaseRepository, document, `release-${candidate.promotionId}`);
    expect(upload).toHaveBeenCalledTimes(2);
    await expect(registry.putRelease(releaseRepository, release('b'), 'release-old')).rejects.toThrow('qualified target OS');
  });
  it('checks all six local aliases and the DNS ARM64 child without admitting v4 to five-image gateways', async () => {
    const registry = new MemoryRegistry(); const next = dnsRelease('a');
    const document = await registry.add(next);
    await registry.put(releaseRepository, document, releaseSelector);
    for (const name of releaseArtifacts(next)) await registry.put(repository(name),
      (await registry.get(repository(name), next.images[name]!.digest))!, production);
    const record = { digest: document.digest, release: next };
    expect(await aliasReadiness(registry, record)).toEqual({ ready: true });
    expect((await readiness(registry)).ready).toBe(false);
    await registry.removeTag(repository('dns-policy'), production);
    expect(await aliasReadiness(registry, record)).toEqual({ ready: false, reason: 'dns-policy production alias is not ready.' });
    const root = next.images['dns-policy']!;
    root.runtimeDigest = `sha256:${'e'.repeat(64)}`;
    await registry.put(repository('dns-policy'), { digest: root.digest, mediaType: 'test',
      manifest: JSON.stringify({ manifests: [{ platform: { os: 'linux', architecture: 'arm64' }, digest: root.runtimeDigest }] }) }, production);
    expect(await aliasReadiness(registry, record)).toEqual({ ready: false, reason: 'dns-policy ARM64 child is not ready.' });
    await registry.put(repository('dns-policy'), { digest: root.runtimeDigest, mediaType: 'test', manifest: '{}' }, 'sha-child');
    expect(await aliasReadiness(registry, record)).toEqual({ ready: true });
    expect((await readiness(registry)).ready).toBe(false);
  });
  it('publishes and cleans a five-image region before its DNS repository exists', async () => {
    const registry = new MemoryRegistry();
    const get = registry.get.bind(registry);
    registry.get = async (repo, ref) => {
      if (repo === repository('dns-policy')) throw new Error('RepositoryNotFoundException');
      return get(repo, ref);
    };
    const document = await registry.add(release('a'));
    await expect(applyPromotion(registry, document)).resolves.toBeUndefined();
    await expect(cleanPublicationProtection(registry)).resolves.toBe(false);
  });
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
    // Historical documents must never silently acquire a new required image at parser upgrade time.
    const old = release('a');
    expect(() => parseRelease({ ...old, images: { ...old.images, 'dns-policy': old.images.xray } })).toThrow();
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

it('blocks DNS task activation while production still selects a five-image release', async () => {
  // The migration setting must not launch an unresolvable DNS image under a historical release.
  const registry = new MemoryRegistry();
  const old = release('a');
  await registry.add({ ...old, schemaVersion: 3, os: { ...old.os, targetVersion: '1.65.0' } }, true);
  const ports = { registry, record: async <T>(_key: string): Promise<T | undefined> => undefined };
  await expect(assertStartReady(ports, true)).rejects.toThrow('six-image production release');
  await expect(assertStartReady(ports)).resolves.toBeUndefined();
});

describe('publication profile', () => {
  it('defaults only to gateway peers and preserves explicit membership and retention', () => {
    // Retiring a publisher must not resurrect it through implicit defaults.
    expect(publicationProfile({})).toEqual({ members: [], retainedMembers: [], automation: false });
    expect(publicationProfile({}, ['eu-north-1', 'eu-north-1', 'us-west-2']).members).toEqual(['eu-north-1', 'us-west-2']);
    expect(publicationProfile({ members: ['eu-north-1'], retainedMembers: [] }).members).toEqual(['eu-north-1']);
    expect(publicationProfile({ members: [], retainedMembers: [] }).members).toEqual([]);
    expect(publicationProfile({ members: ['eu-north-1'] }).retainedMembers).toEqual([]);
    expect(publicationProfile({ members: ['eu-north-1'], retainedMembers: ['eu-north-1'] }).retainedMembers).toEqual(['eu-north-1']);
    expect(() => publicationProfile({ members: ['eu-north-1'], retainedMembers: ['us-east-1'] })).toThrow();
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
