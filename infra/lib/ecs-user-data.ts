import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { DeploymentConfig } from './config.js';
import { renderFixture } from './fixtures.js';
import { ecsMemoryBudget } from './ecs-memory.js';

export function ecsUserData(config: DeploymentConfig, cluster: string): string {
  // Heredoc values are nonsecret identifiers, not shell syntax or arbitrary multiline content.
  if (!/^[a-z][a-z0-9-]{0,100}$/.test(config.resourceName) || !/^[A-Za-z0-9_-]{1,255}$/.test(cluster)) {
    throw new Error('Invalid ECS bootstrap identity.');
  }
  const file = (name: string) => new URL(`../../runtime/ecs/${name}`, import.meta.url);
  const compressed = (name: string) => gzipSync(readFileSync(file(name))).toString('base64');
  const unit = (name: string) => renderFixture(file(`systemd/${name}`)).trimEnd();
  const memory = ecsMemoryBudget(config.instanceType);
  // A cold rebuild applies changed host fixtures; cloud-init does not replay user data on ordinary reboot.
  return renderFixture(file('bootstrap.sh'), {
    FAMILY: config.resourceName,
    NETWORK_GZIP: compressed('network.py'),
    CONFIG_STORAGE_GZIP: compressed('config-storage.sh'),
    CHECK_MEMORY_GZIP: compressed('check-memory.sh'),
    TASK_MEMORY: String(memory.task),
    CONFIG_SERVICE: unit('ghostline-config.service'),
    NETWORK_SERVICE: unit('ghostline-network.service'),
    DOCKER_UNIT: unit('docker.conf'),
    ECS_UNIT: unit('ecs.conf'),
    ECS_CONFIG: renderFixture(file('ecs.config'), { CLUSTER: cluster, RESERVED_MEMORY: String(memory.reserved) }).trimEnd(),
  });
}
