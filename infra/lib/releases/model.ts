import { createHash } from 'node:crypto';
import { bootstrapRaceIssue } from '../bottlerocket-limitations.js';
import { imageArtifacts, type ImageArtifact } from '../image-artifacts.js';

export const artifacts = imageArtifacts;
export type Artifact = ImageArtifact;
export const repositoryArtifacts = [...artifacts, 'releases'] as const;
export type RepositoryArtifact = typeof repositoryArtifacts[number];
export const production = 'keep-production';
export const releaseSelector = `${production}-release`;
export const releaseAnnotation = 'io.ghostline.release';
export const manifestType = 'application/vnd.oci.image.manifest.v1+json';
export const releaseType = 'application/vnd.ghostline.release.v3+json';
const historicalReleaseType = 'application/vnd.ghostline.release.v2+json';
export const emptyConfig = Buffer.from('{}');
export const digest = (bytes: string | Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const repositoryPrefix = 'ghostline/prod/';
export const repository = (artifact: RepositoryArtifact) => `${repositoryPrefix}${artifact}`;
export const releaseRepository = repository('releases');
export const digestPattern = /^sha256:[a-f0-9]{64}$/;

export interface ReleaseImage {
  repository: string;
  digest: string;
  runtimeDigest: string;
  buildTag: string;
}
export interface Release {
  schemaVersion: 2 | 3;
  promotionId: string;
  promotedAt: string;
  origin: string;
  platform: 'linux/arm64';
  images: Record<Artifact, ReleaseImage>;
  os: { variant: 'aws-ecs-3'; architecture: 'arm64'; compatibleVersions: string[]; targetVersion?: string; knownLimitations?: string[] };
  sourceApplicationRelease?: string;
  history: string[];
}

export function parseRelease(value: unknown): Release {
  // Registry metadata is input, never authority to redirect the gate to another repository or architecture.
  const r = value as Release;
  if (!r || ![2, 3].includes(r.schemaVersion) || !/^[a-z0-9-]{8,100}$/.test(r.promotionId)
    || !Number.isFinite(Date.parse(r.promotedAt)) || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(r.origin)
    || r.platform !== 'linux/arm64' || !Array.isArray(r.history) || r.history.length > 3
    || r.history.some(d => !digestPattern.test(d)) || new Set(r.history).size !== r.history.length
    || !r.images || Object.keys(r.images).length !== artifacts.length
    || r.os?.variant !== 'aws-ecs-3' || r.os.architecture !== 'arm64'
    || !Array.isArray(r.os.compatibleVersions) || !r.os.compatibleVersions.length || r.os.compatibleVersions.length > 32
    || r.os.compatibleVersions.some(v => !/^\d+\.\d+\.\d+$/.test(v))
    || new Set(r.os.compatibleVersions).size !== r.os.compatibleVersions.length
    || (r.sourceApplicationRelease !== undefined && !digestPattern.test(r.sourceApplicationRelease))) throw new Error('Invalid release document.');
  if (Object.keys(r).some(key => !['schemaVersion', 'promotionId', 'promotedAt', 'origin', 'platform', 'images', 'os', 'sourceApplicationRelease', 'history'].includes(key))
    || Object.keys(r.os).some(key => !['variant', 'architecture', 'compatibleVersions', 'targetVersion', 'knownLimitations'].includes(key))) throw new Error('Unknown release document field.');
  // Historical documents remain readable for retention. Only v3 binds new-host launch to one centrally qualified OS.
  if (r.schemaVersion === 3 ? !r.os.targetVersion || !r.os.compatibleVersions.includes(r.os.targetVersion)
    : r.os.targetVersion !== undefined) throw new Error('Invalid qualified target OS version.');
  // Explicit evidence is carried with the release; arbitrary metadata cannot authorize a recovery policy.
  if (r.os.knownLimitations !== undefined && (!Array.isArray(r.os.knownLimitations) || r.os.knownLimitations.length !== 1
    || r.os.knownLimitations[0] !== bootstrapRaceIssue)) throw new Error('Invalid release limitation.');
  for (const name of artifacts) {
    const image = r.images[name];
    if (!image || image.repository !== repository(name) || !digestPattern.test(image.digest)
      || !digestPattern.test(image.runtimeDigest) || !/^sha-[a-f0-9]{64}$/.test(image.buildTag)
      || Object.keys(image).some(key => !['repository', 'digest', 'runtimeDigest', 'buildTag'].includes(key))) {
      throw new Error('Invalid release image identity.');
    }
  }
  return r;
}

export function releaseManifest(release: Release): string {
  // No subject link: history documents must survive even when an initializer is shared by many releases.
  const document = JSON.stringify(parseRelease(release));
  const media = release.schemaVersion === 3 ? releaseType : historicalReleaseType;
  return JSON.stringify({ schemaVersion: 2, mediaType: manifestType, artifactType: media,
    config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: digest(emptyConfig), size: emptyConfig.length },
    // ECR requires at least one layer. The annotation lets the gate read the checksum-bound document without blob credentials.
    layers: [{ mediaType: media, digest: digest(document), size: Buffer.byteLength(document) }],
    annotations: { [releaseAnnotation]: document } });
}

