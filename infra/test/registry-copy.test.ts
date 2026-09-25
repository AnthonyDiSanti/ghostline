import { ECRClient } from '@aws-sdk/client-ecr';
import { expect, it, vi } from 'vitest';
import { copyImage, EcrRegistry, type Manifest } from '../lib/releases/registry.js';
import { digest } from '../lib/releases/model.js';

it('resumes an interrupted copy without downloading layers already uploaded', async () => {
  const bytes = Buffer.from('existing layer');
  const layer = { digest: digest(bytes), size: bytes.length };
  const manifest = JSON.stringify({ schemaVersion: 2, layers: [layer] });
  const image: Manifest = { digest: digest(manifest), manifest, mediaType: 'test' };
  const source = { get: vi.fn(async () => image), blob: vi.fn(async () => bytes) };
  const target = { get: vi.fn(async () => undefined), hasBlob: vi.fn(async () => true),
    uploadBlob: vi.fn(), put: vi.fn() };
  // A prior upload can finish before its manifest is registered; this is still useful resumable progress.
  await copyImage(source as unknown as EcrRegistry, target as unknown as EcrRegistry, 'source', 'target', image.digest, 'tag');
  expect(source.blob).not.toHaveBeenCalled();
  expect(target.uploadBlob).not.toHaveBeenCalled();
  expect(target.put).toHaveBeenCalledWith('target', image, 'tag');
});

it('reports nonsecret transfer progress and stops before manifest publication on a missing layer', async () => {
  const layer = { digest: digest('layer'), size: 5 };
  const manifest = JSON.stringify({ schemaVersion: 2, config: layer });
  const image = { digest: digest(manifest), manifest, mediaType: 'test' };
  const source = { get: vi.fn(async () => image), blob: vi.fn(async () => { throw new Error('Timeout'); }) };
  const target = { get: vi.fn(async () => undefined), hasBlob: vi.fn(async () => false), uploadBlob: vi.fn(), put: vi.fn() };
  const report = vi.fn();
  await expect(copyImage(source as unknown as EcrRegistry, target as unknown as EcrRegistry, 'source', 'target', image.digest, 'tag', report)).rejects.toThrow('Timeout');
  expect(report).toHaveBeenCalledWith(`target: transfer ${layer.digest} (5 bytes).`);
  expect(target.put).not.toHaveBeenCalled();
});

it.each([false, true])('checks exact upload byte acknowledgement (truncated=%s)', async truncated => {
  const bytes = Buffer.alloc(5 * 1024 * 1024 + 17, 23);
  const parts: Array<[number, number]> = [];
  let completed = false;
  const client = { send: async (command: { constructor: { name: string }; input: any }, options?: { requestTimeout: number; abortSignal: AbortSignal }) => {
    switch (command.constructor.name) {
      case 'BatchCheckLayerAvailabilityCommand': return { layers: [] };
      case 'InitiateLayerUploadCommand': return { uploadId: 'upload', partSize: 10 * 1024 * 1024 };
      case 'UploadLayerPartCommand':
        expect(options?.requestTimeout).toBe(600_000);
        expect(options?.abortSignal.aborted).toBe(false);
        parts.push([command.input.partFirstByte, command.input.partLastByte]);
        return { lastByteReceived: command.input.partLastByte - (truncated ? 1 : 0) };
      case 'CompleteLayerUploadCommand': completed = true; return { layerDigest: digest(bytes) };
      default: throw Error('Unexpected registry operation');
    }
  } };
  const registry = new EcrRegistry(client as unknown as ECRClient, '123456789012', 'eu-west-1');
  if (truncated) {
    await expect(registry.uploadBlob('repo', bytes)).rejects.toThrow('acknowledge');
    expect(completed).toBe(false);
  } else {
    await registry.uploadBlob('repo', bytes);
    expect(parts).toEqual([[0, 5 * 1024 * 1024 - 1], [5 * 1024 * 1024, bytes.length - 1]]);
    expect(completed).toBe(true);
  }
});
