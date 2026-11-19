import { readFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { stableRelease, arm64Digest, type ReleaseReader } from './stable-images.js';

export interface HeadscaleConfig {
  account: string; region: string; availabilityZone: string; hostname: string;
  hostedZoneId: string; instanceType: string; volumeGiB: number; vpcCidr: string;
}
export const headscaleNames = {
  state: 'GhostlineHeadscaleState', runtime: 'GhostlineHeadscaleRuntime',
  cluster: 'ghostline-headscale', family: 'ghostline-headscale', service: 'headscale',
  imageRepository: 'ghostline/control/headscale', hostRepository: 'ghostline/control/headscale-host',
} as const;

export function headscaleRelayMap(relays: Array<{ target: string; ip: string; pin: string }>) {
  // Relay IDs are durable control-plane identities; catalog insertion/reordering must never renumber existing regions.
  const ids: Record<string, number> = { 'stockholm-ecs': 901, oregon: 902, zurich: 903, 'cape-town': 904, nva: 905 };
  const regions: Record<string, unknown> = {};
  for (const relay of relays) {
    const id = Object.hasOwn(ids, relay.target) ? ids[relay.target] : undefined;
    if (!id || regions[id]) throw new Error('Assign a unique explicit Headscale relay region ID before deployment.');
    regions[id] = { regionid: id, regioncode: relay.target, regionname: `Ghostline ${relay.target}`, nodes: [
      { name: `gl${id}`, regionid: id, hostname: relay.ip, ipv4: relay.ip, ipv6: 'none', certname: relay.pin, derpport: 443, stunport: 3478 }], };
  }
  return { regions };
}

export function validateHeadscaleConfig(value: unknown): HeadscaleConfig {
  // A separate strict configuration cannot accidentally enroll the coordinator in regional gateway lifecycle.
  const config = value as HeadscaleConfig;
  const keys = ['account', 'region', 'availabilityZone', 'hostname', 'hostedZoneId', 'instanceType', 'volumeGiB', 'vpcCidr'];
  if (!config || Object.keys(config).sort().join() !== keys.sort().join()
    || !/^\d{12}$/.test(config.account) || !/^us-east-1$/.test(config.region)
    || !/^us-east-1[a-f]$/.test(config.availabilityZone) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(config.hostname)
    || !/^Z[A-Z0-9]+$/.test(config.hostedZoneId) || !/^t4g\.(micro|small|medium)$/.test(config.instanceType)
    || !Number.isInteger(config.volumeGiB) || config.volumeGiB < 8 || config.volumeGiB > 64
    || config.vpcCidr !== '10.83.0.0/24') throw new Error('Invalid or unknown Headscale configuration.');
  return config;
}

export function loadHeadscaleConfig(): HeadscaleConfig {
  // The catalog is public topology only; never persist coordinator keys or enrollment tokens here.
  return validateHeadscaleConfig(JSON.parse(readFileSync(new URL('../headscale.json', import.meta.url), 'utf8')));
}

export function resolveHeadscaleRelease(reader: ReleaseReader) {
  // Resolve again on every explicit deploy; this result is an operation receipt, not a checked-in version hold.
  const release = JSON.parse(reader.download('https://api.github.com/repos/juanfont/headscale/releases/latest').toString());
  const tag = stableRelease(release);
  const source = `ghcr.io/juanfont/headscale:${tag.slice(1)}`;
  return { version: tag.slice(1), source, digest: arm64Digest(reader.manifest(source)) };
}

export function headscaleFiles(config: HeadscaleConfig, relayMap: unknown): Record<string, string> {
  // Explicit deny-by-default policy and an owned relay map avoid accidental public-map or tailnet access defaults.
  const map = relayMap as { regions?: Record<string, unknown> };
  if (!map?.regions || !Object.keys(map.regions).length) throw new Error('Headscale needs an explicit nonempty relay map.');
  const settings = {
    server_url: `https://${config.hostname}`, listen_addr: '0.0.0.0:8443', metrics_listen_addr: '127.0.0.1:9090',
    grpc_listen_addr: '127.0.0.1:50443', grpc_allow_insecure: false, trusted_proxies: [],
    noise: { private_key_path: '/var/lib/headscale/noise_private.key' },
    prefixes: { v4: '100.64.0.0/10', v6: 'fd7a:115c:a1e0::/48', allocation: 'sequential' },
    derp: { server: { enabled: false }, urls: [], paths: ['/etc/headscale/derp.yaml'], auto_update_enabled: false },
    disable_check_updates: true, node: { expiry: '180d', ephemeral: { inactivity_timeout: '30m' } },
    database: { type: 'sqlite', debug: false, sqlite: { path: '/var/lib/headscale/db.sqlite', write_ahead_log: true, wal_autocheckpoint: 1000 } },
    tls_letsencrypt_hostname: config.hostname, tls_letsencrypt_challenge_type: 'TLS-ALPN-01',
    tls_letsencrypt_cache_dir: '/var/lib/headscale/acme', acme_url: 'https://acme-v02.api.letsencrypt.org/directory',
    // Suppress structured daemon events and client log upload; fatal/startup stderr still needs a separate audit.
    log: { level: 'disabled', format: 'json' }, logtail: { enabled: false },
    policy: { mode: 'file', path: '/etc/headscale/policy.json' },
    dns: { magic_dns: false, base_domain: 'tailnet.bigmantonyd.com', override_local_dns: false, nameservers: { global: [] } },
    unix_socket: '/run/headscale/headscale.sock', unix_socket_permission: '0600',
  };
  // Headscale decodes Go map[int] values: YAML string keys ("901") are rejected, so emit numeric keys.
  const regions = new Map(Object.entries(map.regions).map(([id, region]) => {
    if (!/^[1-9][0-9]*$/.test(id)) throw new Error('DERP region IDs must be positive integers.');
    return [Number(id), region];
  }));
  return { 'config.yaml': stringify(settings), 'derp.yaml': stringify({ regions }), 'policy.json': JSON.stringify({ acls: [] }) + '\n' };
}
