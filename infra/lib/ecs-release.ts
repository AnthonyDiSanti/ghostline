import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadImageInputs, type ImageInputs } from './image-inputs.js';

export type Protocol = 'xray' | 'awg';
export const imageArtifacts = ['xray', 'awg', 'gateway-config'] as const;
export type ImageArtifact = typeof imageArtifacts[number];
export const imageArchitecture = 'arm64';
export const imagePlatform = 'linux/arm64';
export const imageInputs = loadImageInputs();
export const officialXrayImage = `ghcr.io/xtls/xray-core@${imageInputs.xray.imageDigest}`;

export function releaseBuildArgs(artifact: ImageArtifact, inputs: ImageInputs = imageInputs): Record<string, string> {
  // Only immutable verified source identities reach Docker; discovery timestamps never invalidate caches.
  if (artifact !== 'awg') return {};
  return { AWG_COMMIT: inputs.awg.daemon.commit, AWG_SHA256: inputs.awg.daemon.archiveSha256,
    TOOLS_COMMIT: inputs.awg.tools.commit, TOOLS_SHA256: inputs.awg.tools.archiveSha256 };
}

export function localImage(artifact: ImageArtifact): string { return `ghostline-${artifact}:${releaseTag(artifact)}`; }

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

export function releaseTag(protocol: ImageArtifact, inputs: ImageInputs = imageInputs): string {
  const hash = createHash('sha256');
  if (protocol === 'xray') hash.update(`ghcr.io/xtls/xray-core@${inputs.xray.imageDigest}`).update('\0').update(imagePlatform);
  // Include the target platform in each content identity.
  else hash.update(imagePlatform).update('\0');
  for (const [name, value] of Object.entries(releaseBuildArgs(protocol, inputs)).sort()) hash.update(name).update('\0').update(value).update('\0');
  // NUL separators distinguish filenames/content boundaries; pinned base images and build instructions are inputs.
  for (const [name, bytes] of Object.entries(releaseFiles(protocol)).sort()) hash.update(name).update('\0').update(bytes).update('\0');
  return `sha-${hash.digest('hex')}`;
}
