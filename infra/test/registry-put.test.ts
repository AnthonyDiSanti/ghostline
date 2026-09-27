import { expect, it, vi } from 'vitest';
import type { ECRClient } from '@aws-sdk/client-ecr';
import { EcrRegistry, type Manifest } from '../lib/releases/registry.js';
import { digest } from '../lib/releases/model.js';

const bytes = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json' });
const manifest: Manifest = { manifest: bytes, digest: digest(bytes), mediaType: 'application/vnd.oci.image.manifest.v1+json' };

it('accepts a replication winner only after reading back the exact intended tag digest', async () => {
  // Native replication may land between the initial lookup and PutImage.
  const send = vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { name: 'ImageAlreadyExistsException' }));
  const registry = new EcrRegistry({ send } as unknown as ECRClient, '123456789012', 'eu-west-1');
  const get = vi.spyOn(registry, 'get').mockResolvedValueOnce(undefined).mockResolvedValueOnce(manifest);
  await expect(registry.put('ghostline/prod/bootstrap', manifest, 'keep-production')).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenNthCalledWith(2, 'ghostline/prod/bootstrap', 'keep-production');
});

it.each(['missing', 'different', 'denied', 'unrelated'])('refuses an unverified duplicate publication: %s', async mode => {
  // Neither a service exception nor an unreadable/moved alias proves a successful publication.
  const error = Object.assign(new Error('publication rejected'), { name: mode === 'unrelated' ? 'AccessDeniedException' : 'ImageAlreadyExistsException' });
  const send = vi.fn().mockRejectedValue(error);
  const registry = new EcrRegistry({ send } as unknown as ECRClient, '123456789012', 'eu-west-1');
  const get = vi.spyOn(registry, 'get').mockResolvedValueOnce(undefined);
  if (mode === 'denied') get.mockRejectedValueOnce(new Error('read denied'));
  else get.mockResolvedValueOnce(mode === 'different' ? { ...manifest, digest: `sha256:${'a'.repeat(64)}` } : undefined);
  await expect(registry.put('ghostline/prod/bootstrap', manifest, 'keep-production')).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
  if (mode === 'unrelated') expect(get).toHaveBeenCalledTimes(1);
});
