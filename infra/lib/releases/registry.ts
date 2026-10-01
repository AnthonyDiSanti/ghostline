import {
  ECRClient, BatchGetImageCommand, PutImageCommand, BatchDeleteImageCommand, GetAuthorizationTokenCommand,
  InitiateLayerUploadCommand, UploadLayerPartCommand, CompleteLayerUploadCommand, BatchCheckLayerAvailabilityCommand,
} from '@aws-sdk/client-ecr';
import { digest, digestPattern, emptyConfig, manifestType, readReleaseManifest, releaseManifest, type Release } from './model.js';

export interface Manifest { digest: string; manifest: string; mediaType: string }
export interface ReleaseRecord { digest: string; release: Release }
export interface Registry {
  get(repository: string, reference: string): Promise<Manifest | undefined>;
  put(repository: string, manifest: Manifest, tag: string): Promise<void>;
  removeTag(repository: string, tag: string): Promise<void>;
}
export interface ImageSource {
  get(repository: string, reference: string): Promise<Manifest | undefined>;
  blob(repository: string, hash: string): Promise<Uint8Array>;
}

export async function readRelease(registry: Registry, repository: string, reference: string): Promise<ReleaseRecord | undefined> {
  const image = await registry.get(repository, reference);
  return image ? { digest: image.digest, release: readReleaseManifest(image.manifest) } : undefined;
}

export async function runtimeManifest(registry: Pick<Registry, 'get'>, repository: string, root: Manifest): Promise<Manifest> {
  const parsed = JSON.parse(root.manifest);
  if (!parsed.manifests) return root;
  // Index identity is retained for replication; execution/qualification compares the single ARM64 child.
  const children = parsed.manifests.filter((m: any) => m.platform?.architecture === 'arm64' && m.platform?.os === 'linux');
  if (children.length !== 1) throw new Error('Expected one ARM64 image in the index.');
  const child = await registry.get(repository, children[0].digest);
  if (!child || JSON.parse(child.manifest).manifests) throw new Error('ARM64 child manifest is unavailable.');
  return child;
}

export function isQualifiedImage(imageId: string, root: Manifest, runtime: Manifest): boolean {
  // Docker's classic store exposes the config ID; its containerd store may expose a manifest/index ID instead.
  return [root.digest, runtime.digest, JSON.parse(runtime.manifest).config?.digest].includes(imageId);
}

export class EcrRegistry implements Registry {
  private token?: { value: string; expires: number };
  constructor(readonly client: ECRClient, readonly account: string, readonly region: string) {}

  async get(repository: string, reference: string): Promise<Manifest | undefined> {
    // Only missing images are a normal partial-replication state. Authorization/network failures must surface.
    const response = await this.client.send(new BatchGetImageCommand({ repositoryName: repository,
      imageIds: [digestPattern.test(reference) ? { imageDigest: reference } : { imageTag: reference }] }));
    if (response.failures?.some(f => f.failureCode !== 'ImageNotFound')) throw new Error('ECR manifest lookup failed.');
    const image = response.images?.[0];
    if (!image) return undefined;
    if (!image.imageManifest || image.imageId?.imageDigest !== digest(image.imageManifest)) throw new Error('ECR manifest identity mismatch.');
    return { digest: image.imageId.imageDigest, manifest: image.imageManifest,
      mediaType: image.imageManifestMediaType ?? JSON.parse(image.imageManifest).mediaType };
  }

  async put(repository: string, manifest: Manifest, tag: string): Promise<void> {
    if (digest(manifest.manifest) !== manifest.digest) throw new Error('Manifest bytes do not match digest.');
    const current = await this.get(repository, tag);
    if (current?.digest === manifest.digest) return;
    const result = await this.client.send(new PutImageCommand({ repositoryName: repository, imageTag: tag,
      imageManifest: manifest.manifest, imageManifestMediaType: manifest.mediaType, imageDigest: manifest.digest })).catch(async error => {
      // Replication may win the lookup/write race. Accept only a fresh read of the exact intended alias target.
      if (error.name === 'ImageAlreadyExistsException' && (await this.get(repository, tag))?.digest === manifest.digest) return undefined;
      throw error;
    });
    if (!result) return;
    if (result.image?.imageId?.imageDigest !== manifest.digest) throw new Error('Published manifest digest mismatch.');
  }

  async removeTag(repository: string, tag: string): Promise<void> {
    // Always remove a tag, never delete by digest: other history aliases may share these bytes.
    const result = await this.client.send(new BatchDeleteImageCommand({ repositoryName: repository, imageIds: [{ imageTag: tag }] }));
    if (result.failures?.some(f => f.failureCode !== 'ImageNotFound')) throw new Error('ECR tag removal failed.');
  }

