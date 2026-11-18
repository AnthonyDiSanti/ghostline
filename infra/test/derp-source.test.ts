import { describe, expect, it } from 'vitest';
import { resolveStableDerp, type ReleaseReader } from '../lib/stable-images.js';
import { imageInputs, releaseBuildArgs, releaseTag } from '../lib/ecs-release.js';
import { validateImageInputs } from '../lib/image-inputs.js';
import { upstreamDownloadCommand } from '../lib/upstream-download.js';

const commit = 'a'.repeat(40), toolchain = 'b'.repeat(40), hash = 'c'.repeat(64);
function source(overrides: Record<string, any> = {}) {
  // Assert every trust decision using explicit public upstream responses; no registry/network mock framework.
  const requests: string[] = [];
  const records: Record<string, unknown> = {
    'https://api.github.com/repos/tailscale/tailscale/releases/latest': { tag_name: 'v1.104.7', draft: false, prerelease: false },
    'https://api.github.com/repos/tailscale/tailscale/commits/v1.104.7': { sha: commit },
    [`https://api.github.com/repos/tailscale/go/releases/tags/build-${toolchain}`]: {
      tag_name: `build-${toolchain}`, draft: false, prerelease: true, assets: [{ name: 'linux-arm64.tar.gz', digest: `sha256:${hash}`,
        browser_download_url: `https://github.com/tailscale/go/releases/download/build-${toolchain}/linux-arm64.tar.gz` }],
    }, ...overrides,
  };
  const reader: ReleaseReader = { manifest: () => { throw new Error('DERP has no official runtime image'); }, download: url => {
    requests.push(url);
    if (url in records) return Buffer.from(JSON.stringify(records[url]));
    if (url.endsWith('/go.toolchain.rev')) return Buffer.from(toolchain + '\n');
    if (url.startsWith('https://codeload.github.com/')) return Buffer.from('synthetic source archive');
    throw new Error('Unexpected metadata request');
  } };
  return { reader, requests };
}

describe('DERP official source and forked toolchain', () => {
  it('selects only the classified stable source and its exact published ARM64 toolchain', () => {
    const { reader, requests } = source();
    const result = resolveStableDerp(reader);
    expect(result).toMatchObject({ tag: 'v1.104.7', commit, toolchainRevision: toolchain, toolchainSha256: hash });
    expect(result.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const url of requests) expect(() => upstreamDownloadCommand(url)).not.toThrow();
  });
  it('rejects a toolchain without its published checksum or with an unrelated URL', () => {
    for (const asset of [{ name: 'linux-arm64.tar.gz' }, { name: 'linux-arm64.tar.gz', digest: `sha256:${hash}`, browser_download_url: 'https://example.test/go' }]) {
      const { reader } = source({ [`https://api.github.com/repos/tailscale/go/releases/tags/build-${toolchain}`]: {
        tag_name: `build-${toolchain}`, draft: false, prerelease: false, assets: [asset],
      } });
      expect(() => resolveStableDerp(reader)).toThrow('verified official ARM64');
    }
  });
  it('rejects prereleases and moving source tags', () => {
    const unstable = source({ 'https://api.github.com/repos/tailscale/tailscale/releases/latest': { tag_name: 'v1.104.7', draft: false, prerelease: true } });
    expect(() => resolveStableDerp(unstable.reader)).toThrow('stable');
    const { reader } = source();
    const read = reader.download;
    let revisions = 0;
    reader.download = url => url.includes('/commits/') && ++revisions > 1 ? Buffer.from(JSON.stringify({ sha: 'd'.repeat(40) })) : read(url);
    expect(() => resolveStableDerp(reader)).toThrow('tag moved');
  });
  it('binds toolchain changes to the image identity and requires complete DERP inputs', () => {
    const derp = resolveStableDerp(source().reader);
    const inputs = validateImageInputs({ ...imageInputs, schemaVersion: 3, derp });
    expect(releaseBuildArgs('derp', inputs).DERP_GO_REV).toBe(toolchain);
    expect(releaseTag('derp', inputs)).not.toBe(releaseTag('derp', { ...inputs, derp: { ...derp, toolchainSha256: 'e'.repeat(64) } }));
    expect(() => validateImageInputs({ ...inputs, derp: undefined })).toThrow('DERP');
  });
});
