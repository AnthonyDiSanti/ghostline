#!/usr/bin/env python3
"""Finite, credential-free Bottlerocket volume preparation and bounded coordinator administration."""
import hashlib
import base64
import json
import os
from pathlib import Path
import re
import resource
import shutil
import stat
import subprocess
import sys
import time

ROOT = Path('/.bottlerocket/rootfs')
MOUNT = ROOT / 'mnt/headscale'
FAMILY = 'ghostline-headscale'


def command(arguments, data=None, timeout=90):
    # Native error text can include keys/configuration; only selected metadata leaves this helper.
    result = subprocess.run(arguments, input=data, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode:
        # Filesystem/firewall diagnostics contain public paths only; Docker/CLI failures can contain application state.
        safe = arguments[0] in ('mount', 'findmnt', 'mkfs.ext4', 'wipefs', 'iptables-legacy', 'iptables-nft')
        detail = result.stderr.strip()[:180] if safe else 'details withheld'
        raise RuntimeError(f'Coordinator host command failed: {arguments[0]} (exit {result.returncode}): {detail}')
    return result.stdout.strip()


def configuration():
    # User data contains public topology and configuration only, never application credentials.
    for kind in ('bootstrap-containers', 'host-containers'):
        path = Path(f'/.bottlerocket/{kind}/current/user-data')
        if path.exists():
            result = json.loads(path.read_text())
            if not re.fullmatch(r'vol-[a-f0-9]{17}', result.get('volume', '')):
                raise RuntimeError('Invalid owned volume identity')
            return result
    raise RuntimeError('Coordinator host configuration missing')


def find_device(volume, sys_root=Path('/sys/block')):
    # Nitro serials identify the exact declared EBS volume, independent of kernel device ordering.
    found = []
    for entry in sys_root.glob('nvme*n1'):
        serial = entry / 'device/serial'
        if serial.exists() and serial.read_text().strip() == volume.replace('-', ''):
            numbers = (entry / 'dev').read_text().strip()
            if not re.fullmatch(r'[0-9]+:[0-9]+', numbers):
                raise RuntimeError('Invalid kernel block-device identity')
            major, minor = map(int, numbers.split(':'))
            found.append({'name': entry.name, 'major': major, 'minor': minor})
    if len(found) > 1:
        raise RuntimeError('Ambiguous coordinator volume')
    return found[0] if found else None


def private_device(identity, directory=Path('/dev')):
    # Device names in a container can be absent or stale after hotplug; bind access to the kernel's exact device number.
    path = directory / 'ghostline-headscale'
    expected = os.makedev(identity['major'], identity['minor'])
    if path.is_symlink():
        raise RuntimeError('Private block-device node cannot be a symlink')
    if not path.exists():
        os.mknod(path, stat.S_IFBLK | 0o600, expected)
    observed = path.stat()
    if not stat.S_ISBLK(observed.st_mode) or observed.st_rdev != expected:
        raise RuntimeError('Private block-device identity differs')
    return str(path)


def private_directory(path, mode):
    # Symlinks or unexpected existing ownership must not redirect writes outside the owned data tree.
    if path.is_symlink():
        raise RuntimeError('Coordinator directory cannot be a symlink')
    path.mkdir(exist_ok=True, mode=mode)
    os.chown(path, 65532, 65532)
    path.chmod(mode)


def require_initialization_permission(signatures, permitted):
    # AWS empty volumes can contain pseudorandom bytes; only explicit new-volume authority can permit formatting.
    if signatures:
        raise RuntimeError('Refuse to initialize a volume with recognized filesystem signatures')
    if permitted is not True:
        raise RuntimeError('Unrecognized volume has no one-time initialization permission')


def write_configuration(files, initialize=False):
    # Policy edits are durable operator intent: boot replay never overwrites an existing policy or configuration.
    if set(files) != {'config.yaml', 'derp.yaml', 'policy.json'} or any(not isinstance(value, str) or len(value) > 65536 for value in files.values()):
        raise RuntimeError('Unexpected coordinator configuration files')
    for name, contents in files.items():
        target = MOUNT / 'config' / name
        if target.is_symlink():
            raise RuntimeError('Coordinator configuration cannot be a symlink')
        if initialize and target.exists():
            continue
        if name == 'policy.json' and target.exists():
            continue
        temporary = target.with_suffix(target.suffix + '.new')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(temporary, 65532, 65532)
        temporary.replace(target)


def mount_volume(config):
    # Essential bootstrap waits for CloudFormation's attachment before Docker/ECS can restore the task.
    identity = None
    for _ in range(150):
        identity = find_device(config['volume'])
        if identity:
            break
        time.sleep(2)
    if not identity:
        raise RuntimeError('Owned application volume did not attach')
    device = private_device(identity)
    if int(command(['blockdev', '--getsize64', device])) != config['volumeBytes']:
        raise RuntimeError('Owned application volume size differs')
    # Direct probing bypasses blkid's /dev cache, which can miss the host device exposed at a different container path.
    probe = subprocess.run(['blkid', '--probe', '-o', 'value', '-s', 'TYPE', device], capture_output=True, text=True, check=False)
    filesystem = probe.stdout.strip()
    if probe.returncode == 2 and not filesystem:
        # The operator enables this only for a newly created owned volume, then revokes it before any task starts.
        signatures = json.loads(command(['wipefs', '--no-act', '--json', device])).get('signatures', [])
        require_initialization_permission(signatures, config.get('initialize', False))
        command(['mkfs.ext4', '-q', '-L', 'headscale-state', device])
        filesystem = 'ext4'
    if filesystem != 'ext4' or probe.returncode not in (0, 2):
        raise RuntimeError('Expected the declared ext4 application volume')
    MOUNT.mkdir(parents=True, exist_ok=True)
    mounted = subprocess.run(['mountpoint', '-q', str(MOUNT)], check=False).returncode == 0
    if not mounted:
        command(['mount', '-o', 'rw,nosuid,nodev,noexec', device, str(MOUNT)])
    observed = json.loads(command(['findmnt', '-J', '-n', '-o', 'MAJ:MIN,FSTYPE,OPTIONS', '--mountpoint', str(MOUNT)]))['filesystems'][0]
    if observed['maj:min'] != f"{identity['major']}:{identity['minor']}" or observed['fstype'] != 'ext4' or not {'rw', 'nosuid', 'nodev', 'noexec'}.issubset(set(observed['options'].split(','))):
        raise RuntimeError('Coordinator mount identity/options differ')
    marker = MOUNT / '.volume-id'
    if marker.exists() and marker.read_text().strip() != config['volume']:
        raise RuntimeError('Coordinator volume marker differs')
    marker.write_text(config['volume'] + '\n')
    for directory in ('lib', 'config'):
        private_directory(MOUNT / directory, 0o700)
    if (MOUNT / 'lib/db.sqlite').exists() and not (MOUNT / 'lib/noise_private.key').is_file():
        raise RuntimeError('Existing database has no stable Noise identity')
    write_configuration(config['files'], initialize=True)


def network_boundary():
    # Docker preserves DOCKER-USER; application packets may resolve DNS and reach public HTTPS, not host/private metadata.
    backend = (ROOT / 'usr/sbin/xtables').readlink().name
    executable = shutil.which('iptables-nft' if backend == 'xtables-nft-multi' else 'iptables-legacy')
    if backend not in ('xtables-nft-multi', 'xtables-legacy-multi') or not executable:
        raise RuntimeError('Unknown host firewall backend')
    subprocess.run([executable, '-w', '-N', 'DOCKER-USER'], capture_output=True, check=False)
    subprocess.run([executable, '-w', '-N', 'HEADSCALE_PRIVATE'], capture_output=True, check=False)
    command([executable, '-w', '-F', 'HEADSCALE_PRIVATE'])
    for protocol in ('udp', 'tcp'):
        command([executable, '-w', '-A', 'HEADSCALE_PRIVATE', '-d', '10.83.0.2/32', '-p', protocol, '--dport', '53', '-j', 'RETURN'])
    for subnet in ('169.254.0.0/16', '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10'):
        command([executable, '-w', '-A', 'HEADSCALE_PRIVATE', '-d', subnet, '-j', 'REJECT'])
    command([executable, '-w', '-A', 'HEADSCALE_PRIVATE', '-j', 'RETURN'])
    check = [executable, '-w', '-C', 'DOCKER-USER', '-i', 'docker0', '-j', 'HEADSCALE_PRIVATE']
    if subprocess.run(check, capture_output=True, check=False).returncode:
        command([executable, '-w', '-I', 'DOCKER-USER', '1', '-i', 'docker0', '-j', 'HEADSCALE_PRIVATE'])
    local = [executable, '-w', '-C', 'INPUT', '-i', 'docker0', '-j', 'REJECT']
    if subprocess.run(local, capture_output=True, check=False).returncode:
        command([executable, '-w', '-I', 'INPUT', '1', '-i', 'docker0', '-j', 'REJECT'])


def container_id():
    # Administrative operations are scoped to one known coordinator task, never arbitrary Docker access.
    os.environ['DOCKER_HOST'] = 'unix://' + str(ROOT / 'run/docker.sock')
    ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={FAMILY}',
                   '--filter', 'label=com.amazonaws.ecs.container-name=headscale', '--format', '{{.ID}}']).split()
    if len(ids) != 1:
        raise RuntimeError('Expected one running Headscale container')
    return ids[0]


