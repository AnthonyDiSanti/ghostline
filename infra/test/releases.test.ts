import { describe, expect, it, vi } from 'vitest';
import { artifacts, digest, lifecyclePolicy, parseRelease, production, repository, releaseManifest, releaseSelector,
  retainHistory, type Release } from '../lib/releases/model.js';
import { publicationProfile, replicationRules } from '../lib/releases/topology.js';
import { applyPromotion, planPromotion } from '../lib/releases/publication.js';
import { type Manifest, type Registry } from '../lib/releases/registry.js';
import { assertStartReady, matches, reconcile, type Attempt, type GatePorts, type ServiceSnapshot } from '../lib/releases/gate.js';

function release(letter: string): Release {
  const hash = `sha256:${letter.repeat(64)}`;
  return { schemaVersion: 1, promotionId: `release-${letter.repeat(8)}`, promotedAt: '2026-09-21T00:00:00Z', origin: 'us-east-1',
    platform: 'linux/arm64', images: Object.fromEntries(artifacts.map(name => [name,
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
    await this.put(repository('gateway-config'), doc, `release-${r.promotionId}`);
    if (select) await applyPromotion(this, doc);
    return doc;
  }
}

describe('app release history', () => {
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
      const doc = await registry.get(repository('gateway-config'), `${tag}-release`);
      expect(doc).toBeDefined();
      expect(JSON.parse(doc!.manifest).subject).toBeUndefined();
    }
    const older = (await planPromotion(registry, originals[2]!))!;
    expect(older.history).toHaveLength(3);
    expect(new Set(older.history).size).toBe(3);
    expect(registry.writes.at(-1)).toBe(`${repository('gateway-config')}/${releaseSelector}`);
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
    expect(await registry.get(repository('gateway-config'), 'keep-publishing-release')).toEqual(doc);
    await applyPromotion(registry, doc);
    expect(await registry.get(repository('gateway-config'), releaseSelector)).toEqual(doc);
  });
  it('uses exact protection aliases followed by seven-day cleanup of tagged and untagged garbage', () => {
    for (const name of artifacts) {
      const rules = lifecyclePolicy(name).rules;
      expect(rules.at(-1)?.selection).toEqual({ tagStatus: 'any', countType: 'sinceImagePushed', countUnit: 'days', countNumber: 7 });
      expect(rules.slice(0, -1).every(r => r.selection.countNumber === 1)).toBe(true);
      expect(JSON.stringify(rules)).not.toContain('keep-region');
    }
    expect(lifecyclePolicy('gateway-config').rules).toHaveLength(11);
  });
  it('rejects documents that redirect a container to unowned images or unsupported platforms', () => {
    const bad = release('a'); bad.images.awg.repository = 'foreign/awg';
    expect(() => parseRelease(bad)).toThrow();
    expect(() => parseRelease({ ...release('a'), platform: 'linux/amd64' })).toThrow();
  });
});

