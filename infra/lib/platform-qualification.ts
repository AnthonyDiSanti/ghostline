import { readFileSync, existsSync } from 'node:fs';
import { acceptsBootstrapRecovery, bootstrapRecoveryIssue } from './bootstrap-recovery.js';
import { platformArtifacts, type ImageArtifact } from './image-artifacts.js';
import { componentMatches, type StackObservation } from './releases/stack-action.js';
import { digestPattern, type Release } from './releases/model.js';
import type { QualifiedImage } from './releases/image-publication.js';

export interface NativeQualification {
  schema: 1; verifiedAt: string;
  os: Release['os'];
  images: Record<typeof platformArtifacts[number], { buildTag: string; runtimeDigest: string }>;
}
export const nativeQualificationPath = new URL('../platform-qualification.json', import.meta.url);

export function qualifiedOs(images: Record<ImageArtifact, QualifiedImage>, native?: NativeQualification): Release['os'] | undefined {
  // Local protocol tests remain mandatory every build. Native evidence can be reused only for identical platform runtime bytes/inputs.
  if (!native || native.schema !== 1 || !Number.isFinite(Date.parse(native.verifiedAt))) return undefined;
  if (native.os?.variant !== 'aws-ecs-3' || native.os.architecture !== 'arm64'
    || !native.os.compatibleVersions?.length || native.os.compatibleVersions.some(v => !/^\d+\.\d+\.\d+$/.test(v))) throw new Error('Malformed native qualification.');
  if (native.os.compatibleVersions.some(acceptsBootstrapRecovery) && !native.os.knownLimitations?.includes(bootstrapRecoveryIssue)) {
    throw new Error('Native qualification must record the accepted Bottlerocket startup availability limitation.');
  }
  return platformArtifacts.every(name => native.images[name]?.buildTag === images[name]?.buildTag
    && digestPattern.test(native.images[name]?.runtimeDigest ?? '') && native.images[name]?.runtimeDigest === images[name]?.runtimeDigest) ? native.os : undefined;
}

export function loadNativeQualification(): NativeQualification | undefined {
  // Missing evidence leaves a build usable for isolated qualification but never for production publication.
  return existsSync(nativeQualificationPath) ? JSON.parse(readFileSync(nativeQualificationPath, 'utf8')) as NativeQualification : undefined;
}

export function qualifyNativePlatform(images: Record<ImageArtifact, QualifiedImage>, actual: StackObservation, verifiedAt: string): NativeQualification {
  // Call only after native runtime/security/lifecycle checks. Bind that evidence to current boot, exact executed bytes and actual OS.
  if (!Number.isFinite(Date.parse(verifiedAt)) || actual.mode !== 'active' || actual.host?.state !== 'running'
    || !actual.host.bootId || actual.host.bootId !== actual.bootstrap?.bootId || !actual.gateway?.stable || !actual.daemon?.stable
    || actual.host.variant !== 'aws-ecs-3' || actual.host.architecture !== 'arm64' || !/^\d+\.\d+\.\d+$/.test(actual.host.version ?? '')) {
    throw new Error('Incomplete native platform observations.');
  }
  for (const name of platformArtifacts) {
    const image = images[name];
    if (!image || !digestPattern.test(image.imageId) || !digestPattern.test(image.runtimeDigest ?? '')
      || !componentMatches({ digest: image.imageId, runtimeDigest: image.runtimeDigest! }, name === 'bootstrap' ? actual.bootstrap.digest : actual.daemon.digest, actual.resolvedDigests)) {
      throw new Error('Native platform differs from locally qualified bytes.');
    }
  }
  return { schema: 1, verifiedAt, os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: [actual.host.version!],
    ...(acceptsBootstrapRecovery(actual.host.version) ? { knownLimitations: [bootstrapRecoveryIssue] } : {}) },
    images: Object.fromEntries(platformArtifacts.map(name => [name, { buildTag: images[name].buildTag, runtimeDigest: images[name].runtimeDigest! }])) as NativeQualification['images'] };
}
