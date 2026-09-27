import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BenchmarkCloud } from '../lib/benchmark/cloud.js';
import { createJournal } from '../lib/benchmark/model.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(async () => 'private-signed-fixture') }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
function fixture() {
  // Existing exact-owned fixture infrastructure isolates object preparation from CDK deployment in these tests.
  const journal = createJournal({ id: 'test', regions: ['eu-central-1'], source: 'stockholm-ecs', canary: { url: 'https://example.com', expectedText: 'Example' } });
  journal.fixture = true;
  const cloud = new BenchmarkCloud('/infra', '/private', '123456789012', journal, '/asset', '/catalog', () => {});
  vi.spyOn(cloud, 'stack').mockResolvedValue({ StackName: 'GhostlineBenchmark-test-fixture', StackId: 'owned',
    CreationTime: new Date(), StackStatus: 'CREATE_COMPLETE', Tags: [{ Key: 'BenchmarkCampaign', Value: 'test' }, { Key: 'BenchmarkOwner', Value: journal.owner }] });
  return cloud;
}
describe('prepared shared download fixture', () => {
  it('reuses the object and signed URL without uploading between paired samples', async () => {
    const cloud = fixture(), send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 12_500_000 } as never);
    expect(await cloud.fixture()).toBe('private-signed-fixture'); await cloud.fixture();
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });
  it('creates a confirmed missing object once', async () => {
    const cloud = fixture(), send = vi.spyOn(S3Client.prototype, 'send')
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NotFound' })).mockResolvedValue({} as never);
    await cloud.fixture(); await cloud.fixture();
    expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[1]![0]).toBeInstanceOf(PutObjectCommand);
  });
  it('refuses unreadable or unexpected objects instead of overwriting them', async () => {
    const cloud = fixture(), send = vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(cloud.fixture()).rejects.toThrow('denied'); expect(send).toHaveBeenCalledOnce();
    send.mockResolvedValueOnce({ ContentLength: 1 } as never);
    await expect(cloud.fixture()).rejects.toThrow('size'); expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
