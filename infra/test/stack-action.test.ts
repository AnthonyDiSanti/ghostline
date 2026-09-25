import { expect, it } from 'vitest';
import { imageArtifacts } from '../lib/ecs-release.js';
import { selectStackAction, type StackIntent, type StackObservation } from '../lib/releases/stack-action.js';

function fixture() {
  // Observations describe executed content, never the current mutable tag targets.
  const digest = `sha256:${'a'.repeat(64)}`;
  const next = `sha256:${'b'.repeat(64)}`;
  const intent: StackIntent = { components: Object.fromEntries(imageArtifacts.map(n => [n, { digest, runtimeDigest: digest }])) as StackIntent['components'],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.65.0'] } };
  const actual: StackObservation = { mode: 'active', host: { id: 'i-test', state: 'running', bootId: 'boot-1',
    version: '1.65.0', variant: 'aws-ecs-3', architecture: 'arm64' }, bootstrap: { digest, bootId: 'boot-1' },
    daemon: { stable: true, digest }, gateway: { desired: 1, stable: true,
      images: Object.fromEntries(['xray', 'awg', 'gateway-config'].map(n => [n, digest])) } };
  return { intent, actual, next };
}

it('does nothing for an already-running coherent release', () => {
  const f = fixture(); expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'none' });
});
it.each(['xray', 'awg', 'gateway-config'] as const)('restarts only the gateway for a changed %s', name => {
  const f = fixture(); f.intent.components[name] = { digest: f.next, runtimeDigest: f.next };
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'gateway' });
});
it('replaces only the daemon when application and bootstrap content are unchanged', () => {
  const f = fixture(); f.actual.daemon!.digest = f.next;
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'daemon', refreshGateway: false });
});
it('coordinates daemon and app changes without rebooting unchanged bootstrap', () => {
  const f = fixture(); f.actual.daemon!.digest = f.next; f.actual.gateway!.images.awg = f.next;
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'daemon', refreshGateway: true });
});
it('chooses one reboot for combined changes and separately refreshes captured daemon intent', () => {
  const f = fixture(); f.actual.bootstrap!.digest = f.next; f.actual.daemon!.digest = f.next; f.actual.gateway!.images.awg = f.next;
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'reboot', refreshDaemon: true, refreshGateway: true });
});
it.each(['stopped', 'parked', 'destroying', 'destroyed'] as const)('never wakes a %s region', mode => {
  const f = fixture(); f.actual.mode = mode; f.actual.bootstrap!.digest = f.next;
  expect(selectStackAction(f.intent, f.actual).kind).toBe('deferred');
});
it('does not turn an absent or stale bootstrap record into repeated reboot intent', () => {
  const f = fixture(); f.actual.bootstrap!.bootId = 'previous-boot';
  expect(selectStackAction(f.intent, f.actual).kind).toBe('blocked');
  delete f.actual.bootstrap;
  expect(selectStackAction(f.intent, f.actual).kind).toBe('blocked');
});
it('does not upgrade the OS implicitly when its version is outside the release contract', () => {
  const f = fixture(); f.actual.host!.version = '1.66.0';
  expect(selectStackAction(f.intent, f.actual).kind).toBe('blocked');
});
it('accepts actual architecture-specific image digests without needless turnover', () => {
  const f = fixture(); f.intent.components['network-daemon'].runtimeDigest = f.next; f.actual.daemon!.digest = f.next;
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'none' });
});
it('does not reboot or restart when only index provenance changes around the same executed child', () => {
  const f = fixture();
  const oldIndex = f.actual.bootstrap!.digest;
  f.actual.resolvedDigests = { [oldIndex]: f.next };
  for (const name of imageArtifacts) f.intent.components[name] = { digest: `sha256:${'c'.repeat(64)}`, runtimeDigest: f.next };
  expect(selectStackAction(f.intent, f.actual)).toEqual({ kind: 'none' });
  // An unresolved index is never assumed equivalent from source tags, timestamps or current aliases.
  delete f.actual.resolvedDigests;
  expect(selectStackAction(f.intent, f.actual).kind).toBe('reboot');
});
