#!/usr/bin/env python3
"""Return only nonsecret runtime evidence through SSM command output."""
import hashlib
import ipaddress
import json
import os
import platform
import socket
import stat
import subprocess
from pathlib import Path


def run(args):
    # Subprocess stderr may contain runtime details; only selected evidence reaches SSM output.
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=45)
    if result.returncode:
        raise RuntimeError('Verification subprocess failed; output withheld')
    return result.stdout.strip()


def verify():
    # RAM rendering requires a nonswapping host, including after stop/start or a fresh deployment.
    if len(Path('/proc/swaps').read_text().splitlines()) != 1:
        raise RuntimeError('Swap must remain disabled for RAM-backed configuration')
    peers = json.loads(Path('/run/ghostline-network-state.json').read_text())
    address = socket.getaddrinfo('checkip.amazonaws.com', 443, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    result = {}
    groups = []
    for name in ['xray', 'awg']:
        # Read files through the exact running process's mount namespace; never return raw configuration.
        peer = peers[name]
        state = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', peer['id']]))
        if not state['Running'] or not isinstance(state['Pid'], int) or state['Pid'] <= 0:
            raise RuntimeError('Expected a running protocol container')
        pid = state['Pid']
        relative = next(line.split('::', 1)[1] for line in Path(f'/proc/{pid}/cgroup').read_text().splitlines() if line.startswith('0::'))
        groups.append(Path('/sys/fs/cgroup') / relative.lstrip('/'))
        architecture = verify_architecture(peer['id'])
        filename = '/usr/local/etc/xray/server.json' if name == 'xray' else '/etc/ghostline/awg/awg0.conf'
        path = Path(f'/proc/{pid}/root{filename}')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        info = json.loads(run(['docker', 'inspect', '--format', '{{json .HostConfig}}', peer['id']]))
        if info['Privileged'] or info['NetworkMode'] != 'bridge' or not info['ReadonlyRootfs']:
            raise RuntimeError('Container security/network configuration differs')
        # Inspect confidential environment metadata only in memory; return no names or values.
        environment = json.loads(run(['docker', 'inspect', '--format', '{{json .Config.Env}}', peer['id']]))
        verify_engine_environment(environment)
        mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', peer['id']]))
        mount = next(m for m in mounts if m['Destination'] == str(Path(filename).parent))
        user = run(['docker', 'inspect', '--format', '{{.Config.User}}', peer['id']])
        if user != ('65532:65532' if name == 'xray' else '0:65532'):
            raise RuntimeError('Engine identity differs')
        storage = verify_config_storage(path, mount, name)
        # Enter only the network namespace; the host's sibling probe needs no tools in distroless.
        probe = str(Path(__file__).with_name('network-probe.py'))
        network = json.loads(run(['nsenter', '--target', str(pid), '--net', '--', '/usr/bin/python3', probe, address]))
        ipaddress.IPv4Address(network['publicIp'])
        current = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', peer['id']]))
        if not current['Running'] or current['Pid'] != pid:
            raise RuntimeError('Container changed during verification; retry')
        result[name] = {'container': peer['id'], 'containerIp': peer['ip'], 'architecture': architecture, 'configSha256': digest,
                        'engineSecretEnvironmentAbsent': True, 'configStorage': storage, **network}
    result['gatewayMemory'] = verify_gateway_memory(groups)
    return result


def verify_gateway_memory(groups):
    # Both engines must share the enforced task cgroup, with no tighter per-engine memory ceilings.
    parent = Path(os.path.commonpath(groups))
    if parent in groups or parent == Path('/sys/fs/cgroup'):
        raise RuntimeError('Engines do not share a dedicated task cgroup')
    task = int(Path('/etc/ghostline-memory.env').read_text().strip().split('=', 1)[1])
    if int((parent / 'memory.max').read_text()) != task * 1048576:
        raise RuntimeError('Task memory limit differs from the host policy')
    if any((group / 'memory.max').read_text().strip() != 'max' for group in groups):
        raise RuntimeError('Unexpected engine memory ceiling')
    events = {key: int(value) for key, value in (line.split() for line in (parent / 'memory.events').read_text().splitlines())}
    if events.get('oom', 0) or events.get('oom_kill', 0):
        raise RuntimeError('Task has experienced memory exhaustion')
    config = dict(line.split('=', 1) for line in Path('/etc/ecs/ecs.config').read_text().splitlines() if '=' in line)
    reserved = int(config['ECS_RESERVED_MEMORY'])
    if config['ECS_ENABLE_TASK_CPU_MEM_LIMIT'] != 'true':
        raise RuntimeError('Task resource enforcement is disabled')
    return {'taskLimitMiB': task, 'agentReservedMiB': reserved,
            'currentMiB': round(int((parent / 'memory.current').read_text()) / 1048576, 2), 'events': events}


def verify_architecture(container):
    # A healthy emulated container would not validate a native Graviton deployment.
    if platform.machine() != 'aarch64':
        raise RuntimeError('Expected a native ARM64 host')
    architecture = 'arm64'
    image_id = run(['docker', 'inspect', '--format', '{{.Image}}', container])
    if run(['docker', 'image', 'inspect', '--format', '{{.Architecture}}', image_id]) != architecture:
        raise RuntimeError('Container image and host architecture differ')
    return architecture


def verify_engine_environment(environment):
    # An empty injected value is also a contract violation; engines receive only file-based secrets.
    forbidden = {'GHOSTLINE_CONFIG', 'GHOSTLINE_XRAY_BUNDLE', 'GHOSTLINE_AWG_BUNDLE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
                 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI', 'AWS_CONTAINER_CREDENTIALS_FULL_URI'}
    if any(value.partition('=')[0] in forbidden for value in environment):
        raise RuntimeError('Engine received secret environment or AWS credentials')


def verify_config_storage(path, mount, protocol):
    # Inspect the filesystem visible to the engine, not only its task-definition mount declaration.
    source = f'/run/ghostline-config/{protocol}'
    directory_mode, file_mode = (0o700, 0o400) if protocol == 'xray' else (0o750, 0o440)
    if mount['Type'] != 'bind' or mount['Source'] != source or mount['RW']:
        raise RuntimeError('Unexpected protocol configuration mount')
    if run(['stat', '-f', '-c', '%T', str(path)]) != 'tmpfs':
        raise RuntimeError('Protocol configuration is not RAM-backed')
    file_stat = path.stat()
    if (file_stat.st_uid, file_stat.st_gid, stat.S_IMODE(file_stat.st_mode)) != (65532, 65532, file_mode):
        raise RuntimeError('Protocol configuration file permissions differ')
    directory = path.parent.stat()
    if (directory.st_uid, directory.st_gid, stat.S_IMODE(directory.st_mode)) != (65532, 65532, directory_mode):
        raise RuntimeError('Protocol configuration directory permissions differ')
    filesystem = json.loads(run(['findmnt', '-J', '-T', source, '-o', 'FSTYPE,OPTIONS']))['filesystems'][0]
    if filesystem['fstype'] != 'tmpfs' or not {'nosuid', 'nodev', 'noexec'}.issubset(filesystem['options'].split(',')):
        raise RuntimeError('Protocol configuration mount protections differ')
    return {'filesystem': 'tmpfs', 'swapDisabled': True, 'readOnly': not mount['RW']}


if __name__ == '__main__':
    try:
        print(json.dumps(verify()))
    except Exception:
        raise SystemExit('Runtime verification failed; confidential details withheld.')
