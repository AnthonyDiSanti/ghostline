import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadImageInputs, type ImageInputs } from './image-inputs.js';
import type { BuildArtifact } from './image-artifacts.js';
export { applicationArtifacts, platformArtifacts, imageArtifacts, type ApplicationArtifact, type ImageArtifact } from './image-artifacts.js';

export type Protocol = 'xray' | 'awg';
export const imageArchitecture = 'arm64';
export const imagePlatform = 'linux/arm64';
export const imageInputs = loadImageInputs();
export const officialXrayImage = `ghcr.io/xtls/xray-core@${imageInputs.xray.imageDigest}`;

export function releaseBuildArgs(artifact: BuildArtifact, inputs: ImageInputs = imageInputs): Record<string, string> {
  // Only immutable verified source identities reach Docker; discovery timestamps never invalidate caches.
  if (artifact === 'derp' || artifact === 'gateway-config') {
    const source = inputs.derp;
    if (!source) throw new Error('Resolve and qualify DERP source inputs before building.');
    return { DERP_COMMIT: source.commit, DERP_SHA256: source.archiveSha256, DERP_VERSION: source.tag.slice(1),
      DERP_GO_REV: source.toolchainRevision, DERP_GO_SHA256: source.toolchainSha256 };
  }
  if (artifact === 'dns-policy') return { COREDNS_VERSION: inputs.coredns.tag.slice(1), COREDNS_DIGEST: inputs.coredns.imageDigest };
  if (artifact !== 'awg') return {};
  return { AWG_COMMIT: inputs.awg.daemon.commit, AWG_SHA256: inputs.awg.daemon.archiveSha256,
    TOOLS_COMMIT: inputs.awg.tools.commit, TOOLS_SHA256: inputs.awg.tools.archiveSha256 };
}

export function localImage(artifact: BuildArtifact): string { return `ghostline-${artifact}:${releaseTag(artifact)}`; }

export function releaseFiles(protocol: BuildArtifact): Record<string, Buffer> {
  // Xray is mirrored byte-for-byte; it has no Ghostline Dockerfile or build context.
  if (protocol === 'xray') return {};
  if (protocol === 'derp' || protocol === 'gateway-config') return {
    Dockerfile: readFileSync(new URL('../../runtime/ecs/derp.Dockerfile', import.meta.url)),
    'derp-tools.go': readFileSync(new URL('../../runtime/ecs/derp-tools.go', import.meta.url)),
    'derp-tools_test.go': readFileSync(new URL('../../runtime/ecs/derp-tools_test.go', import.meta.url)),
    'derp-probe.go': readFileSync(new URL('../test/fixtures/derp-probe.go', import.meta.url)),
    'config-start.sh': readFileSync(new URL('../../runtime/ecs/config-start.sh', import.meta.url)),
    'gateway-config.sh': readFileSync(new URL('../../runtime/ecs/gateway-config.sh', import.meta.url)),
    'xray-log-policy.jq': readFileSync(new URL('../../runtime/ecs/xray-log-policy.jq', import.meta.url)),
  };
  if (protocol === 'dns-policy') return {
    Dockerfile: readFileSync(new URL('../../runtime/ecs/dns-policy.Dockerfile', import.meta.url)),
    'dns-policy.Corefile': readFileSync(new URL('../../runtime/ecs/dns-policy.Corefile', import.meta.url)),
    'dns-health.go': readFileSync(new URL('../../runtime/ecs/dns-health.go', import.meta.url)),
    'dns-health_test.go': readFileSync(new URL('../../runtime/ecs/dns-health_test.go', import.meta.url)),
    'LICENSE.coredns': readFileSync(new URL('../../runtime/LICENSE.coredns', import.meta.url)),
  };
  if (protocol === 'bootstrap' || protocol === 'network-daemon') {
    // Explicit file allowlists keep host-only diagnostics out of the steady-state image.
    const names = protocol === 'bootstrap'
      ? ['bootstrap.py', 'storage.py', 'boot_observation.py', 'host_support.py', 'diagnostics.py', 'isolation.py', 'guard.py']
      : ['daemon.py', 'discovery.py', 'guard.py', 'readiness.py'];
    const files = Object.fromEntries(names.map(name => [name, readFileSync(new URL(`../../runtime/ecs/bottlerocket/${name}`, import.meta.url))]));
    files.Dockerfile = readFileSync(new URL(`../../runtime/ecs/bottlerocket/${protocol}.Dockerfile`, import.meta.url));
    files['network.py'] = readFileSync(new URL('../../runtime/ecs/network.py', import.meta.url));
    files['dns-policy.json'] = readFileSync(new URL('../../runtime/ecs/dns-policy.json', import.meta.url));
    files['derp-policy.json'] = readFileSync(new URL('../../runtime/ecs/derp-policy.json', import.meta.url));
    if (protocol === 'bootstrap') {
      files['network-probe.py'] = readFileSync(new URL('../../runtime/ecs/network-probe.py', import.meta.url));
      files['derp-network-probe.py'] = readFileSync(new URL('../../runtime/ecs/derp-network-probe.py', import.meta.url));
    }
    return files;
  }
  // The unchanged AWG recipe has its own exact inputs; the shared DERP/initializer recipe is above.
  return { Dockerfile: readFileSync(new URL('../../runtime/ecs/awg.Dockerfile', import.meta.url)),
    'awg-start.sh': readFileSync(new URL('../../runtime/ecs/awg-start.sh', import.meta.url)),
    'start.sh': readFileSync(new URL('../../runtime/ecs/start.sh', import.meta.url)) };
}

export function releaseTag(protocol: BuildArtifact, inputs: ImageInputs = imageInputs, files = releaseFiles(protocol)): string {
  const hash = createHash('sha256');
  if (protocol === 'xray') hash.update(`ghcr.io/xtls/xray-core@${inputs.xray.imageDigest}`).update('\0').update(imagePlatform);
  // Include the target platform in each content identity.
  else hash.update(imagePlatform).update('\0');
  if (protocol === 'derp' || protocol === 'gateway-config') hash.update(`target:${protocol}`).update('\0');
  for (const [name, value] of Object.entries(releaseBuildArgs(protocol, inputs)).sort()) hash.update(name).update('\0').update(value).update('\0');
  // NUL separators distinguish filenames/content boundaries; pinned base images and build instructions are inputs.
  for (const [name, bytes] of Object.entries(files).sort()) hash.update(name).update('\0').update(bytes).update('\0');
  return `sha-${hash.digest('hex')}`;
}
