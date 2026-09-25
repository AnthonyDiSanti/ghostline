import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { imageArtifacts, applicationArtifacts, releaseFiles, releaseTag } from '../lib/ecs-release.js';
it('uses separate explicit build contexts for bootstrap authority and steady-state networking', () => {
  // Packaging is a security boundary in addition to ECS capabilities and mounts.
  expect(imageArtifacts).toHaveLength(5);
  expect(applicationArtifacts).toEqual(['xray', 'awg', 'gateway-config']);
  const bootstrap = releaseFiles('bootstrap');
  const daemon = releaseFiles('network-daemon');
  expect(Object.keys(daemon).sort()).toEqual(['Dockerfile', 'daemon.py', 'discovery.py', 'guard.py', 'network.py']);
  for (const name of ['bootstrap.py', 'storage.py', 'boot_observation.py', 'host_support.py', 'diagnostics.py', 'isolation.py', 'network-probe.py']) {
    expect(bootstrap[name]).toBeDefined();
    expect(daemon[name]).toBeUndefined();
  }
  expect(daemon.Dockerfile!.toString()).not.toMatch(/docker-cli|util-linux|coreutils/);
  expect(bootstrap.Dockerfile!.toString()).toContain('docker-cli');
  expect(daemon['guard.py']).toEqual(bootstrap['guard.py']);
  expect(releaseTag('bootstrap')).not.toBe(releaseTag('network-daemon'));
});

it('rejects unsafe existing RAM mounts during bootstrap replay', () => {
  // Native qualification proves mount/SELinux behavior; this regression covers the exact replay refusal policy.
  const result = spawnSync('python3', ['-B', new URL('./fixtures/bootstrap-storage.py', import.meta.url).pathname], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});

it('records actual local image identity and keeps observation out of the boot safety gate', () => {
  const result = spawnSync('python3', ['-B', new URL('./fixtures/bootstrap-observation.py', import.meta.url).pathname], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});
