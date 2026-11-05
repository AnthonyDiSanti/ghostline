import { describe, expect, it } from 'vitest';
import { arm64Digest, resolveStableCoreDns, resolveStableImages, stableRelease, type ReleaseReader } from '../lib/stable-images.js';
import { validateImageInputs } from '../lib/image-inputs.js';
import { imageArtifacts, imageInputs, releaseBuildArgs, releaseTag } from '../lib/ecs-release.js';

const sha = 'a'.repeat(40), digest = `sha256:${'b'.repeat(64)}`;
const manifest = { manifests: [{ digest, platform: { os: 'linux', architecture: 'arm64' } }] };
function upstream(overrides: Record<string, unknown> = {}) {
  // A full resolver fixture exercises published-channel selection without network or Docker access.
  const requests: string[] = [];
  const records: Record<string, unknown> = {
    'XTLS/Xray-core/releases/latest': { tag_name: 'v26.3.27', draft: false, prerelease: false },
    'coredns/coredns/releases/latest': { tag_name: 'v1.15.0', draft: false, prerelease: false },
    'amnezia-vpn/amneziawg-tools/releases/latest': { tag_name: 'v3.1.20260812', draft: false, prerelease: false },
    'amnezia-vpn/amneziawg-go/releases?per_page=1': [],
    'amnezia-vpn/amneziawg-go/tags?per_page=100&page=1': [
      { name: 'v9.0.0-rc1' }, { name: 'main' }, { name: 'v3.9.0' }, { name: 'v3.10.0' }, { name: 'nightly' },
    ], ...overrides,
  };
  const reader: ReleaseReader = {
    download: url => {
      requests.push(url);
      const path = url.replace('https://api.github.com/repos/', '');
      if (path in records) return Buffer.from(JSON.stringify(records[path]));
      if (url.includes('/commits/')) return Buffer.from(JSON.stringify({ sha }));
      if (url.startsWith('https://codeload.github.com/')) return Buffer.from('source archive');
      if (url.endsWith('/.github/workflows/build-if-tag.yml')) return Buffer.from(
        "tags: 'v[0-9]+.[0-9]+.[0-9]+'\nimages: amneziavpn/${{ env.APP }}\ntags: type=semver,pattern={{version}}",
      );
      throw new Error(`Unexpected fixture URL: ${url}`);
    },
    manifest: image => { requests.push(image); return image.startsWith('ghcr.io/') || image.startsWith('coredns/coredns:') ? manifest : { digest }; },
  };
  return { reader, requests };
}

