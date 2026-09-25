import { releaseTag } from '../ecs-release.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImageArtifact } from '../image-artifacts.js';
import { digestPattern, type ReleaseImage } from './model.js';
import { copyImage, isQualifiedImage, runtimeManifest, type EcrRegistry } from './registry.js';
import { OciArchive } from './oci-archive.js';

export interface QualifiedImage { imageId: string; buildTag: string; runtimeDigest?: string }
export async function inspectQualifiedImage(imageId: string, docker: (args: string[]) => void) {
  // Capture the executable manifest separately from reproducible-build provenance in an outer index.
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-identity-'));
  try {
    const archive = join(folder, 'image.tar');
    docker(['image', 'save', '--output', archive, imageId]);
    const source = new OciArchive(archive), root = await source.root(imageId);
    const runtime = await runtimeManifest(source, '', root);
    if (!isQualifiedImage(imageId, root, runtime)) throw new Error('OCI export differs from qualified image identity.');
    return { root, runtime };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
export async function publishQualifiedImage(registry: EcrRegistry, repository: string, name: ImageArtifact,
  qualified: QualifiedImage, docker: (args: string[]) => void, report: (message: string) => void = () => {}): Promise<ReleaseImage> {
  // Qualification captures immutable local content, not a mutable Docker tag; never rebuild during delivery.
  if (!qualified || qualified.buildTag !== releaseTag(name) || !digestPattern.test(qualified.imageId)) {
    throw new Error('Qualification does not match the selected build inputs.');
  }
  const tag = `sha-${qualified.imageId.slice(7)}`;
  if (!await registry.get(repository, tag)) {
    // Use the same bounded ECR layer transfer for local publication and regional seeding, preserving exact OCI bytes.
    const folder = mkdtempSync(join(tmpdir(), 'ghostline-image-'));
    try {
      const archive = join(folder, 'image.tar');
      docker(['image', 'save', '--output', archive, qualified.imageId]);
      const source = new OciArchive(archive);
      const root = await source.root(qualified.imageId);
      const runtime = await runtimeManifest(source, '', root);
      if (!isQualifiedImage(qualified.imageId, root, runtime)) throw new Error('OCI export differs from qualified image identity.');
      await copyImage(source, registry, '', repository, root.digest, tag, report);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }
  const manifest = await registry.get(repository, tag);
  if (!manifest) throw new Error('Published manifest is missing.');
  const runtime = await runtimeManifest(registry, repository, manifest);
  if (!isQualifiedImage(qualified.imageId, manifest, runtime)) throw new Error('Published bytes differ from qualified image identity.');
  if (qualified.runtimeDigest && qualified.runtimeDigest !== runtime.digest) throw new Error('Published runtime differs from qualification.');
  return { repository, digest: manifest.digest, runtimeDigest: runtime.digest, buildTag: tag };
}
