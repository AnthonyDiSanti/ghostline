import { beforeEach, expect, it, vi } from 'vitest';
import { BatchDeleteImageCommand, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { pruneRegionalArtifacts } from '../lib/releases/retention-operator.js';
import type { EcrRegistry } from '../lib/releases/registry.js';

const mocked = vi.hoisted(() => ({ readRelease: vi.fn(), history: vi.fn(), plan: vi.fn() }));
vi.mock('../lib/releases/registry.js', async original => ({ ...await original<object>(), readRelease: mocked.readRelease }));
vi.mock('../lib/releases/publication.js', () => ({ releaseHistory: mocked.history }));
vi.mock('../lib/releases/retention.js', () => ({ planArtifactCleanup: mocked.plan }));
const digest = `sha256:${'a'.repeat(64)}`;
const current = { digest, release: { history: [] } };

beforeEach(() => {
  // Planning already has behavioral coverage; isolate the operator's exclusion/deletion boundary here.
  vi.resetAllMocks();
  mocked.readRelease.mockResolvedValue(current);
  mocked.history.mockResolvedValue([]);
  mocked.plan.mockReturnValue({ remove: [{ repository: 'ghostline/prod/xray', digest }] });
});

function fixture() {
  // Empty inventory reads avoid real AWS while the planned candidate exercises the guarded deletion path.
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof DescribeImagesCommand) return { imageDetails: [] };
    if (command instanceof BatchDeleteImageCommand) return {};
    throw Error('Unexpected AWS operation');
  });
  const get = vi.fn().mockResolvedValue(undefined), report = vi.fn();
  const registry = { region: 'eu-west-1', client: { send }, get } as unknown as EcrRegistry;
  return { registry, send, get, report, run: () => pruneRegionalArtifacts(registry, async () => { throw Error('No credentials expected'); }, undefined, report) };
}

it('finishes safely without inventory or deletion while publication protection exists', async () => {
  const f = fixture(); f.get.mockResolvedValue({ manifest: '{}' });
  await expect(f.run()).resolves.toBeUndefined();
  expect(f.send).not.toHaveBeenCalled();
  expect(mocked.plan).not.toHaveBeenCalled();
  expect(f.report).toHaveBeenCalledWith(expect.stringContaining('deferred'));
});

it.each(['marker', 'intent'])('defers without deletion when publication %s changes after planning', async change => {
  const f = fixture();
  if (change === 'marker') f.get.mockResolvedValueOnce(undefined).mockResolvedValue({ manifest: '{}' });
  else mocked.readRelease.mockResolvedValueOnce(current).mockResolvedValue({ ...current, digest: `sha256:${'b'.repeat(64)}` });
  await expect(f.run()).resolves.toBeUndefined();
  expect(f.send.mock.calls.every(([command]) => command instanceof DescribeImagesCommand)).toBe(true);
  expect(f.report).toHaveBeenCalledWith(expect.stringContaining('deferred'));
});

it('preserves an uncertain AWS deletion failure for the lifecycle owner to investigate', async () => {
  const f = fixture();
  f.send.mockImplementation(async command => {
    if (command instanceof BatchDeleteImageCommand) throw Error('Uncertain deletion acknowledgement');
    return { imageDetails: [] };
  });
  await expect(f.run()).rejects.toThrow('Uncertain deletion acknowledgement');
  expect(f.report).not.toHaveBeenCalled();
});
