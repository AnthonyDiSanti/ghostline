import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { imageArtifacts, applicationArtifacts, releaseFiles, releaseTag } from '../lib/ecs-release.js';
import { prepareImage } from '../lib/ecs-images.js';
it('uses separate explicit build contexts for bootstrap authority and steady-state networking', () => {
  // Packaging is a security boundary in addition to ECS capabilities and mounts.
  expect(imageArtifacts).toHaveLength(5);
  expect(applicationArtifacts).toEqual(['xray', 'awg', 'gateway-config']);
  const bootstrap = releaseFiles('bootstrap');
  const daemon = releaseFiles('network-daemon');
  expect(Object.keys(daemon).sort()).toEqual(['Dockerfile', 'daemon.py', 'discovery.py', 'dns-policy.json', 'guard.py', 'network.py', 'readiness.py']);
  for (const name of ['bootstrap.py', 'storage.py', 'boot_observation.py', 'host_support.py', 'diagnostics.py', 'isolation.py', 'network-probe.py']) {
    expect(bootstrap[name]).toBeDefined();
    expect(daemon[name]).toBeUndefined();
  }
  expect(daemon.Dockerfile!.toString()).not.toMatch(/docker-cli|util-linux|coreutils/);
  expect(bootstrap.Dockerfile!.toString()).toContain('docker-cli');
  expect(daemon['guard.py']).toEqual(bootstrap['guard.py']);
  expect(releaseTag('bootstrap')).not.toBe(releaseTag('network-daemon'));
});

it('builds the DNS candidate from only its Corefile, health probe and pinned image recipe', () => {
  // The sixth image can be qualified without expanding the installed five-image publisher early.
  expect(Object.keys(releaseFiles('dns-policy')).sort()).toEqual(['Dockerfile', 'LICENSE.coredns', 'dns-health.go', 'dns-health_test.go', 'dns-policy.Corefile']);
  expect(releaseFiles('dns-policy').Dockerfile!.toString()).toContain('EXPOSE 5353/udp');
  expect(releaseTag('dns-policy')).toMatch(/^sha-[a-f0-9]{64}$/);
  expect(releaseTag('dns-policy')).not.toBe(releaseTag('gateway-config'));
  const work = mkdtempSync(join(tmpdir(), 'ghostline-dns-artifact-'));
  let built = false;
  try {
    const image = prepareImage('dns-policy', work, args => {
      if (args[0] === 'buildx') {
        expect(args.slice(0, 5)).toEqual(['buildx', 'build', '--platform', 'linux/arm64', '--load']);
        expect(readdirSync(args.at(-1)!)).toEqual(['Dockerfile', 'LICENSE.coredns', 'dns-health.go', 'dns-health_test.go', 'dns-policy.Corefile']);
        built = true;
      }
      return args[0] === 'image' ? 'linux/arm64' : '';
    });
    expect(image).toMatch(/^ghostline-dns-policy:sha-[a-f0-9]{64}$/);
    expect(built).toBe(true);
  } finally { rmSync(work, { recursive: true, force: true }); }
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

it('verifies either host slot and rejects ambiguous diagnostic daemon identities', () => {
  // Slot B uses a distinct family even though the restricted daemon container has the same name.
  const result = spawnSync('python3', ['-B', new URL('./fixtures/daemon-diagnostics.py', import.meta.url).pathname], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});
