import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDeployment } from '../lib/config.js';
import { composeConfig, parseJson, validateAddresses, validateBundle } from '../lib/runtime.js';
import { generateXrayProfiles, xrayLink } from '../lib/xray.js';
import { generateAwgProfiles } from '../lib/awg.js';
import { profileQr, vpnLink } from '../lib/profile-share.js';
import { installationArchive } from '../lib/archive.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [target, action, protocol = 'xray', bundleArg, ...extra] = process.argv.slice(2);
const config = getDeployment(target);
if (config.ecs) throw new Error('Use npm run ecs for ECS targets; SSH runtime operations do not apply.');
const work = resolve(root, '.local/deployments', config.id, 'runtime');
const bundlePath = bundleArg ? resolve(bundleArg) : resolve(root, '.local/recovery',
  protocol === 'awg' ? `${config.id}-awg/awg0.conf` : `${config.id}-runtime.json`);
const keyPath = resolve(root, '.local/keys', config.resourceName);
const knownHosts = resolve(root, '.local/deployments', config.id, 'known_hosts');

function run(command: string, args: string[], input?: string | Buffer, showOutput = false): Buffer {
  // Never let subprocess errors echo configuration or captured secret output into the transcript.
  const result = spawnSync(command, args, {
    input, stdio: ['pipe', showOutput ? 'inherit' : 'pipe', showOutput ? 'inherit' : 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? 'launch error'}); output withheld.`);
  return result.stdout ?? Buffer.alloc(0);
}

function aws(args: string[]) {
  // Metadata only; keep cloud identity explicit for every runtime operation.
  return parseJson(run('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json']).toString());
}

function outputs(): Record<string, string> {
  // Read completed live outputs so stale local deployment files cannot redirect an installation.
  if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
  const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack.StackStatus)) throw new Error('Stack is not in a completed deployment state.');
  return Object.fromEntries(stack.Outputs.map((item: any) => [item.OutputKey, item.OutputValue]));
}

function sshArgs(ip: string) {
  // Always pin SSH; cloud console keys must be verified before bootstrap/install.
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error('Missing endpoint IPv4.');
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${knownHosts}`, '-i', keyPath, `ubuntu@${ip}`];
}

function ssh(ip: string, command: string, input?: string | Buffer) {
  return run('ssh', [...sshArgs(ip), command], input);
}

function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function exportXray() {
  // Export once; overwriting the source bundle during migration would obscure identity preservation.
  if (existsSync(bundlePath)) throw new Error('Recovery bundle already exists; choose a new explicit path to export again.');
  const state = outputs();
  const container = config.runtime ? 'ghostline-xray' : 'amnezia-xray';
  const source = parseJson(ssh((config.runtime ? state.AwgEndpointIp : state.EndpointIp)!, `sudo python3 - ${container}`, readFileSync(resolve(root, 'runtime/export-xray.py'))).toString());
  if (!source.versionText.startsWith('Xray 26.7.28 ')) throw new Error('Observed Xray version differs from the migration pin.');
  const bundle = validateBundle({ version: 1, deployment: config.id,
    sourceInstanceId: state.InstanceId, xrayVersion: '26.7.28', files: source.files }, config.id);
  privateDirectory(resolve(bundlePath, '..'));
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`Saved complete Xray recovery bundle: ${bundlePath} (${Object.keys(bundle.files).length} files; secret values withheld).`);
}

function build() {
  const context = resolve(work, 'build', protocol);
  privateDirectory(context);
  const dockerfile = readFileSync(resolve(root, 'runtime', protocol, 'Dockerfile'));
  writeFileSync(resolve(context, 'Dockerfile'), dockerfile);
  if (protocol === 'xray') {
    const archive = resolve(context, 'Xray-linux-64.zip');
    if (!existsSync(archive)) run('curl', ['-fsSL', '--retry', '3',
      'https://github.com/XTLS/Xray-core/releases/download/v26.7.28/Xray-linux-64.zip', '-o', archive]);
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== '8195d909f1109b8f3d99eefe401a3c451d7bf4af71f24d3815420f77e5dd2a40') {
      throw new Error('Xray download checksum mismatch.');
    }
  } else {
    copyFileSync(resolve(root, 'runtime/awg/start.sh'), resolve(context, 'start.sh'));
  }
  // A content-derived local tag is sufficient; image catalogs and ECR delivery remain deferred.
  const hash = createHash('sha256').update(dockerfile);
  if (protocol === 'awg') hash.update(readFileSync(resolve(context, 'start.sh')));
  const tag = `ghostline-${protocol}:${hash.digest('hex').slice(0, 16)}`;
  run('docker', ['buildx', 'build', '--platform', 'linux/amd64', '--load', '-t', tag, context], undefined, true);
  const imageId = run('docker', ['image', 'inspect', '--format', '{{.Id}}', tag]).toString().trim();
  run('docker', ['save', '-o', resolve(work, `${protocol}.tar`), tag]);
  writeFileSync(resolve(work, `${protocol}-image.json`), JSON.stringify({ imageId, tag }) + '\n');
  console.log(`Built ${protocol}: ${imageId}`);
}

