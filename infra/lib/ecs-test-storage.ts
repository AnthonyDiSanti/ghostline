import { imagePlatform } from './ecs-release.js';
import type { DockerCommand } from './ecs-images.js';

export function createTestRamStorage(name: string, initializer: string, docker: DockerCommand, protocol: 'xray' | 'awg' = 'xray'): () => void {
  // Docker Desktop has no native Linux host mount: a fixture holds this RAM volume across test containers.
  const holder = `${name}-storage`;
  const cleanup = () => {
    docker(['rm', '-f', '-v', holder]);
    docker(['volume', 'rm', name]);
  };
  docker(['volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs', '--opt', 'device=tmpfs',
    '--opt', `o=size=1m,uid=65532,gid=65532,mode=${protocol === 'xray' ? '0700' : '0750'},nosuid,nodev,noexec,noswap`, name]);
  try {
    docker(['run', '-d', '--name', holder, '--platform', imagePlatform, '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--user', '65532:65532', '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
      '-v', `${name}:/config:ro`, '--entrypoint', '/bin/sleep', initializer, '3600']);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
