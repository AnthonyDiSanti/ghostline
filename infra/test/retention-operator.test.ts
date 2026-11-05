import { expect, it } from 'vitest';
import { regionalArtifactInventory } from '../lib/releases/retention-operator.js';
import { releaseRepository, repository, type Release } from '../lib/releases/model.js';
import { EcrRegistry, type ReleaseRecord } from '../lib/releases/registry.js';

function fixture(schemaVersion: Release['schemaVersion'], failure = 'RepositoryNotFoundException') {
  // Keep the ECR inventory empty so each result isolates repository-presence policy, not deletion planning.
  const scanned: string[] = [];
  const client = { send: async (command: { input: { repositoryName: string } }) => {
    const name = command.input.repositoryName;
    scanned.push(name);
    if (name === repository('dns-policy')) throw Object.assign(new Error('DNS repository unavailable'), { name: failure });
    return { imageDetails: [] };
  } };
  const registry = new EcrRegistry(client as unknown as ConstructorParameters<typeof EcrRegistry>[0], '000000000000', 'eu-west-1');
  const history = [{ release: { schemaVersion } as Release }] as ReleaseRecord[];
  return { registry, history, scanned };
}

it('scans existing repositories and tolerates an absent DNS repository for a five-image window', async () => {
  const f = fixture(3);
  expect(await regionalArtifactInventory(f.registry, f.history, [])).toEqual([]);
  expect(f.scanned).toContain(repository('dns-policy'));
  expect(f.scanned).toContain(releaseRepository);
});

it('requires the DNS repository when retained history or runtime refers to it', async () => {
  const history = fixture(4);
  await expect(regionalArtifactInventory(history.registry, history.history, [])).rejects.toMatchObject({ name: 'RepositoryNotFoundException' });
  const runtime = fixture(3);
  await expect(regionalArtifactInventory(runtime.registry, runtime.history,
    [{ repository: repository('dns-policy'), digest: `sha256:${'a'.repeat(64)}` }]))
    .rejects.toMatchObject({ name: 'RepositoryNotFoundException' });
});

it('does not hide DNS authorization or inventory failures', async () => {
  const f = fixture(3, 'AccessDeniedException');
  await expect(regionalArtifactInventory(f.registry, f.history, [])).rejects.toMatchObject({ name: 'AccessDeniedException' });
});

it('does not accept a repository disappearing midway through a paginated scan', async () => {
  // A partial inventory cannot justify deleting any image, even when DNS is absent from the protected window.
  const f = fixture(3);
  let dnsPages = 0;
  f.registry.client.send = (async (command: { input: { repositoryName: string } }) => {
    if (command.input.repositoryName !== repository('dns-policy')) return { imageDetails: [] };
    if (++dnsPages === 1) return { imageDetails: [], nextToken: 'next' };
    throw Object.assign(new Error('DNS repository vanished'), { name: 'RepositoryNotFoundException' });
  }) as typeof f.registry.client.send;
  await expect(regionalArtifactInventory(f.registry, f.history, [])).rejects.toMatchObject({ name: 'RepositoryNotFoundException' });
});