  async uploadBlob(repository: string, bytes: Uint8Array, report: (message: string) => void = () => {}): Promise<void> {
    const hash = digest(bytes);
    if (await this.hasBlob(repository, hash)) return;
    const upload = await this.client.send(new InitiateLayerUploadCommand({ repositoryName: repository }));
    if (!upload.uploadId) throw new Error('Missing ECR upload ID.');
    // ECR permits 5–20 MiB parts. The minimum bounds retries on slow uplinks; only the final part may be smaller.
    const size = 5 * 1024 * 1024;
    for (let offset = 0; offset < bytes.length; offset += size) {
      const part = bytes.subarray(offset, offset + size);
      const last = offset + part.length - 1;
      report(`${repository}: upload bytes ${offset}-${last} of ${bytes.length}.`);
      const received = await this.client.send(new UploadLayerPartCommand({ repositoryName: repository, uploadId: upload.uploadId,
        partFirstByte: offset, partLastByte: last, layerPartBlob: part }),
      // Metadata requests stay short; a 5 MiB binary part is roughly 7 MiB over this JSON API on a slow uplink.
      { requestTimeout: 600_000, abortSignal: AbortSignal.timeout(610_000) });
      if (received.lastByteReceived !== last) throw new Error('ECR did not acknowledge the complete layer part.');
    }
    const result = await this.client.send(new CompleteLayerUploadCommand({ repositoryName: repository, uploadId: upload.uploadId, layerDigests: [hash] }));
    if (result.layerDigest !== hash) throw new Error('Transferred blob digest mismatch.');
  }

  async hasBlob(repository: string, hash: string): Promise<boolean> {
    // Resumed/backfilled releases share most layers; do not download bytes already at the destination.
    const available = await this.client.send(new BatchCheckLayerAvailabilityCommand({ repositoryName: repository, layerDigests: [hash] }));
    if (available.failures?.some(f => f.failureCode !== 'MissingLayerDigest')) throw new Error('Layer availability lookup failed.');
    return available.layers?.some(l => l.layerDigest === hash && l.layerAvailability === 'AVAILABLE') ?? false;
  }

  async blob(repository: string, hash: string): Promise<Uint8Array> {
    // Registry authorization remains in memory. Never log credentials, signed redirects or response bodies.
    if (!this.token || this.token.expires < Date.now() + 60_000) {
      const result = await this.client.send(new GetAuthorizationTokenCommand({}));
      const auth = result.authorizationData?.[0];
      if (!auth?.authorizationToken || !auth.expiresAt) throw new Error('Registry authentication failed.');
      this.token = { value: auth.authorizationToken, expires: auth.expiresAt.getTime() };
    }
    const url = `https://${this.account}.dkr.ecr.${this.region}.amazonaws.com/v2/${repository}/blobs/${hash}`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${this.token.value}` }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Registry blob transfer failed (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (digest(bytes) !== hash) throw new Error('Downloaded blob digest mismatch.');
    return bytes;
  }

  async putRelease(repository: string, release: Release, tag: string): Promise<Manifest> {
    // Historical v2 bytes can be seeded unchanged; they cannot authorize a new host rollout or new publication.
    if (release.schemaVersion !== 3) throw new Error('New releases require a qualified target OS (schema v3).');
    const manifest = releaseManifest(release);
    await this.uploadBlob(repository, emptyConfig);
    await this.uploadBlob(repository, Buffer.from(JSON.stringify(release)));
    const result = { manifest, digest: digest(manifest), mediaType: manifestType };
    await this.put(repository, result, tag);
    return result;
  }
}

export async function copyImage(source: ImageSource, target: EcrRegistry, sourceRepo: string, destinationRepo: string,
  hash: string, tag: string, report: (message: string) => void = () => {}): Promise<void> {
  // Copy exact OCI bytes, including index children, without a Docker rebuild or manifest conversion.
  const image = await source.get(sourceRepo, hash);
  if (!image) throw new Error('Source artifact is missing.');
  if (!(await target.get(destinationRepo, hash))) {
    const manifest = JSON.parse(image.manifest);
    for (const child of manifest.manifests ?? []) {
      await copyImage(source, target, sourceRepo, destinationRepo, child.digest, `sha-${child.digest.slice(7)}`, report);
    }
    for (const layer of [...(manifest.config ? [manifest.config] : []), ...(manifest.layers ?? [])]) {
      if (await target.hasBlob(destinationRepo, layer.digest)) continue;
      report(`${destinationRepo}: transfer ${layer.digest} (${layer.size} bytes).`);
      const bytes = await source.blob(sourceRepo, layer.digest);
      report(`${destinationRepo}: verified download ${layer.digest}.`);
      await target.uploadBlob(destinationRepo, bytes, report);
    }
  }
  await target.put(destinationRepo, image, tag);
}