async function fixture() {
  const registry = new MemoryRegistry();
  const selected = release('a'); const doc = await registry.add(selected, true);
  let snapshot: ServiceSnapshot | undefined = { incarnation: 'service/created-1', desired: 1, stable: true, busy: false,
    images: Object.fromEntries(artifacts.map(n => [n, release('b').images[n].digest])), deployments: [{ id: 'old', status: 'SUCCESSFUL', createdAt: 1 }] };
  let record: Attempt | undefined;
  let now = 100_000;
  const ports: GatePorts = { registry, service: vi.fn(async () => snapshot), attempt: async () => record,
    save: vi.fn(async (next, previous) => {
      if (record?.version !== previous?.version) return false;
      record = structuredClone(next); return true;
    }), force: vi.fn(async () => {}), alert: vi.fn(async () => {}), now: () => now };
  return { ports, registry, selected, doc, snapshot: () => snapshot!, setSnapshot: (s: ServiceSnapshot | undefined) => { snapshot = s; },
    record: () => record!, setRecord: (r: Attempt) => { record = r; }, advance: () => { now += 180_000; } };
}
describe('regional readiness gate', () => {
  it('normalizes ECS index identities without accepting an unrelated ARM64 child', () => {
    const r = release('a'); r.images.awg.runtimeDigest = release('b').images.awg.digest;
    const images = Object.fromEntries(artifacts.map(n => [n, r.images[n].digest]));
    expect(matches(images, r)).toBe(true);
    images.awg = r.images.awg.runtimeDigest; expect(matches(images, r)).toBe(true);
    images.awg = release('c').images.awg.digest; expect(matches(images, r)).toBe(false);
  });
  it('forces once and observes completion on a later event/hourly tick', async () => {
    const f = await fixture();
    expect(await reconcile(f.ports)).toBe('deployment-requested');
    expect(await reconcile(f.ports)).toBe('deployment-in-progress');
    f.snapshot().images = Object.fromEntries(artifacts.map(n => [n, f.selected.images[n].runtimeDigest]));
    expect(await reconcile(f.ports)).toBe('already-running');
    expect(f.record().state).toBe('completed');
    expect(f.ports.force).toHaveBeenCalledTimes(1);
  });
  it.each(['stopped', 'absent', 'busy', 'partial', 'already-running'])('does not deploy %s state', async mode => {
    const f = await fixture();
    if (mode === 'stopped') f.snapshot().desired = 0;
    if (mode === 'absent') f.setSnapshot(undefined);
    if (mode === 'busy') f.snapshot().busy = true;
    if (mode === 'partial') await f.registry.removeTag(repository('awg'), production);
    if (mode === 'already-running') f.snapshot().images = Object.fromEntries(artifacts.map(n => [n, f.selected.images[n].runtimeDigest]));
    await reconcile(f.ports); expect(f.ports.force).not.toHaveBeenCalled();
  });
  it('cancels when an alias changes after the claim, before the force request', async () => {
    const f = await fixture();
    const save = f.ports.save;
    f.ports.save = async (next, previous) => {
      const saved = await save(next, previous);
      if (next.state === 'claimed') await f.registry.removeTag(repository('xray'), production);
      return saved;
    };
    expect(await reconcile(f.ports)).toBe('state-changed'); expect(f.record().state).toBe('cancelled');
    expect(f.ports.force).not.toHaveBeenCalled();
  });
  it('suppresses native rollback retries even after service recreation', async () => {
    const f = await fixture(); await reconcile(f.ports);
    f.snapshot().deployments.push({ id: 'new', status: 'ROLLBACK_SUCCESSFUL', createdAt: 100_005 });
    expect(await reconcile(f.ports)).toBe('paused-failed');
    f.snapshot().incarnation = 'service/created-2';
    expect(await reconcile(f.ports)).toBe('paused-failed');
    await expect(assertStartReady(f.ports)).rejects.toThrow('unresolved');
    expect(f.ports.force).toHaveBeenCalledTimes(1);
  });
  it('pauses ambiguous calls rather than blindly retrying', async () => {
    const f = await fixture(); f.ports.force = vi.fn(async () => { throw new Error('timeout'); });
    expect(await reconcile(f.ports)).toBe('paused-ambiguous');
    expect(await reconcile(f.ports)).toBe('paused-ambiguous');
    expect(f.ports.force).toHaveBeenCalledTimes(1);
  });
  it('detects a lost acknowledgement or mismatched completed digest', async () => {
    const f = await fixture(); await reconcile(f.ports); f.advance();
    expect(await reconcile(f.ports)).toBe('paused-ambiguous');
    expect(f.ports.force).toHaveBeenCalledTimes(1);
  });
  it('allows a newer release despite an older ambiguous attempt', async () => {
    const f = await fixture();
    f.ports.attempt = async hash => hash === f.doc.digest ? undefined : { ...f.record(), state: 'ambiguous' };
    expect(await reconcile(f.ports)).toBe('deployment-requested');
  });
});

describe('publication topology', () => {
  it('defaults to NVA/London and preserves overrides', () => {
    expect(publicationProfile({}).primaryRegion).toBe('us-east-1');
    expect(publicationProfile({}).disasterRecoveryRegion).toBe('eu-west-2');
    expect(publicationProfile({ primaryRegion: 'eu-north-1' }).primaryRegion).toBe('eu-north-1');
    expect(() => publicationProfile({ disasterRecoveryRegion: 'us-east-1' })).toThrow();
  });
  it('gives both origins direct peers/subscribers and preserves unrelated registry filters', () => {
    const profile = publicationProfile({ subscribers: ['eu-north-1', 'af-south-1'] });
    const other = { destinations: [{ region: 'us-west-2', registryId: '111111111111' }], repositoryFilters: [
      { filter: 'personal-assistant/', filterType: 'PREFIX_MATCH' as const }, { filter: 'ghostline/prod/', filterType: 'PREFIX_MATCH' as const }] };
    const rules = replicationRules([other], profile, '111111111111', profile.primaryRegion, 'ghostline/prod/');
    expect(rules[0]?.repositoryFilters).toEqual([other.repositoryFilters[0]]);
    expect(rules[1]?.destinations.map(d => d.region)).toEqual(['af-south-1', 'eu-north-1', 'eu-west-2']);
    expect(replicationRules(rules, profile, '111111111111', profile.primaryRegion, 'ghostline/prod/')).toEqual(rules);
  });
});