function managedState() {
  // Cross-check the ENI and staging EIP against EC2 before sending credentials to a host.
  const state = outputs();
  if (!state.ManagedInstanceId || !state.AwgEndpointIp) throw new Error('Deploy the managed host first.');
  const instance = aws(['ec2', 'describe-instances', '--instance-ids', state.ManagedInstanceId]).Reservations[0].Instances[0];
  const nic = instance.NetworkInterfaces.find((item: any) => item.NetworkInterfaceId === state.ManagedNetworkInterfaceId);
  if (instance.State.Name !== 'running' || !nic || instance.ImageId !== config.amiId
    || !nic.PrivateIpAddresses.some((item: any) => item.PrivateIpAddress === state.XrayPrivateIp)
    || !nic.PrivateIpAddresses.some((item: any) => item.Primary && item.PrivateIpAddress === state.AwgPrivateIp
      && item.Association?.PublicIp === state.AwgEndpointIp)) throw new Error('Live managed host/address metadata does not match stack outputs.');
  return { state, nic, addresses: validateAddresses({ xrayPrivateIp: state.XrayPrivateIp!, awgPrivateIp: state.AwgPrivateIp! }) };
}

function pinHostKey() {
  // EC2 console output is the authenticated trust source; never accept an arbitrary first SSH key.
  const { state } = managedState();
  const consoleResult = aws(['ec2', 'get-console-output', '--instance-id', state.ManagedInstanceId!, '--latest']);
  let output = consoleResult.Output ?? '';
  if (!output.includes('BEGIN SSH HOST KEY KEYS')) output = Buffer.from(output, 'base64').toString();
  const block = output.split('BEGIN SSH HOST KEY KEYS')[1]?.split('END SSH HOST KEY KEYS')[0];
  const keys = block?.match(/(?:ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+/g);
  if (!keys?.length) throw new Error('Authenticated EC2 console host keys are not available yet.');
  const existing = existsSync(knownHosts) ? readFileSync(knownHosts, 'utf8').split('\n') : [];
  const previous = existing.filter(line => line.startsWith(`${state.AwgEndpointIp} `));
  const lines = keys.map((key: string) => `${state.AwgEndpointIp} ${key}`);
  // An explicit trust action can accept a rebuilt host only after live ENI/EIP and authenticated console checks.
  if (previous.some(line => !lines.includes(line))) {
    writeFileSync(knownHosts + '.previous', existing.join('\n') + '\n', { mode: 0o600 });
  }
  writeFileSync(knownHosts, [...new Set([...existing.filter(line => line && !line.startsWith(`${state.AwgEndpointIp} `)), ...lines])].join('\n') + '\n', { mode: 0o600 });
  writeFileSync(knownHosts + '.instance', state.ManagedInstanceId! + '\n', { mode: 0o600 });
  console.log(`Pinned host ${state.ManagedInstanceId} keys from authenticated EC2 console output.`);
}

function bootstrap() {
  // Only the managed host is eligible for Docker installation and address verification.
  const { state, nic, addresses } = managedState();
  if (!/^[a-f0-9:]{17}$/.test(nic.MacAddress)) throw new Error('Invalid ENI MAC.');
  ssh(state.AwgEndpointIp!, `sudo bash -s -- ${addresses.awgPrivateIp} ${addresses.xrayPrivateIp} ${nic.MacAddress}`,
    readFileSync(resolve(root, 'runtime/bootstrap.sh')));
  console.log('Managed host bootstrap and persistent secondary IPv4 passed.');
}

function install() {
  const { state, addresses } = managedState();
  if (protocol === 'awg' && !config.runtime?.awgEnabled) {
    throw new Error('Enable and deploy AWG infrastructure before installing the protocol.');
  }
  const image = parseJson(readFileSync(resolve(work, `${protocol}-image.json`), 'utf8'));
  const compose = composeConfig(protocol as 'xray' | 'awg', image.tag, addresses);
  const staging = resolve(work, 'upload', protocol);
  privateDirectory(staging);
  privateDirectory(resolve(staging, 'config'));
  try {
    if (protocol === 'xray') {
      if (statSync(bundlePath).mode & 0o077) throw new Error('Recovery bundle permissions must be 0600.');
      const bundle = validateBundle(parseJson(readFileSync(bundlePath, 'utf8')), config.id);
      for (const [name, value] of Object.entries(bundle.files)) {
        writeFileSync(resolve(staging, 'config', name), Buffer.from(value, 'base64'), { mode: 0o600 });
      }
    } else {
      if (statSync(bundlePath).mode & 0o077) throw new Error('AWG server configuration permissions must be 0600.');
      copyFileSync(bundlePath, resolve(staging, 'config/awg0.conf'));
      chmodSync(resolve(staging, 'config/awg0.conf'), 0o600);
    }
    // Make a changed configuration visible to Compose, while an identical reinstall keeps its container.
    const configuration = protocol === 'xray'
      ? readFileSync(resolve(staging, 'config/server.json')) : readFileSync(resolve(staging, 'config/awg0.conf'));
    Object.assign(compose.services[protocol]!, { labels: { 'ghostline.configuration-sha256': createHash('sha256').update(configuration).digest('hex') } });
    writeFileSync(resolve(staging, 'compose.json'), JSON.stringify(compose, null, 2) + '\n', { mode: 0o600 });
    // Reuse an already-loaded content-tagged image; ordinary reinstall needs no registry or transfer.
    const loaded = ssh(state.AwgEndpointIp!, `if sudo docker image inspect ${image.tag} >/dev/null 2>&1; then echo present; fi`).toString().trim();
    if (loaded !== 'present') {
      run('scp', ['-q', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`, '-i', keyPath,
        resolve(work, `${protocol}.tar`), `ubuntu@${state.AwgEndpointIp}:ghostline-${protocol}.tar`]);
      ssh(state.AwgEndpointIp!, `sudo docker load -i ghostline-${protocol}.tar >/dev/null && rm ghostline-${protocol}.tar`);
    }
    const tar = installationArchive(staging);
    ssh(state.AwgEndpointIp!, `sudo install -d -m 0700 /opt/ghostline/${protocol} && sudo tar --no-same-owner -xf - -C /opt/ghostline/${protocol}`, tar);
    if (protocol === 'xray') {
      ssh(state.AwgEndpointIp!, 'sudo docker compose -f /opt/ghostline/xray/compose.json run --rm --no-deps xray -test -config /opt/amnezia/xray/server.json');
    }
    ssh(state.AwgEndpointIp!, `sudo docker compose -f /opt/ghostline/${protocol}/compose.json up -d --no-deps ${protocol}`);
    console.log(`Installed ${protocol} using preserved credentials and ${image.imageId}.`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function generateAwg() {
  // Peer creation is an explicit one-time action, never part of boot or ordinary installation.
  const { state } = managedState();
  if (!config.runtime) throw new Error('AWG profiles require a managed deployment.');
  if (existsSync(bundlePath)) throw new Error('AWG credentials already exist; installation reuses them.');
  const folder = resolve(bundlePath, '..');
  privateDirectory(folder);
  const generated = generateAwgProfiles(state.AwgEndpointIp!);
  writeFileSync(bundlePath, generated.serverConfig, { mode: 0o600, flag: 'wx' });
  for (const [name, profile] of Object.entries(generated.profiles)) {
    writeFileSync(resolve(folder, `${name}.conf`), profile, { mode: 0o600, flag: 'wx' });
  }
  console.log(`Saved independent macOS/iOS AWG profiles and server configuration in ${folder}; credentials withheld.`);
}

function generateXray() {
  // Generation is opt-in and cannot overwrite a recovery bundle or existing device files.
  const { state } = managedState();
  const folder = resolve(bundlePath + '.clients');
  if (existsSync(bundlePath) || existsSync(folder)) throw new Error('Xray credentials already exist; installation reuses them.');
  const generated = generateXrayProfiles(config.id, state.ManagedInstanceId!, state.EndpointIp!);
  privateDirectory(resolve(bundlePath, '..'));
  privateDirectory(folder);
  writeFileSync(bundlePath, JSON.stringify(generated.bundle, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  for (const [name, profile] of Object.entries(generated.profiles)) {
    writeFileSync(resolve(folder, `${name}.json`), JSON.stringify(profile, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  console.log(`Saved independent Xray recovery bundle and macOS/iOS profiles in ${folder}; credentials withheld.`);
}

async function share() {
  // Derive portable imports from existing peer files without generating or changing any credentials.
  const folder = protocol === 'awg' ? resolve(bundlePath, '..') : resolve(bundlePath + '.clients');
  for (const name of ['macos', 'ios']) {
    const file = resolve(folder, `${name}.${protocol === 'awg' ? 'conf' : 'json'}`);
    if (statSync(file).mode & 0o077) throw new Error('Peer configuration permissions must be 0600.');
    const profile = readFileSync(file, 'utf8');
    const link = protocol === 'awg' ? vpnLink(profile) : xrayLink(parseJson(profile), `Ghostline ${config.id} Xray ${name}`);
    // Amnezia treats a trailing VLESS newline as part of its display-name fragment.
    writeFileSync(resolve(folder, `${name}.vpn`), link + (protocol === 'awg' ? '\n' : ''), { mode: 0o600 });
    writeFileSync(resolve(folder, `${name}-qr.png`), await profileQr(protocol === 'awg' ? profile : link), { mode: 0o600 });
  }
  console.log(`Saved local VPN-link files and QR images in ${folder}; no keys printed or uploaded.`);
}

function verify() {
  const { state, nic, addresses } = managedState();
  const inspected = parseJson(ssh(state.AwgEndpointIp!, `sudo docker inspect ghostline-${protocol}`).toString())[0];
  const expectedIp = protocol === 'xray' ? addresses.xrayPrivateIp : addresses.awgPrivateIp;
  const expectedPort = protocol === 'xray' ? '443/tcp' : '443/udp';
  if (!inspected.State.Running || inspected.HostConfig.Privileged || inspected.HostConfig.LogConfig.Type !== 'none'
    || Object.keys(inspected.HostConfig.PortBindings).length !== 1
    || inspected.HostConfig.PortBindings[expectedPort]?.[0]?.HostIp !== expectedIp) {
    throw new Error('Runtime state or listener binding does not match the intended protocol.');
  }
  const network = parseJson(ssh(state.AwgEndpointIp!, `sudo docker network inspect ghostline-${protocol}`).toString())[0];
  if (network.Options['com.docker.network.host_ipv4'] !== expectedIp) throw new Error('Outbound SNAT network option is missing.');
  const subnet = protocol === 'xray' ? '172.28.10.0/24' : '172.28.20.0/24';
  const nat = ssh(state.AwgEndpointIp!, 'sudo iptables -t nat -S POSTROUTING').toString();
  if (!nat.split('\n').some(line => line.includes(`-s ${subnet} `) && line.endsWith(`-j SNAT --to-source ${expectedIp}`))) {
    throw new Error('Expected source-address rule is absent from the running kernel.');
  }
  if (protocol === 'xray') {
    const original = validateBundle(parseJson(readFileSync(bundlePath, 'utf8')), config.id);
    const actual = ssh(state.AwgEndpointIp!, 'sudo cat /opt/ghostline/xray/config/server.json');
    if (!actual.equals(Buffer.from(original.files['server.json']!, 'base64'))) throw new Error('Installed Xray configuration differs from the imported source.');
  } else {
    const actual = ssh(state.AwgEndpointIp!, 'sudo cat /opt/ghostline/awg/config/awg0.conf');
    if (!actual.equals(readFileSync(bundlePath))) throw new Error('Installed AWG configuration differs from the supplied source.');
    if (ssh(state.AwgEndpointIp!, 'sudo docker exec ghostline-awg awg show awg0 listen-port').toString().trim() !== '443') {
      throw new Error('AWG has not applied its UDP 443 configuration.');
    }
  }
  // Both protocols require their assigned live EIP; missing associations must fail verification.
  const associated = nic.PrivateIpAddresses.find((item: any) => item.PrivateIpAddress === expectedIp)?.Association?.PublicIp;
  if (!associated) throw new Error('Protocol private address has no associated EIP.');
  const expectedPublic = protocol === 'xray' ? state.EndpointIp : state.AwgEndpointIp;
  const actualPublic = ssh(state.AwgEndpointIp!, `sudo docker exec ghostline-${protocol} wget -T 15 -qO- https://checkip.amazonaws.com`).toString().trim();
  if (associated !== expectedPublic || actualPublic !== expectedPublic) throw new Error('Observed protocol egress does not match its assigned EIP.');
  console.log(`${protocol}: running; private listener/kernel SNAT verified; configuration preserved; actual egress matches its EIP. Device browsing remains a separate check.`);
}

try {
  if (extra.length || !['xray', 'awg'].includes(protocol)) throw new Error('Usage: npm run runtime <target> <export|build|trust|bootstrap|generate|share|install|verify> [xray|awg] [bundle-path]');
  privateDirectory(work);
  switch (action) {
    case 'export': if (protocol !== 'xray') throw new Error('Runtime export supports Xray only.'); exportXray(); break;
    case 'build': build(); break;
    case 'trust': pinHostKey(); break;
    case 'bootstrap': bootstrap(); break;
    case 'generate': if (protocol === 'awg') generateAwg(); else generateXray(); break;
    case 'share': await share(); break;
    case 'install': install(); break;
    case 'verify': verify(); break;
    default: throw new Error('Select a runtime action: export, build, trust, bootstrap, generate, share, install, verify.');
  }
} catch (error) {
  // Errors raised above are fixed diagnostics, never captured command output or secret JSON.
  console.error(error instanceof Error ? error.message : 'Runtime operation failed.');
  process.exitCode = 1;
}
