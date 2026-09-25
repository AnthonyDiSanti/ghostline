import { execFileSync } from 'node:child_process';
import { digest, digestPattern } from './model.js';
import type { ImageSource, Manifest } from './registry.js';

export class OciArchive implements ImageSource {
  constructor(private readonly path: string) {}
  private read(name: string): Buffer {
    // Read exact allowlisted members without extracting paths or following archive symlinks onto the filesystem.
    return execFileSync('tar', ['-xOf', this.path, name], { maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  async root(expectedIdentity?: string): Promise<Manifest> {
    const index = JSON.parse(this.read('index.json').toString());
    // Containerd also exports detached attestations from other builds sharing this image. They are not additional runnable roots.
    const roots = [...new Set<string>((index.manifests ?? []).filter((m: any) => !m.artifactType).map((m: any) => m.digest))];
    if (index.schemaVersion === 2 && expectedIdentity && roots.includes(expectedIdentity)) return this.get('', expectedIdentity);
    if (index.schemaVersion !== 2 || roots.length !== 1) throw new Error('Expected one complete OCI image export.');
    return this.get('', roots[0]!);
  }
  async blob(_repository: string, hash: string): Promise<Uint8Array> {
    // Both member selection and content are digest-bound; Docker archive metadata never supplies a filesystem path.
    if (!digestPattern.test(hash)) throw new Error('Invalid OCI member digest.');
    const bytes = this.read(`blobs/sha256/${hash.slice(7)}`);
    if (digest(bytes) !== hash) throw new Error('OCI export content checksum mismatch.');
    return bytes;
  }
  async get(repository: string, hash: string): Promise<Manifest> {
    const manifest = Buffer.from(await this.blob(repository, hash)).toString();
    const value = JSON.parse(manifest);
    if (value.schemaVersion !== 2 || !['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(value.mediaType)) {
      throw new Error('Unsupported OCI export manifest.');
    }
    return { digest: hash, manifest, mediaType: value.mediaType };
  }
}
