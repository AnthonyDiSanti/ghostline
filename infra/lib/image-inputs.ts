import { readFileSync } from 'node:fs';

export interface SourceRelease { tag: string; commit: string; archiveSha256: string }
export interface ImageInputs {
  schemaVersion: 1;
  resolvedAt: string;
  xray: { tag: string; commit: string; imageDigest: string };
  awg: { daemon: SourceRelease & { publicationDigest: string; workflowSha256: string }; tools: SourceRelease };
}
export const imageInputsPath = new URL('../image-inputs.json', import.meta.url);
export const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha256 = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;

export function validateImageInputs(value: unknown): ImageInputs {
  // The lock is data, never a source of arbitrary download URLs or Docker arguments.
  const input = value as ImageInputs;
  const source = (item: SourceRelease) => item && stableTag.test(item.tag) && commit.test(item.commit) && sha256.test(item.archiveSha256);
  if (!input || input.schemaVersion !== 1 || !Number.isFinite(Date.parse(input.resolvedAt))
    || !stableTag.test(input.xray?.tag) || !commit.test(input.xray?.commit) || !digest.test(input.xray?.imageDigest)
    || !source(input.awg?.daemon) || !source(input.awg?.tools)
    || !digest.test(input.awg.daemon.publicationDigest) || !sha256.test(input.awg.daemon.workflowSha256)) {
    throw new Error('Invalid resolved image inputs. Run npm run images:build.');
  }
  return input;
}

export function loadImageInputs(): ImageInputs {
  // Only the build's test subprocess overrides this path; synth and deployment stay fully offline.
  return validateImageInputs(JSON.parse(readFileSync(process.env.GHOSTLINE_IMAGE_INPUTS ?? imageInputsPath, 'utf8')));
}
