import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { releaseTag } from '../lib/ecs-release.js';
import { digest, manifestType } from '../lib/releases/model.js';
import { OciArchive } from '../lib/releases/oci-archive.js';
import { publishQualifiedImage } from '../lib/releases/image-publication.js';
import type { EcrRegistry, Manifest } from '../lib/releases/registry.js';

function fixture(corrupt = false, detached = false) {
  // Real tiny OCI archives exercise tar/member/checksum handling without Docker, credentials or cloud calls.
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-oci-test-'));
  mkdirSync(join(folder, 'blobs/sha256'), { recursive: true });
  const config = Buffer.from('{}');
  const layer = Buffer.from('synthetic layer');
  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: manifestType,
    config: { digest: digest(config), size: config.length }, layers: [{ digest: digest(layer), size: layer.length }] });
  const hash = digest(manifest);
  for (const bytes of [config, layer, Buffer.from(manifest)]) {
    writeFileSync(join(folder, 'blobs/sha256', digest(bytes).slice(7)), corrupt && bytes === layer ? 'wrong' : bytes);
  }
  writeFileSync(join(folder, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [{ digest: hash },
    ...(detached ? [{ digest: digest('other-build-attestation'), artifactType: 'application/vnd.docker.attestation.manifest.v1+json' }] : [])] }));
  const path = join(folder, 'image.tar');
  execFileSync('tar', ['-cf', path, '-C', folder, 'index.json', 'blobs']);
  return { path, hash, config, layer, archive: new OciArchive(path), cleanup: () => rmSync(folder, { recursive: true, force: true }) };
}
it('reads the exact exported descriptor and rejects arbitrary member paths', async () => {
  const f = fixture();
  try {
    expect((await f.archive.root()).digest).toBe(f.hash);
    expect(Buffer.from(await f.archive.blob('', digest(f.layer)))).toEqual(f.layer);
    await expect(f.archive.blob('', '../../etc/passwd')).rejects.toThrow('digest');
  } finally { f.cleanup(); }
});
it('rejects corrupted layer content before upload', async () => {
  const f = fixture(true);
  try { await expect(f.archive.blob('', digest(f.layer))).rejects.toThrow('checksum'); }
  finally { f.cleanup(); }
});
it('selects the captured image without treating detached containerd attestations as runnable roots', async () => {
  const f = fixture(false, true);
  try { expect((await f.archive.root(f.hash)).digest).toBe(f.hash); expect((await f.archive.root()).digest).toBe(f.hash); }
  finally { f.cleanup(); }
});
it('publishes exact qualified archive bytes through the bounded registry transfer and removes its temporary export', async () => {
  const f = fixture();
  const manifests = new Map<string, Manifest>();
  const uploadBlob = vi.fn();
  const target = { get: async (_r: string, reference: string) => manifests.get(reference), hasBlob: async () => false,
    uploadBlob, put: async (_r: string, m: Manifest, tag: string) => { manifests.set(m.digest, m); manifests.set(tag, m); } } as unknown as EcrRegistry;
  const docker = vi.fn((args: string[]) => { expect(args.slice(0, 3)).toEqual(['image', 'save', '--output']); copyFileSync(f.path, args[3]!); });
  try {
    const result = await publishQualifiedImage(target, 'test/bootstrap', 'bootstrap',
      { imageId: digest(f.config), buildTag: releaseTag('bootstrap') }, docker);
    expect(result.digest).toBe(f.hash); expect(uploadBlob).toHaveBeenCalledTimes(2);
    expect(docker).toHaveBeenCalledTimes(1);
    const { existsSync } = await import('node:fs'); expect(existsSync(docker.mock.calls[0]![0][3]!)).toBe(false);
  } finally { f.cleanup(); }
});
