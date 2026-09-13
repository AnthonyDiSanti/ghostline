import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type Protocol = 'xray' | 'awg';
export const imageArtifacts = ['xray', 'awg', 'xray-config'] as const;
export type ImageArtifact = typeof imageArtifacts[number];
export const imagePlatform = 'linux/amd64';
export const officialXrayImage = 'ghcr.io/xtls/xray-core@sha256:d7911c19a283acdc57e171ae0e3bd49ab4c29db14e2ab9274aa97132dd3ca3b9';

export function releaseFiles(protocol: ImageArtifact): Record<string, Buffer> {
  // Xray is mirrored byte-for-byte; it has no Ghostline Dockerfile or build context.
  if (protocol === 'xray') return {};
  // The same bytes identify the release and populate its disposable build context; no local secrets.
  const files: Record<string, Buffer> = {
    Dockerfile: readFileSync(new URL(`../../runtime/ecs/${protocol}.Dockerfile`, import.meta.url)),
    [`${protocol}-start.sh`]: readFileSync(new URL(`../../runtime/ecs/${protocol}-start.sh`, import.meta.url)),
  };
  if (protocol === 'awg') files['start.sh'] = readFileSync(new URL('../../runtime/awg/start.sh', import.meta.url));
  return files;
}

export function releaseTag(protocol: ImageArtifact): string {
  const hash = createHash('sha256');
  if (protocol === 'xray') hash.update(officialXrayImage).update('\0').update(imagePlatform);
  // NUL separators distinguish filenames/content boundaries; pinned base images and build instructions are inputs.
  for (const [name, bytes] of Object.entries(releaseFiles(protocol)).sort()) hash.update(name).update('\0').update(bytes).update('\0');
  return `sha-${hash.digest('hex')}`;
}
