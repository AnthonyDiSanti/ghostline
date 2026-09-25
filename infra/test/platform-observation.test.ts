import { expect, it } from 'vitest';
import { parseHostObservation } from '../lib/platform-observation.js';
const bootId = '11111111-1111-1111-1111-111111111111';
const digest = `sha256:${'a'.repeat(64)}`;
function report(attributes: Record<string, string | undefined> = {}) {
  return { bootId, os: { os: { arch: 'aarch64', version_id: '1.65.0', variant_id: 'aws-ecs-3' } },
    attributes: { settings: { ecs: { 'instance-attributes': attributes } } } };
}
it('normalizes the actual OS and accepts only a bootstrap record matching the current kernel boot', () => {
  expect(parseHostObservation(JSON.stringify(report({ ghostline_boot_id: bootId, ghostline_bootstrap_digest: digest })))).toEqual({
    bootId, version: '1.65.0', variant: 'aws-ecs-3', architecture: 'arm64', bootstrap: { bootId, digest } });
});
it.each([{}, {ghostline_boot_id:'old',ghostline_bootstrap_digest:digest}, {ghostline_boot_id:bootId,ghostline_bootstrap_digest:'mutable-tag'}])('reports missing or stale bootstrap evidence without inventing executed content', attributes => {
  const observed = parseHostObservation(JSON.stringify(report(attributes)));
  expect(observed.bootstrap).toBeUndefined(); expect(observed.bootId).toBe(bootId);
});
it('rejects malformed live OS/boot input', () => {
  expect(() => parseHostObservation(JSON.stringify({...report(),bootId:'unknown'}))).toThrow('malformed');
  const wrong = report(); wrong.os.os.arch = 'unknown';
  expect(() => parseHostObservation(JSON.stringify(wrong))).toThrow('malformed');
});
