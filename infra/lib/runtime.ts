import { isIP } from 'node:net';

export interface RuntimeBundle {
  version: 1;
  deployment: string;
  sourceInstanceId: string;
  xrayVersion: string;
  files: Record<string, string>;
}

export interface RuntimeAddresses {
  xrayPrivateIp: string;
  awgPrivateIp: string;
}

export function parseJson(text: string): any {
  // JSON parser diagnostics can quote secret input; expose only a fixed diagnostic.
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON; contents withheld.'); }
}

export function validateBundle(value: unknown, deployment: string): RuntimeBundle {
  // Import all files, while rejecting paths that could escape the protected configuration directory.
  const bundle = value as RuntimeBundle;
  if (!bundle || bundle.version !== 1 || bundle.deployment !== deployment
    || typeof bundle.sourceInstanceId !== 'string' || bundle.xrayVersion !== '26.7.28'
    || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) {
    throw new Error('Bundle identity or Xray version does not match this migration.');
  }
  for (const [name, content] of Object.entries(bundle.files)) {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name) || typeof content !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
      throw new Error('Bundle contains an invalid filename or encoding.');
    }
  }
  const server = parseJson(Buffer.from(bundle.files['server.json'] ?? '', 'base64').toString('utf8'));
  const inbound = server?.inbounds?.find((item: any) => item.protocol === 'vless');
  if (!inbound || server.inbounds.length !== 1 || inbound.port !== 443
    || inbound.streamSettings?.security !== 'reality'
    || !inbound.streamSettings.realitySettings?.privateKey
    || !inbound.settings?.clients?.length
    || !inbound.settings.clients.every((client: any) => typeof client.id === 'string' && client.id.length > 0)) {
    throw new Error('Expected the existing VLESS/REALITY TCP 443 service and all client identities.');
  }
  return bundle;
}

export function validateAddresses(addresses: RuntimeAddresses): RuntimeAddresses {
  // The two EIPs require distinct concrete IPv4 bindings; wildcard publishing defeats separation.
  const values = [addresses.xrayPrivateIp, addresses.awgPrivateIp];
  if (values.some(ip => isIP(ip) !== 4 || !ip.startsWith('10.77.0.') || Number(ip.split('.')[3]) < 4
    || Number(ip.split('.')[3]) > 126) || values[0] === values[1]) {
    throw new Error('Runtime requires distinct private IPv4 addresses in the Ghostline subnet.');
  }
  return addresses;
}

export function composeConfig(protocol: 'xray' | 'awg', image: string, addresses: RuntimeAddresses) {
  validateAddresses(addresses);
  if (!new RegExp(`^ghostline-${protocol}:[a-f0-9]{16}$`).test(image)) throw new Error('Install requires the content-tagged local image.');
  const hostIp = protocol === 'xray' ? addresses.xrayPrivateIp : addresses.awgPrivateIp;
  const transport = protocol === 'xray' ? 'tcp' : 'udp';
  // Separate Compose projects ensure updating AWG cannot reconcile or restart the Xray service.
  return {
    name: `ghostline-${protocol}`,
    services: {
      [protocol]: {
        image, pull_policy: 'never', container_name: `ghostline-${protocol}`,
        restart: 'always', init: true, logging: { driver: 'none' },
        read_only: true, cap_drop: ['ALL'],
        cap_add: protocol === 'xray' ? ['NET_BIND_SERVICE'] : ['NET_ADMIN'],
        security_opt: ['no-new-privileges:true'],
        ...(protocol === 'awg' ? {
          devices: ['/dev/net/tun:/dev/net/tun'],
          sysctls: { 'net.ipv4.ip_forward': '1', 'net.ipv4.conf.all.src_valid_mark': '1' },
          tmpfs: ['/run', '/tmp'],
        } : {}),
        ports: [{ target: 443, published: '443', host_ip: hostIp, protocol: transport }],
        volumes: [{ type: 'bind', source: `/opt/ghostline/${protocol}/config`,
          target: protocol === 'xray' ? '/opt/amnezia/xray' : '/etc/amnezia/amneziawg', read_only: true }],
        networks: ['egress'],
      },
    },
    networks: {
      egress: {
        name: `ghostline-${protocol}`, driver: 'bridge',
        driver_opts: { 'com.docker.network.host_ipv4': hostIp },
        ipam: { config: [{ subnet: protocol === 'xray' ? '172.28.10.0/24' : '172.28.20.0/24' }] },
      },
    },
  };
}
