import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type Protocol = 'xray' | 'awg';
export const imageArtifacts = ['xray', 'awg', 'gateway-config'] as const;
export type ImageArtifact = typeof imageArtifacts[number];
export const imageArchitecture = 'arm64';
export const imagePlatform = 'linux/arm64';
export const officialXrayImage = 'ghcr.io/xtls/xray-core@sha256:96e356574d4de2e4c6f9dea2ff79a9e4dc439558df73a38eefd8192553c9f367';

export function releaseFiles(protocol: ImageArtifact): Record<string, Buffer> {
  // Xray is mirrored byte-for-byte; it has no Ghostline Dockerfile or build context.
  if (protocol === 'xray') return {};
  // The same bytes identify the release and populate its disposable build context; no local secrets.
  const files: Record<string, Buffer> = {
    Dockerfile: readFileSync(new URL(`../../runtime/ecs/${protocol}.Dockerfile`, import.meta.url)),
    [protocol === 'awg' ? 'awg-start.sh' : 'config-start.sh']: readFileSync(new URL(`../../runtime/ecs/${protocol === 'awg' ? 'awg-start.sh' : 'config-start.sh'}`, import.meta.url)),
  };
  if (protocol === 'gateway-config') files['gateway-config.sh'] = readFileSync(new URL('../../runtime/ecs/gateway-config.sh', import.meta.url));
  if (protocol === 'awg') files['start.sh'] = readFileSync(new URL('../../runtime/ecs/start.sh', import.meta.url));
  return files;
}

export function releaseTag(protocol: ImageArtifact): string {
  const hash = createHash('sha256');
  if (protocol === 'xray') hash.update(officialXrayImage).update('\0').update(imagePlatform);
  // Include the target platform in each content identity.
  else hash.update(imagePlatform).update('\0');
  // NUL separators distinguish filenames/content boundaries; pinned base images and build instructions are inputs.
  for (const [name, bytes] of Object.entries(releaseFiles(protocol)).sort()) hash.update(name).update('\0').update(bytes).update('\0');
  return `sha-${hash.digest('hex')}`;
}
