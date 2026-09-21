import { createHash } from 'node:crypto';

export const artifacts = ['xray', 'awg', 'gateway-config'] as const;
export type Artifact = typeof artifacts[number];
export const production = 'keep-production';
export const releaseSelector = `${production}-release`;
export const releaseAnnotation = 'io.ghostline.release';
export const manifestType = 'application/vnd.oci.image.manifest.v1+json';
export const releaseType = 'application/vnd.ghostline.release.v1+json';
export const emptyConfig = Buffer.from('{}');
export const digest = (bytes: string | Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const repositoryPrefix = 'ghostline/prod/';
export const repository = (artifact: Artifact) => `${repositoryPrefix}${artifact}`;
export const digestPattern = /^sha256:[a-f0-9]{64}$/;

export interface ReleaseImage {
  repository: string;
  digest: string;
  runtimeDigest: string;
  buildTag: string;
}
export interface Release {
  schemaVersion: 1;
  promotionId: string;
  promotedAt: string;
  origin: string;
  platform: 'linux/arm64';
  images: Record<Artifact, ReleaseImage>;
  history: string[];
}

export function parseRelease(value: unknown): Release {
  // Registry metadata is input, never authority to redirect the gate to another repository or architecture.
  const r = value as Release;
  if (!r || r.schemaVersion !== 1 || !/^[a-z0-9-]{8,100}$/.test(r.promotionId)
    || !Number.isFinite(Date.parse(r.promotedAt)) || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(r.origin)
    || r.platform !== 'linux/arm64' || !Array.isArray(r.history) || r.history.length > 3
    || r.history.some(d => !digestPattern.test(d)) || new Set(r.history).size !== r.history.length
    || !r.images || Object.keys(r.images).length !== artifacts.length) throw new Error('Invalid release document.');
  for (const name of artifacts) {
    const image = r.images[name];
    if (!image || image.repository !== repository(name) || !digestPattern.test(image.digest)
      || !digestPattern.test(image.runtimeDigest) || !/^sha-[a-f0-9]{64}$/.test(image.buildTag)) {
      throw new Error('Invalid release image identity.');
    }
  }
  return r;
}

export function releaseManifest(release: Release): string {
  // No subject link: history documents must survive even when an initializer is shared by many releases.
  const document = JSON.stringify(parseRelease(release));
  return JSON.stringify({ schemaVersion: 2, mediaType: manifestType, artifactType: releaseType,
    config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: digest(emptyConfig), size: emptyConfig.length },
    // ECR requires at least one layer. The annotation lets the gate read the checksum-bound document without blob credentials.
    layers: [{ mediaType: releaseType, digest: digest(document), size: Buffer.byteLength(document) }],
    annotations: { [releaseAnnotation]: document } });
}

export function readReleaseManifest(manifest: string): Release {
  const value = JSON.parse(manifest);
  if (value.mediaType !== manifestType || value.artifactType !== releaseType || value.subject) throw new Error('Invalid release artifact.');
  const document = value.annotations?.[releaseAnnotation];
  if (typeof document !== 'string' || value.layers?.length !== 1 || value.layers[0].mediaType !== releaseType
    || value.layers[0].digest !== digest(document) || value.layers[0].size !== Buffer.byteLength(document)) throw new Error('Release document checksum mismatch.');
  return parseRelease(JSON.parse(document));
}

export function setIdentity(release: Pick<Release, 'images'>): string {
  // A promotion of unchanged bytes is a no-op even if its timestamp/build labels differ.
  return artifacts.map(name => release.images[name].digest).join('/');
}

export function retainHistory(next: Pick<Release, 'images'>, previous: Array<{ digest: string; release: Release }>): string[] {
  const seen = new Set([setIdentity(next)]);
  return previous.filter(item => {
    const key = setIdentity(item.release);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3).map(item => item.digest);
}

export function keepTags(artifact: Artifact): string[] {
  const tags = [production, ...[1, 2, 3].map(n => `keep-mru-${n}`)];
  return [...tags, 'keep-publishing', ...(artifact === 'gateway-config' ? tags.map(tag => `${tag}-release`).concat('keep-publishing-release') : [])];
}

export function lifecyclePolicy(artifact: Artifact) {
  // An exact alias selects at most one manifest, so a high-priority count-one rule protects it.
  const rules = keepTags(artifact).map((tag, i) => ({ rulePriority: i + 1, description: `Protect ${tag}`,
    selection: { tagStatus: 'tagged', tagPatternList: [tag], countType: 'imageCountMoreThan', countNumber: 1 },
    action: { type: 'expire' } }));
  return { rules: [...rules, { rulePriority: 100, description: 'Expire unprotected artifacts after seven days',
    selection: { tagStatus: 'any', countType: 'sinceImagePushed', countUnit: 'days', countNumber: 7 }, action: { type: 'expire' } }] };
}
