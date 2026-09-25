import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { renderFixture } from './fixtures.js';

const fixture = (name: string) => new URL(`../../runtime/ecs/al2023/${name}`, import.meta.url);

export function renderAl2023ImageBuildUserData(bootstrapImage: string): string {
  // The builder bakes generic host files only; the trial probe is an exact public image identity.
  if (!/^[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(bootstrapImage)) {
    throw new Error('AL2023 image build requires an exact bootstrap image digest.');
  }
  const assets = {
    QUARANTINE_SH: 'quarantine.sh', QUARANTINE_PY: 'quarantine.py',
    GUARD_PY: '../bottlerocket/guard.py', NETWORK_PY: '../network.py',
    BOOTSTRAP_SH: 'bootstrap-probe.sh', CONFIG_MOUNT: 'mnt-ghostline-config.mount',
    BOOTSTRAP_UNIT: 'ghostline-bootstrap.service',
    DOCKER_GATE: 'docker-gate.conf', ECS_GATE: 'ecs-gate.conf',
    PREPARE_IMAGE_SH: 'prepare-image.sh',
    CHECK_ECS_CONFIG_SH: 'check-ecs-config.sh',
  } as const;
  const encoded = Object.fromEntries(Object.entries(assets).map(([key, name]) =>
    [key, readFileSync(fixture(name)).toString('base64')]));
  const installScript = renderFixture(fixture('image-build-user-data.sh'), {
    ...encoded, BOOTSTRAP_IMAGE: bootstrapImage,
  });
  // Compress the self-contained fixture bundle without fetching mutable installer code at boot.
  const payload = gzipSync(installScript).toString('base64');
  const userData = `#!/usr/bin/env bash\nset -euo pipefail\nbase64 --decode <<'GHOSTLINE_INSTALLER' | gzip -d | bash\n${payload}\nGHOSTLINE_INSTALLER\n`;
  // EC2's raw user-data limit applies before CloudFormation base64 encoding.
  if (Buffer.byteLength(userData) > 16 * 1024) throw new Error('AL2023 boot-gate user data exceeds the EC2 16 KiB limit.');
  return userData;
}

export function renderAl2023TrialLaunchUserData(cluster: string): string {
  // Enrollment is a late cloud-init step, but the AMI must already contain the pre-Docker gate.
  if (!/^[a-z][a-z0-9-]{0,100}$/.test(cluster)) {
    throw new Error('AL2023 trial requires a safe cluster name.');
  }
  return renderFixture(fixture('test-launch-user-data.sh'), { CLUSTER: cluster });
}