def approval_key_path(operation):
    # Only the short-lived diagnostics container owns this key. Refuse disk or swap before handling private inputs.
    directory = Path('/dev/shm')
    if (not re.fullmatch(r'[a-f0-9-]{36}', operation)
            or command(['findmnt', '-n', '-o', 'FSTYPE', '--mountpoint', str(directory)]) != 'tmpfs'
            or len(Path('/proc/swaps').read_text().splitlines()) != 1):
        raise RuntimeError('Private enrollment storage is unavailable')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    return directory / f'headscale-approval-{operation}.pem'


def prepare_approval(key_path):
    # SSM can retain the response, so return only the public half of a fresh key.
    private_key = command(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072'])
    public_key = command(['openssl', 'pkey', '-pubout'], data=private_key + '\n')
    with os.fdopen(os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        stream.write(private_key + '\n')
    return public_key


def decrypt_approval(key_path, encoded):
    # Consume the root-only key before attempting decryption; failed requests and replays cannot reuse it.
    with os.fdopen(os.open(key_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as key:
        metadata = os.fstat(key.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise RuntimeError('Invalid private enrollment key')
        key_path.unlink()
        if not 0 <= time.time() - metadata.st_mtime <= 120:
            raise RuntimeError('Private enrollment key expired')
        if not re.fullmatch(r'[A-Za-z0-9+/]{512}', encoded):
            raise RuntimeError('Invalid encrypted enrollment request')
        encrypted = base64.b64decode(encoded, validate=True)
        result = subprocess.run(
            ['openssl', 'pkeyutl', '-decrypt', '-inkey', f'/proc/self/fd/{key.fileno()}',
             '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256', '-pkeyopt', 'rsa_mgf1_md:sha256'],
            input=encrypted, capture_output=True, pass_fds=(key.fileno(),), timeout=10, check=False)
        if result.returncode:
            raise RuntimeError('Could not decrypt private enrollment request')
    request = json.loads(result.stdout)
    if (not isinstance(request, dict) or set(request) != {'authId', 'user'}
            or not isinstance(request['authId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', request['authId'])
            or not isinstance(request['user'], str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', request['user'])):
        raise RuntimeError('Invalid private enrollment request')
    return request


def approve_node(request):
    # Use the existing root-accessible container namespace and fixed RPC. JSON reaches grpcurl only through stdin.
    pid = command(['docker', 'inspect', '--format', '{{.State.Pid}}', container_id()])
    if not re.fullmatch(r'[1-9][0-9]*', pid):
        raise RuntimeError('Coordinator process identity unavailable')
    address = f'/proc/{pid}/root/run/headscale/headscale.sock'
    result = command(['grpcurl', '-unix', '-plaintext', '-max-time', '12', '-d', '@',
                      address, 'headscale.v1.HeadscaleService/AuthRegister'],
                     data=json.dumps(request), timeout=20)
    node = json.loads(result)['node']
    fields = {'id': 'id', 'name': 'name', 'givenName': 'given_name',
              'ipAddresses': 'ip_addresses', 'online': 'online'}
    summary = {output: node[field] for field, output in fields.items() if field in node}
    summary['id'] = int(node['id'])  # Protobuf JSON encodes uint64 as a string; retain the CLI's integer output.
    return [summary]


def inspect_storage():
    # This gate runs with desired count zero; verify volume ownership before revoking format authority and admitting the app.
    declared = configuration()
    identity = find_device(declared['volume'])
    observed = json.loads(command(['findmnt', '-J', '-n', '-o', 'MAJ:MIN,FSTYPE,OPTIONS', '--mountpoint', str(MOUNT)]))['filesystems'][0]
    if not identity or observed['maj:min'] != f"{identity['major']}:{identity['minor']}" or observed['fstype'] != 'ext4' or not {'rw', 'nosuid', 'nodev', 'noexec'}.issubset(set(observed['options'].split(','))):
        raise RuntimeError('Coordinator persistent filesystem differs')
    if (MOUNT / '.volume-id').read_text().strip() != declared['volume']:
        raise RuntimeError('Coordinator mounted volume identity differs')
    for directory in ('lib', 'config'):
        attributes = (MOUNT / directory).stat()
        if (attributes.st_uid, attributes.st_gid, stat.S_IMODE(attributes.st_mode)) != (65532, 65532, 0o700):
            raise RuntimeError('Coordinator directory ownership differs')
    return {'volume': declared['volume'], 'filesystem': 'ext4', 'mounted': True}


def fingerprint_private_file(path, ownership=(65532, 65532)):
    # Check the opened inode: an application-controlled path must not race privileged diagnostics into a symlink/device.
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        raise RuntimeError('Coordinator private identity file cannot be opened safely') from error
    with os.fdopen(descriptor, 'rb') as handle:
        attributes = os.fstat(handle.fileno())
        if not stat.S_ISREG(attributes.st_mode) or (attributes.st_uid, attributes.st_gid) != ownership or stat.S_IMODE(attributes.st_mode) != 0o600 or attributes.st_size > 1024:
            raise RuntimeError('Coordinator private identity file ownership/type differs')
        return hashlib.sha256(handle.read(1025)).hexdigest()


def inspect_state():
    # Return hashes/counts only; keys, SQL contents and injected environments never leave the host.
    identity = MOUNT / 'lib/noise_private.key'
    cid = container_id()
    metadata = json.loads(command(['docker', 'inspect', '--format',
                                  '{"host":{{json .HostConfig}},"user":{{json .Config.User}},"state":{{json .State}},"mounts":{{json .Mounts}},"env":{{json .Config.Env}}}', cid]))
    command(['docker', 'exec', cid, '/ko-app/headscale', 'health'])
    host = metadata['host']
    if not host['ReadonlyRootfs'] or host['Privileged'] or metadata['user'] != '65532:65532' or host['Memory'] != 512 * 1048576:
        raise RuntimeError('Coordinator container confinement differs')
    if host['CapAdd'] or host['CapDrop'] != ['ALL'] or host['NetworkMode'] != 'bridge':
        raise RuntimeError('Coordinator capabilities/network differ')
    if any(item.startswith(('AWS_CONTAINER_CREDENTIALS_', 'AWS_ACCESS_KEY', 'AWS_SECRET', 'AWS_SESSION')) for item in metadata['env']):
        raise RuntimeError('Unexpected coordinator cloud credentials')
    pid = metadata['state']['Pid']
    status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
    if int(status['Uid'].split()[0]) != 65532 or int(status['CapEff'].strip(), 16) or status['NoNewPrivs'].strip() != '1' or status['Seccomp'].strip() != '2':
        raise RuntimeError('Coordinator process confinement differs')
    if (ROOT / 'sys/fs/selinux/enforce').read_text().strip() != '1' or ':container_t:' not in Path(f'/proc/{pid}/attr/current').read_text():
        raise RuntimeError('Coordinator SELinux confinement differs')
    mounts = {item['Destination']: item for item in metadata['mounts']}
    if set(mounts) - {'/etc/headscale', '/var/lib/headscale', '/run/headscale', '/tmp'} or host.get('Devices') or host.get('PidMode') == 'host':
        raise RuntimeError('Coordinator has unexpected mounts/devices or host PID sharing')
    if mounts.get('/etc/headscale', {}).get('RW') is not False or mounts.get('/var/lib/headscale', {}).get('RW') is not True:
        raise RuntimeError('Coordinator state/config mount modes differ')
    if mounts['/etc/headscale']['Source'] != '/mnt/headscale/config' or mounts['/var/lib/headscale']['Source'] != '/mnt/headscale/lib':
        raise RuntimeError('Coordinator bind sources differ')
    storage = inspect_storage()
    for directory in ('/run/headscale', '/tmp'):
        if command(['stat', '-f', '-c', '%T', f'/proc/{pid}/root{directory}']) != 'tmpfs':
            raise RuntimeError('Coordinator runtime storage must be tmpfs')
    if not identity.exists() or not (MOUNT / 'lib/db.sqlite').exists():
        raise RuntimeError('Coordinator durable state is missing')
    if len(Path('/proc/swaps').read_text().splitlines()) != 1:
        raise RuntimeError('Coordinator host swap must remain disabled')
    return {**storage, 'healthy': True, 'noiseSha256': fingerprint_private_file(identity),
            'databaseBytes': (MOUNT / 'lib/db.sqlite').stat().st_size, 'readonlyRoot': True, 'nonRoot': True}


def main():
    # All helper commands are bounded and their outputs are deliberately narrower than upstream CLI responses.
    config = configuration()
    action = sys.argv[1] if len(sys.argv) > 1 else config['phase']
    if action == 'bootstrap':
        if len(Path('/proc/swaps').read_text().splitlines()) != 1:
            raise RuntimeError('Coordinator host must have swap disabled')
        mount_volume(config)
        network_boundary()
        print('Owned coordinator volume and private-network boundary ready')
    elif action == 'diagnostic':
        while True:
            time.sleep(60)
    elif action == 'verify':
        print(json.dumps(inspect_state()))
    elif action == 'storage':
        print(json.dumps(inspect_storage()))
    elif action == 'configure':
        write_configuration(json.loads(base64.b64decode(sys.argv[2], validate=True)))
        print('Coordinator public configuration updated')
    elif action == 'unmount':
        # Volume movement starts only after ECS has stopped; flush and detach cleanly before terminating the host.
        os.environ['DOCKER_HOST'] = 'unix://' + str(ROOT / 'run/docker.sock')
        if command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={FAMILY}', '--format', '{{.ID}}']):
            raise RuntimeError('Coordinator writer is still running')
        if subprocess.run(['mountpoint', '-q', str(MOUNT)], capture_output=True, check=False).returncode:
            print('Coordinator filesystem is already unmounted')
            return
        if (MOUNT / '.volume-id').read_text().strip() != config['volume']:
            raise RuntimeError('Refuse to unmount a different volume')
        command(['sync', '-f', str(MOUNT)])
        command(['umount', str(MOUNT)])
        print('Owned coordinator filesystem cleanly unmounted')
    elif action == 'approval-key' and len(sys.argv) == 3:
        print(prepare_approval(approval_key_path(sys.argv[2])))
    elif action == 'approve' and len(sys.argv) == 4:
        print(json.dumps(approve_node(decrypt_approval(approval_key_path(sys.argv[2]), sys.argv[3]))))
    elif action == 'admin':
        arguments = sys.argv[2:]
        allowed = ((len(arguments) == 3 and arguments[:2] == ['users', 'create'] and re.fullmatch(r'[a-z][a-z0-9-]{0,31}', arguments[2]))
                   or arguments == ['users', 'list'] or arguments == ['nodes', 'list']
                   or (len(arguments) == 5 and arguments[0] in ('nodes', 'users') and arguments[1:3] == ['delete', '--identifier']
                       and arguments[3].isdigit() and arguments[4] == '--force'))
        if not allowed:
            raise RuntimeError('Unsupported bounded coordinator administrative operation')
        output = command(['docker', 'exec', container_id(), '/ko-app/headscale', *arguments, '--output', 'json'])
        if arguments[1] == 'delete':
            print(json.dumps({'deleted': True}))
            return
        result = json.loads(output)
        # Node API responses may contain nested authentication records; emit only the administrative summary.
        records = [] if result is None else result if isinstance(result, list) else [result]
        print(json.dumps([{key: item[key] for key in ('id', 'name', 'given_name', 'ip_addresses', 'online') if key in item}
                          for item in records]))
    else:
        raise RuntimeError('Unknown coordinator host operation')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('Coordinator host operation failed: ' + detail, file=sys.stderr)
        sys.exit(1)
