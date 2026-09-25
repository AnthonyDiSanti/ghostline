import { expect, it, vi } from 'vitest';
import { releaseTag } from '../lib/ecs-release.js';
import { publishQualifiedImage } from '../lib/releases/image-publication.js';
import type { EcrRegistry } from '../lib/releases/registry.js';
const imageId = `sha256:${'a'.repeat(64)}`;
function fixture(configId = imageId) {
  // The registry root and Docker content ID can differ; compare the root's actual runtime config identity.
  const manifest = { digest: `sha256:${'b'.repeat(64)}`, mediaType: 'image', manifest: JSON.stringify({ config: { digest: configId } }) };
  const get = vi.fn(async () => manifest);
  const registry = { account: '123456789012', region: 'eu-west-1', get } as unknown as EcrRegistry;
  return { registry, get, docker: vi.fn(), manifest };
}
it('reuses already-published exact qualified bytes without a rebuild or a push', async () => {
  const f = fixture();
  const result = await publishQualifiedImage(f.registry, 'test/bootstrap', 'bootstrap', { imageId, buildTag: releaseTag('bootstrap') }, f.docker);
  expect(result.digest).toBe(f.manifest.digest); expect(f.docker).not.toHaveBeenCalled();
});
it('rejects stale source qualification before touching the registry', async () => {
  const f = fixture();
  await expect(publishQualifiedImage(f.registry, 'test/bootstrap', 'bootstrap', { imageId, buildTag: 'old' }, f.docker)).rejects.toThrow('Qualification');
  expect(f.get).not.toHaveBeenCalled(); expect(f.docker).not.toHaveBeenCalled();
});
it('rejects published content that is not the qualified local image', async () => {
  const f = fixture(`sha256:${'c'.repeat(64)}`);
  await expect(publishQualifiedImage(f.registry, 'test/bootstrap', 'bootstrap', { imageId, buildTag: releaseTag('bootstrap') }, f.docker)).rejects.toThrow('differ');
});
