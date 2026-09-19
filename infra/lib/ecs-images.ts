import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageArchitecture, imageArtifacts, imageInputs, imagePlatform, localImage, officialXrayImage, releaseBuildArgs, releaseFiles, releaseTag, type ImageArtifact } from './ecs-release.js';

export type DockerCommand = (args: string[]) => string;

export async function publishImageSet(operations: {
  existing: (artifact: ImageArtifact, tag: string) => string | undefined;
  build: (artifact: ImageArtifact) => string;
  test: (images: Record<ImageArtifact, string>) => Promise<void>;
  push: (artifact: ImageArtifact, tag: string, imageId: string) => void;
}): Promise<Record<ImageArtifact, string>> {
  // Reuse immutable regional bytes where present. Test the entire set before pushing anything,
  // and carry content IDs across the gate so mutable local tags cannot swap out a tested artifact.
  const selected = {} as Record<ImageArtifact, string>;
  const missing = new Set<ImageArtifact>();
  const tags = Object.fromEntries(imageArtifacts.map(artifact => [artifact, releaseTag(artifact)]));
  for (const artifact of imageArtifacts) {
    const existing = operations.existing(artifact, tags[artifact]!);
    if (!existing) missing.add(artifact);
    selected[artifact] = existing ?? operations.build(artifact);
    if (!/^sha256:[a-f0-9]{64}$/.test(selected[artifact])) throw new Error('Publication requires exact local image IDs.');
  }
  await operations.test({ ...selected });
  for (const artifact of missing) operations.push(artifact, tags[artifact]!, selected[artifact]);
  return selected;
}

export function assertImagePlatform(image: string, docker: DockerCommand): void {
  // A pinned base or a stale local tag can override build intent; inspect before publication.
  if (docker(['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}']).trim() !== imagePlatform) {
    throw new Error('Image platform differs from the selected architecture.');
  }
}

export function assertOfficialXray(image: string, docker: DockerCommand): void {
  // Compare selected image metadata only: never inspect runtime container environments.
  const format = '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"layers":{{json .RootFS.Layers}}}';
  const expected = docker(['image', 'inspect', officialXrayImage, '--format', format]).trim();
  const actual = docker(['image', 'inspect', image, '--format', format]).trim();
  if (actual !== expected || JSON.parse(actual).architecture !== imageArchitecture || JSON.parse(actual).os !== 'linux') throw new Error('Mirrored Xray image differs from resolved upstream content.');
}

export function prepareImage(artifact: ImageArtifact, work: string, docker: DockerCommand): string {
  // Shared by publication and AWS-free tests; disposable contexts contain only allowed source files.
  const image = localImage(artifact);
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const folder = mkdtempSync(join(work, `${artifact}-`));
  try {
    if (artifact === 'xray') {
      // Docker verifies the manifest/config/layer digests during pull. Upstream disables OCI provenance;
      // its separately built ZIP cannot authenticate this image, so also reject an unexpected engine version.
      docker(['pull', '--platform', imagePlatform, officialXrayImage]);
      assertImagePlatform(officialXrayImage, docker);
      const version = docker(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--platform', imagePlatform, officialXrayImage, 'version']);
      if (version.split(/\s+/)[1] !== imageInputs.xray.tag.slice(1)) throw new Error('Official Xray image reports an unexpected version.');
      docker(['tag', officialXrayImage, image]);
      assertOfficialXray(image, docker);
      return image;
    }
    for (const [name, bytes] of Object.entries(releaseFiles(artifact))) writeFileSync(join(folder, name), bytes);
    const args = Object.entries(releaseBuildArgs(artifact)).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]);
    docker(['buildx', 'build', '--platform', imagePlatform, '--load', ...args, '-t', image, folder]);
    assertImagePlatform(image, docker);
    return image;
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
