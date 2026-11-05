import { expect, it } from 'vitest';
import { dnsReleaseArtifacts, imageArtifacts } from '../lib/image-artifacts.js';
import { releaseTag } from '../lib/ecs-release.js';
import { assertCurrentBuildQualification, qualifiedOs, qualifyNativePlatform } from '../lib/platform-qualification.js';
import type { QualifiedImage } from '../lib/releases/image-publication.js';
import type { StackObservation } from '../lib/releases/runtime-identity.js';

function fixture() {
  const hash = `sha256:${'a'.repeat(64)}`, child = `sha256:${'b'.repeat(64)}`;
  const images = Object.fromEntries(imageArtifacts.map(name => [name, { imageId: hash, buildTag: `sha-${'c'.repeat(64)}`, runtimeDigest: child }])) as Record<typeof imageArtifacts[number], QualifiedImage>;
  const actual: StackObservation = { mode: 'active', host: { id: 'host', state: 'running', bootId: 'current', version: '1.65.0', variant: 'aws-ecs-3', architecture: 'arm64' },
    bootstrap: { bootId: 'current', digest: hash }, daemon: { stable: true, digest: hash }, gateway: { desired: 1, stable: true, images: {} } };
  return { images, actual, at: '2026-09-22T00:00:00Z' };
}
it('reuses native evidence only for identical platform inputs and runtime manifests', () => {
  const f = fixture(); const proof = qualifyNativePlatform(f.images, f.actual, f.at);
  expect(qualifiedOs(f.images, proof)?.compatibleVersions).toEqual(['1.65.0']);
  expect(qualifiedOs(f.images, proof)?.targetVersion).toBe('1.65.0');
  f.images.bootstrap.imageId = `sha256:${'d'.repeat(64)}`; // An outer provenance index can change around identical executed bytes.
  expect(qualifiedOs(f.images, proof)).toEqual(proof.os);
  f.images.bootstrap.runtimeDigest = `sha256:${'e'.repeat(64)}`;
  expect(qualifiedOs(f.images, proof)).toBeUndefined();
});
it('requires a selected qualified OS rather than choosing a new AMI independently in each region', () => {
  const f = fixture(); const proof = qualifyNativePlatform(f.images, f.actual, f.at);
  proof.os.targetVersion = '9.0.0'; expect(qualifiedOs(f.images, proof)).toBeUndefined();
  delete proof.os.targetVersion; expect(qualifiedOs(f.images, proof)).toBeUndefined();
});
it('refuses stale boot evidence, mismatched candidates and unrecorded local builds', () => {
  const f = fixture(); expect(qualifiedOs(f.images)).toBeUndefined();
  f.actual.bootstrap!.bootId = 'old'; expect(() => qualifyNativePlatform(f.images, f.actual, f.at)).toThrow('Incomplete');
  f.actual.bootstrap!.bootId = 'current'; f.actual.daemon!.digest = `sha256:${'e'.repeat(64)}`;
  expect(() => qualifyNativePlatform(f.images, f.actual, f.at)).toThrow('differs');
});

it('carries the accepted limitation and rejects evidence that silently omits it', () => {
  const f = fixture(); const proof = qualifyNativePlatform(f.images, f.actual, f.at);
  expect(proof.os.knownLimitations).toEqual(['https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059']);
  delete proof.os.knownLimitations;
  expect(() => qualifiedOs(f.images, proof)).toThrow('availability limitation');
  f.actual.host!.version = '1.67.0';
  expect(qualifyNativePlatform(f.images, f.actual, f.at).os.knownLimitations).toBeUndefined();
});

it('selects the exact qualified build set for five- and six-image regions', () => {
  const images = Object.fromEntries(dnsReleaseArtifacts.map(name => [name, { buildTag: releaseTag(name),
    imageId: `sha256:${'a'.repeat(64)}`, runtimeDigest: `sha256:${'b'.repeat(64)}` }]));
  const record = { qualifiedAt: '2026-10-12T00:00:00Z', images };
  expect(() => assertCurrentBuildQualification(record, dnsReleaseArtifacts)).not.toThrow();
  expect(() => assertCurrentBuildQualification(record, imageArtifacts)).toThrow('differs');
  const legacy = { ...record, images: Object.fromEntries(imageArtifacts.map(name => [name, images[name]])) };
  expect(() => assertCurrentBuildQualification(legacy, imageArtifacts)).not.toThrow();
  expect(() => assertCurrentBuildQualification(legacy, dnsReleaseArtifacts)).toThrow('differs');
  images['dns-policy']!.buildTag = 'sha-' + '0'.repeat(64);
  expect(() => assertCurrentBuildQualification(record, dnsReleaseArtifacts)).toThrow('differs');
  images['dns-policy']!.buildTag = releaseTag('dns-policy');
  images['dns-policy']!.runtimeDigest = '';
  expect(() => assertCurrentBuildQualification(record, dnsReleaseArtifacts)).toThrow('differs');
});
