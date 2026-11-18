import { expect, it } from 'vitest';
import { candidateManifest, parseCandidate, readCandidate, type CandidateTrial, type TrialCandidate } from '../lib/releases/candidates.js';
import { regionalReadiness } from '../lib/releases/gate.js';
import { derpReleaseArtifacts } from '../lib/image-artifacts.js';
import { digest, production, readReleaseManifest, releaseManifest, releaseRepository, releaseSelector, repository, type Release } from '../lib/releases/model.js';
import type { Manifest, Registry } from '../lib/releases/registry.js';

function fixture() {
  // Production aliases remain observable separately from the region's immutable candidate selection.
  const entries = new Map<string, Manifest>();
  const registry: Registry = { get: async (repo, ref) => entries.get(`${repo}/${ref}`),
    put: async () => { throw new Error('Selection must never publish aliases'); }, removeTag: async () => { throw new Error('Selection must never remove aliases'); } };
  const scope = { account: '111111111111', region: 'eu-north-1', endpoint: 'GhostlineStockholmEcs' };
  const image = (letter: string) => `sha256:${letter.repeat(64)}`;
  const release = (letter: string): Release => ({ schemaVersion: 5, promotionId: `release-${letter.repeat(8)}`,
    promotedAt: '2026-11-17T00:00:00Z', origin: scope.region, platform: 'linux/arm64',
    images: Object.fromEntries(derpReleaseArtifacts.map(name => [name, { repository: repository(name), digest: image(letter),
      runtimeDigest: image(letter), buildTag: `sha-${letter.repeat(64)}` }])) as Release['images'],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.66.0'], targetVersion: '1.66.0' }, history: [] });
  const baseline = release('a'), intent = release('b');
  const baselineText = releaseManifest(baseline), baselineDigest = digest(baselineText);
  const candidate: TrialCandidate = { schema: 1, kind: 'native-qualification', target: 'stockholm-ecs', account: scope.account, region: scope.region,
    createdAt: '2026-11-17T00:00:00Z', localQualifiedAt: '2026-11-17T00:00:00Z',
    frameworkDigest: image('d'),
    sourceInputs: Object.fromEntries(derpReleaseArtifacts.map(name => [name, `sha-${'c'.repeat(64)}`])), intent };
  const artifact = candidateManifest(candidate);
  const original = { digest: baselineDigest, manifest: baselineText, mediaType: 'application/vnd.oci.image.manifest.v1+json' };
  entries.set(`${releaseRepository}/${baselineDigest}`, original);
  entries.set(`${releaseRepository}/${releaseSelector}`, original);
  entries.set(`${releaseRepository}/${artifact.digest}`, artifact);
  for (const r of [baseline, intent]) for (const name of derpReleaseArtifacts) {
    const member = { digest: r.images[name]!.digest, manifest: '{}', mediaType: 'test' };
    entries.set(`${repository(name)}/${member.digest}`, member);
    if (r === baseline) entries.set(`${repository(name)}/${production}`, member);
  }
  let trial: CandidateTrial | undefined = { version: 1, id: 'trial-identity', target: candidate.target, ...scope, kind: 'candidate',
    candidate: artifact.digest, phase: 'deploying', startedAt: candidate.createdAt, baselineRelease: baselineDigest,
    baseline: { slot: 'a', stack: 'stack-blue', instance: 'host-blue', interface: 'interface-blue', boot: 'boot-blue', revision: 'revision-blue', images: {}, os: '1.66.0' },
    originalMode: 'active', endpointTemplate: 'https://example.invalid/template.json', endpointParameters: {},
    releaseTemplate: 'https://example.invalid/release.json', releaseParameters: {}, baselineTemplates: { a: '', b: '', addresses: '' } };
  const ports = { registry, dnsRequired: true, derpRequired: true, trialScope: scope,
    record: async <T>(_key: string): Promise<T | undefined> => trial as T | undefined };
  return { entries, ports, candidate, artifact, baselineDigest, intent, baseline, trial: () => trial!, setTrial: (value: CandidateTrial | undefined) => { trial = value; } };
}

it('distinguishes pending native candidates from production releases and verifies payload checksums', () => {
  const f = fixture();
  expect(readCandidate(f.artifact)).toEqual(f.candidate);
  expect(() => readReleaseManifest(f.artifact.manifest)).toThrow('Invalid release artifact');
  expect(() => parseCandidate({ ...f.candidate, nativeQualified: true })).toThrow();
  const tampered = JSON.parse(f.artifact.manifest);
  tampered.annotations['io.ghostline.trial'] += ' ';
  const text = JSON.stringify(tampered);
  expect(() => readCandidate({ ...f.artifact, manifest: text, digest: digest(text) })).toThrow('checksum');
});

it('selects exact candidate images only inside the owning regional trial without changing keep aliases', async () => {
  const f = fixture();
  const before = [...f.entries];
  expect(await regionalReadiness(f.ports)).toMatchObject({ ready: true, current: { digest: f.artifact.digest, release: f.intent } });
  expect([...f.entries]).toEqual(before);
  f.setTrial(undefined);
  expect(await regionalReadiness(f.ports)).toMatchObject({ ready: true, current: { digest: f.baselineDigest, release: f.baseline } });
});

it('refuses cross-region selection, implicit prepared deployment and incomplete image sets', async () => {
  const f = fixture();
  f.trial().phase = 'prepared';
  expect(await regionalReadiness(f.ports)).toMatchObject({ ready: false });
  f.trial().phase = 'deploying';
  f.trial().region = 'us-west-2';
  await expect(regionalReadiness(f.ports)).rejects.toThrow('this controller');
  f.trial().region = 'eu-north-1';
  f.entries.delete(`${repository('bootstrap')}/${f.intent.images.bootstrap.digest}`);
  expect(await regionalReadiness(f.ports)).toMatchObject({ ready: false, reason: expect.stringContaining('immutable trial image') });
});

it('returns to the captured production bytes before removing the exclusion', async () => {
  const f = fixture();
  f.trial().phase = 'returning';
  expect(await regionalReadiness(f.ports)).toMatchObject({ ready: true, current: { digest: f.baselineDigest, release: f.baseline } });
  f.entries.delete(`${releaseRepository}/${f.baselineDigest}`);
  await expect(regionalReadiness(f.ports)).rejects.toThrow('return release');
});