describe('official stable selection', () => {
  it.each([
    { tag_name: 'v26.7.28', draft: false, prerelease: true },
    { tag_name: 'v26.3.27', draft: true, prerelease: false },
    { tag_name: 'v26.3.27' },
    { tag_name: 'v26.9.9-rc1', draft: false, prerelease: false },
    { tag_name: 'latest', draft: false, prerelease: false },
  ])('rejects an unstable or unclassified latest response', value => expect(() => stableRelease(value)).toThrow('stable'));
  it('selects classified Xray, tools and CoreDNS releases plus the published daemon tag', () => {
    const { reader, requests } = upstream();
    const result = resolveStableImages(reader, new Date('2026-09-19T00:00:00Z'));
    expect(result.xray.tag).toBe('v26.3.27');
    expect(result.awg.daemon.tag).toBe('v3.10.0');
    expect(result.awg.tools.tag).toBe('v3.1.20260812');
    expect(result.coredns).toEqual({ tag: 'v1.15.0', commit: sha, imageDigest: digest });
    expect(result.awg.daemon.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(requests).toContain('amneziavpn/amneziawg-go:3.10.0');
    expect(requests).toContain('coredns/coredns:1.15.0');
    expect(requests.some(url => url.includes('tar.gz/v') || url.endsWith(':latest'))).toBe(false);
  });
  it('continues tag pagination instead of assuming the first page contains the newest version', () => {
    const { reader } = upstream({
      'amnezia-vpn/amneziawg-go/tags?per_page=100&page=1': Array.from({ length: 100 }, (_, i) => ({ name: `v1.0.${i}` })),
      'amnezia-vpn/amneziawg-go/tags?per_page=100&page=2': [{ name: 'v3.1.0' }],
    });
    expect(resolveStableImages(reader).awg.daemon.tag).toBe('v3.1.0');
  });
  it('fails closed when the selected daemon tag has not been published', () => {
    const { reader } = upstream();
    reader.manifest = image => image.startsWith('ghcr.io/') ? manifest : {};
    expect(() => resolveStableImages(reader)).toThrow('published');
  });
  it('rejects a changed daemon publication policy', () => {
    const { reader } = upstream();
    const download = reader.download;
    reader.download = url => url.includes('build-if-tag.yml') ? Buffer.from('tags: latest') : download(url);
    expect(() => resolveStableImages(reader)).toThrow('policy changed');
  });
  it('rejects an unclassified CoreDNS release or missing ARM64 image', () => {
    const unclassified = upstream({ 'coredns/coredns/releases/latest': { tag_name: 'v1.15.1', prerelease: false } });
    expect(() => resolveStableImages(unclassified.reader)).toThrow('stable');
    const unpublished = upstream();
    const manifest = unpublished.reader.manifest;
    unpublished.reader.manifest = image => image.startsWith('coredns/coredns:') ? { manifests: [] } : manifest(image);
    expect(() => resolveStableImages(unpublished.reader)).toThrow('ARM64');
  });
  it('resolves CoreDNS independently without querying engine release channels', () => {
    const { reader, requests } = upstream();
    expect(resolveStableCoreDns(reader)).toEqual({ tag: 'v1.15.0', commit: sha, imageDigest: digest });
    expect(requests.every(request => request.includes('coredns'))).toBe(true);
  });
  it('requires a policy review if the daemon introduces GitHub release classifications', () => {
    const { reader } = upstream({ 'amnezia-vpn/amneziawg-go/releases?per_page=1': [{ tag_name: 'v3.10.0', prerelease: true }] });
    expect(() => resolveStableImages(reader)).toThrow('release channel changed');
  });
  it('rejects source refs moving during resolution', () => {
    const { reader } = upstream();
    const download = reader.download;
    let calls = 0;
    reader.download = url => url.includes('XTLS/Xray-core/commits/') && ++calls > 1
      ? Buffer.from(JSON.stringify({ sha: 'c'.repeat(40) })) : download(url);
    expect(() => resolveStableImages(reader)).toThrow('tag moved');
  });
  it('rejects a CoreDNS tag that moves during resolution', () => {
    const { reader } = upstream();
    const download = reader.download;
    let calls = 0;
    reader.download = url => url.includes('coredns/coredns/commits/') && ++calls > 1
      ? Buffer.from(JSON.stringify({ sha: 'c'.repeat(40) })) : download(url);
    expect(() => resolveStableImages(reader)).toThrow('tag moved');
  });
  it.each([
    {}, { manifests: [] },
    { manifests: [{ digest, platform: { os: 'linux', architecture: 'amd64' } }] },
    { manifests: [...manifest.manifests, ...manifest.manifests] },
    { manifests: [{ ...manifest.manifests[0], digest: 'latest' }] },
  ])('rejects absent, ambiguous or malformed ARM64 image identity', value => expect(() => arm64Digest(value)).toThrow('ARM64'));
});

describe('recorded build identity', () => {
  it('keeps resolution timestamps out of all content tags', () => {
    const changed = { ...imageInputs, resolvedAt: new Date().toISOString() };
    for (const artifact of imageArtifacts) expect(releaseTag(artifact, changed)).toBe(releaseTag(artifact));
  });
  it('changes only affected artifact identities when upstream bytes change', () => {
    const changed = structuredClone(imageInputs);
    changed.awg.daemon.archiveSha256 = 'd'.repeat(64);
    expect(releaseTag('awg', changed)).not.toBe(releaseTag('awg'));
    expect(releaseTag('xray', changed)).toBe(releaseTag('xray'));
    expect(releaseTag('gateway-config', changed)).toBe(releaseTag('gateway-config'));
    changed.xray.imageDigest = `sha256:${'e'.repeat(64)}`;
    expect(releaseTag('xray', changed)).not.toBe(releaseTag('xray'));
    changed.coredns.imageDigest = `sha256:${'f'.repeat(64)}`;
    expect(releaseTag('dns-policy', changed)).not.toBe(releaseTag('dns-policy'));
    expect(releaseTag('gateway-config', changed)).toBe(releaseTag('gateway-config'));
  });
  it('passes both exact source commits and checksums into BuildKit', () => {
    expect(releaseBuildArgs('awg')).toEqual({ AWG_COMMIT: imageInputs.awg.daemon.commit,
      AWG_SHA256: imageInputs.awg.daemon.archiveSha256, TOOLS_COMMIT: imageInputs.awg.tools.commit,
      TOOLS_SHA256: imageInputs.awg.tools.archiveSha256 });
    expect(releaseBuildArgs('dns-policy')).toEqual({ COREDNS_VERSION: imageInputs.coredns.tag.slice(1),
      COREDNS_DIGEST: imageInputs.coredns.imageDigest });
  });
  it('rejects mutable refs and argument injection in recorded inputs', () => {
    const changed = structuredClone(imageInputs);
    changed.awg.daemon.commit = 'main --build-arg unsafe';
    expect(() => validateImageInputs(changed)).toThrow('Invalid');
    changed.awg.daemon.commit = imageInputs.awg.daemon.commit;
    changed.coredns.imageDigest = 'latest';
    expect(() => validateImageInputs(changed)).toThrow('Invalid');
  });
});
