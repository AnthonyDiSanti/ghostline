import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imagePlatform, officialXrayImage, releaseFiles, releaseTag, type ImageArtifact } from './ecs-release.js';

export type DockerCommand = (args: string[]) => string;

export function assertOfficialXray(image: string, docker: DockerCommand): void {
  // Compare selected image metadata only: never inspect runtime container environments.
  const format = '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"layers":{{json .RootFS.Layers}}}';
  const expected = docker(['image', 'inspect', officialXrayImage, '--format', format]).trim();
  const actual = docker(['image', 'inspect', image, '--format', format]).trim();
  if (actual !== expected || JSON.parse(actual).architecture !== 'amd64') throw new Error('Mirrored Xray image differs from pinned upstream content.');
}

export function prepareImage(artifact: ImageArtifact, work: string, docker: DockerCommand): string {
  // Shared by publication and AWS-free tests; disposable contexts contain only allowed source files.
  const image = `ghostline-${artifact}:${releaseTag(artifact)}`;
  if (artifact === 'xray') {
    docker(['pull', '--platform', imagePlatform, officialXrayImage]);
    docker(['tag', officialXrayImage, image]);
    assertOfficialXray(image, docker);
    return image;
  }
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const folder = mkdtempSync(join(work, `${artifact}-`));
  try {
    for (const [name, bytes] of Object.entries(releaseFiles(artifact))) writeFileSync(join(folder, name), bytes);
    docker(['buildx', 'build', '--platform', imagePlatform, '--load', '-t', image, folder]);
    return image;
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
