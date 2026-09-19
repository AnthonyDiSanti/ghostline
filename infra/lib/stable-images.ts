import { createHash } from 'node:crypto';
import { stableTag, validateImageInputs, type ImageInputs, type SourceRelease } from './image-inputs.js';

export interface ReleaseReader {
  download: (url: string) => Buffer;
  manifest: (image: string) => any;
}
const api = 'https://api.github.com/repos/';
const xrayRepo = 'XTLS/Xray-core';
const daemonRepo = 'amnezia-vpn/amneziawg-go';
const toolsRepo = 'amnezia-vpn/amneziawg-tools';
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export function stableRelease(value: any): string {
  // Never fall back to newest, main or an unclassified registry latest tag.
  if (value?.draft !== false || value?.prerelease !== false || !stableTag.test(value?.tag_name)) {
    throw new Error('Upstream latest release is not an official stable version.');
  }
  return value.tag_name;
}

export function arm64Digest(manifest: any): string {
  const matches = manifest?.manifests?.filter((item: any) => item.platform?.os === 'linux'
    && item.platform?.architecture === 'arm64' && (!item.platform.variant || item.platform.variant === 'v8'));
  if (matches?.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(matches[0].digest)) throw new Error('Expected exactly one Linux ARM64 upstream image.');
  return matches[0].digest;
}

export function resolveStableImages(reader: ReleaseReader, now = new Date()): ImageInputs {
  const json = (path: string) => JSON.parse(reader.download(`${api}${path}`).toString('utf8'));
  function revision(repo: string, tag: string): string {
    // The commits endpoint dereferences annotated and lightweight tags; archive URLs use the resulting SHA.
    const result = json(`${repo}/commits/${tag}`)?.sha;
    if (!/^[a-f0-9]{40}$/.test(result)) throw new Error('Invalid upstream source revision.');
    return result;
  }
  function source(repo: string, tag: string): SourceRelease {
    const commit = revision(repo, tag);
    const bytes = reader.download(`https://codeload.github.com/${repo}/tar.gz/${commit}`);
    // These upstream source archives have no published independent checksums. Record HTTPS/GitHub identity,
    // then have BuildKit verify this digest on its separate download; do not claim a publisher signature.
    return { tag, commit, archiveSha256: sha256(bytes) };
  }
  const xrayRelease = json(`${xrayRepo}/releases/latest`);
  const xrayTag = stableRelease(xrayRelease);
  const xray = { tag: xrayTag, commit: revision(xrayRepo, xrayTag),
    imageDigest: arm64Digest(reader.manifest(`ghcr.io/xtls/xray-core:${xrayTag.slice(1)}`)) };

  // The daemon has no GitHub Releases. Its official workflow publishes strict numeric semver tags
  // to Docker Hub. Require both the source tag and its published versioned image; never use latest.
  const daemonReleases = json(`${daemonRepo}/releases?per_page=1`);
  if (!Array.isArray(daemonReleases) || daemonReleases.length !== 0) {
    throw new Error('AWG daemon release channel changed; review its official stable policy.');
  }
  const tags: string[] = [];
  for (let page = 1; ; page++) {
    if (page > 20) throw new Error('AWG tag pagination exceeded the supported bound.');
    const batch = json(`${daemonRepo}/tags?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Invalid AWG source tags.');
    tags.push(...batch.map(item => item.name).filter(name => typeof name === 'string' && stableTag.test(name)));
    if (batch.length < 100) break;
  }
  tags.sort((a, b) => {
    const left = a.slice(1).split('.').map(Number), right = b.slice(1).split('.').map(Number);
    return right[0]! - left[0]! || right[1]! - left[1]! || right[2]! - left[2]!;
  });
  if (!tags[0]) throw new Error('No stable AWG daemon tag found.');
  const daemon = source(daemonRepo, tags[0]);
  const workflow = reader.download(`https://raw.githubusercontent.com/${daemonRepo}/${daemon.commit}/.github/workflows/build-if-tag.yml`);
  if (!workflow.toString().includes("'v[0-9]+.[0-9]+.[0-9]+'") || !workflow.toString().includes('type=semver,pattern={{version}}')
    || !workflow.toString().includes('images: amneziavpn/')) throw new Error('AWG publication policy changed; review the upstream workflow.');
  const publicationDigest = reader.manifest(`amneziavpn/amneziawg-go:${daemon.tag.slice(1)}`)?.digest;
  if (!/^sha256:[a-f0-9]{64}$/.test(publicationDigest)) throw new Error('Stable AWG tag has no published official image.');
  const tools = source(toolsRepo, stableRelease(json(`${toolsRepo}/releases/latest`)));
  // Catch tags moving while resolving instead of producing mixed source/release evidence.
  for (const [repo, input] of [[xrayRepo, xray], [daemonRepo, daemon], [toolsRepo, tools]] as const) {
    if (revision(repo, input.tag) !== input.commit) throw new Error('Upstream tag moved during resolution.');
  }
  return validateImageInputs({ schemaVersion: 1, resolvedAt: now.toISOString(), xray,
    awg: { daemon: { ...daemon, publicationDigest, workflowSha256: sha256(workflow) }, tools } });
}