export function readReleaseManifest(manifest: string): Release {
  const value = JSON.parse(manifest);
  if (value.mediaType !== manifestType || ![releaseType, historicalReleaseType].includes(value.artifactType) || value.subject) throw new Error('Invalid release artifact.');
  const document = value.annotations?.[releaseAnnotation];
  if (typeof document !== 'string' || value.layers?.length !== 1 || value.layers[0].mediaType !== value.artifactType
    || value.layers[0].digest !== digest(document) || value.layers[0].size !== Buffer.byteLength(document)) throw new Error('Release document checksum mismatch.');
  const release = parseRelease(JSON.parse(document));
  if (value.artifactType !== (release.schemaVersion === 3 ? releaseType : historicalReleaseType)) throw new Error('Release schema and media type differ.');
  return release;
}

export function setIdentity(release: Pick<Release, 'images' | 'os'>): string {
  // Index provenance can change without changing any runtime. Do not fill the rollback window with those duplicate sets.
  return JSON.stringify([artifacts.map(name => release.images[name].runtimeDigest), release.os.variant,
    release.os.architecture, [...release.os.compatibleVersions].sort(), release.os.targetVersion ?? null]);
}

export function retainHistory(next: Pick<Release, 'images' | 'os'>, previous: Array<{ digest: string; release: Release }>): string[] {
  const seen = new Set([setIdentity(next)]);
  return previous.filter(item => {
    const key = setIdentity(item.release);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3).map(item => item.digest);
}

export function keepTags(artifact: RepositoryArtifact): string[] {
  const tags = [production, ...[1, 2, 3].map(n => `keep-mru-${n}`)];
  return artifact === 'releases' ? tags.map(tag => `${tag}-release`).concat('keep-publishing-release') : [...tags, 'keep-publishing'];
}

export function lifecyclePolicy(artifact: RepositoryArtifact) {
  // An exact alias selects at most one manifest, so a high-priority count-one rule protects it.
  const rules = keepTags(artifact).map((tag, i) => ({ rulePriority: i + 1, description: `Protect ${tag}`,
    selection: { tagStatus: 'tagged', tagPatternList: [tag], countType: 'imageCountMoreThan', countNumber: 1 },
    action: { type: 'expire' } }));
  // Native ECR cannot see running or parked references. Only the observation-aware publisher may prune tagged history.
  return { rules: [...rules, { rulePriority: 100, description: 'Expire untagged artifacts after seven days',
    selection: { tagStatus: 'untagged', countType: 'sinceImagePushed', countUnit: 'days', countNumber: 7 }, action: { type: 'expire' } }] };
}
