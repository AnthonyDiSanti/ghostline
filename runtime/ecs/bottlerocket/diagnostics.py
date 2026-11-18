#!/usr/bin/env python3
"""Explicit privileged checks, isolated from the daemon's runtime and permissions."""
import hashlib
import json
import os
import re
import socket
import stat
import sys
import time
from pathlib import Path

import network
from host_support import ROOT, command, configuration, diagnostic_peers, prepare_tools


def credential_environment(environment):
    # ECS shares task-role authority. Its opaque locator is public metadata; static keys and application secrets are forbidden.
    allowed = {'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_EXECUTION_ENV'}
    for item in environment:
        name, _, value = item.partition('=')
        if name == 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI':
            if not re.fullmatch(r'/v2/credentials/[a-f0-9-]{36}', value):
                raise RuntimeError('Unexpected task credential locator')
        elif name.startswith(('GHOSTLINE_', 'AWS_')) and name not in allowed:
            raise RuntimeError('Unexpected engine credential environment')


def daemon_identity(config):
    # Either slot may own this host. Match exact families and container name, then reject ambiguous ownership.
    ids = []
    for suffix in ('-network', '-network-b'):
        ids.extend(command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={config["family"]}{suffix}',
                            '--filter', 'label=com.amazonaws.ecs.container-name=network', '--format', '{{.ID}}']).split())
    if len(ids) != 1:
        raise RuntimeError('Expected one network daemon')
    return ids[0]


def daemon_posture(config):
    # Inspect exact runtime confinement without exposing environment values or host credential endpoints.
    daemon = daemon_identity(config)
    data = json.loads(command(['docker', 'inspect', '--format', '{{json .HostConfig}}', daemon]))
    mounts = json.loads(command(['docker', 'inspect', '--format', '{{json .Mounts}}', daemon]))
    pid = int(command(['docker', 'inspect', '--format', '{{.State.Pid}}', daemon]))
    status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
    label = Path(f'/proc/{pid}/attr/current').read_text().strip()
    if data['Privileged'] or not data['ReadonlyRootfs'] or data['NetworkMode'] != 'host' or data['PidMode']:
        raise RuntimeError('Daemon runtime boundary differs')
    if mounts or data.get('Devices') or sorted(data['CapAdd']) != ['NET_ADMIN', 'NET_RAW'] or data['CapDrop'] != ['ALL']:
        raise RuntimeError('Daemon has extra mounts/devices/capabilities')
    if int(status['CapEff'].strip(), 16) != (1 << 12 | 1 << 13) or status['NoNewPrivs'].strip() != '1' or status['Seccomp'].strip() != '2':
        raise RuntimeError('Daemon kernel confinement differs')
    if ':container_t:' not in label:
        raise RuntimeError('Daemon SELinux confinement differs')
    if command(['docker', 'inspect', '--format', '{{.State.Health.Status}}', daemon]) != 'healthy':
        raise RuntimeError('Network daemon is not healthy')
    return {'capabilities': ['NET_ADMIN', 'NET_RAW'], 'hostMounts': False, 'hostPid': False, 'seccomp': True,
            'noNewPrivileges': True, 'selinuxLabel': label, 'healthy': True}

def verify(config):
    # Read operational keys only to hash them locally. Never return configs, Docker environments or logs.
    peers = diagnostic_peers(config)
    if set(peers) != {'xray', 'awg'}:
        raise RuntimeError('Expected both engines')
    if (ROOT / 'sys/fs/selinux/enforce').read_text().strip() != '1':
        raise RuntimeError('SELinux must enforce')
    if len(Path('/proc/swaps').read_text().splitlines()) != 1:
        raise RuntimeError('Swap must remain disabled')
    address = socket.getaddrinfo('checkip.amazonaws.com', 443, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    evidence = {'selinuxEnforcing': True, 'swapDisabled': True}
    groups = []
    for name, peer in peers.items():
        state = json.loads(command(['docker', 'inspect', '--format', '{{json .State}}', peer['id']]))
        pid = state['Pid']
        metadata = json.loads(command(['docker', 'inspect', '--format', '{{json .HostConfig}}', peer['id']]))
        env = json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Env}}', peer['id']]))
        credential_environment(env)
        if metadata['Privileged'] or not metadata['ReadonlyRootfs'] or metadata['NetworkMode'] != 'bridge':
            raise RuntimeError('Engine security boundary differs')
        process_label = Path(f'/proc/{pid}/attr/current').read_text().strip()
        if ':container_t:' not in process_label:
            raise RuntimeError('Engine must use ordinary SELinux confinement')
        directory, filename, file_mode = (('/usr/local/etc/xray', 'server.json', 0o400) if name == 'xray'
                                          else ('/etc/ghostline/awg', 'awg0.conf', 0o440))
        mount = next(item for item in json.loads(command(['docker', 'inspect', '--format', '{{json .Mounts}}', peer['id']]))
                     if item['Destination'] == directory)
        if mount['RW'] or mount['Source'] != f'/mnt/ghostline/config/{name}':
            raise RuntimeError('Expected protocol-private read-only mount')
        path = Path(f'/proc/{pid}/root{directory}/{filename}')
        attributes = path.stat()
        if (attributes.st_uid, attributes.st_gid, stat.S_IMODE(attributes.st_mode)) != (65532, 65532, file_mode):
            raise RuntimeError('Configuration permissions differ')
        if command(['stat', '-f', '-c', '%T', str(path)]) != 'tmpfs':
            raise RuntimeError('Configuration is not RAM-backed')
        net = json.loads(command(['nsenter', '--target', str(pid), '--net', '--', 'python3', '/opt/ghostline/network-probe.py', address]))
        relative = next(line.split('::', 1)[1] for line in Path(f'/proc/{pid}/cgroup').read_text().splitlines()
                        if line.startswith('0::'))
        groups.append(ROOT / 'sys/fs/cgroup' / relative.lstrip('/'))
        evidence[name] = {'configSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'container': peer['id'], 'processLabel': process_label, 'configReadOnly': True, **net}
    parent = Path(os.path.commonpath(groups))
    if parent in groups or int((parent / 'memory.max').read_text()) != config['taskMemory'] * 1048576:
        raise RuntimeError('Shared task memory limit differs')
    if any((group / 'memory.max').read_text().strip() != 'max' for group in groups):
        raise RuntimeError('Unexpected engine memory ceiling')
    events = dict(line.split() for line in (parent / 'memory.events').read_text().splitlines())
    if int(events.get('oom', 0)) or int(events.get('oom_kill', 0)):
        raise RuntimeError('Task memory exhaustion occurred')
    evidence['memory'] = {'taskMiB': config['taskMemory'], 'currentMiB': int((parent / 'memory.current').read_text()) // 1048576,
                          'hostAvailableMiB': next(int(line.split()[1]) // 1024 for line in Path('/proc/meminfo').read_text().splitlines()
                                                   if line.startswith('MemAvailable:'))}
    evidence['daemon'] = daemon_posture(config)
    if config.get('derp'):
        evidence['derp'] = derp_posture(config, peers)
    return evidence


def derp_posture(config, peers):
    # DERP admits inbound relay flows only; it must not inherit a VPN engine's internet egress permission.
    ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={config["family"]}-gateway',
                   '--filter', 'label=com.amazonaws.ecs.container-name=derp', '--format', '{{.ID}}']).split()
    if len(ids) != 1:
        raise RuntimeError('Expected exactly one regional DERP container')
    container = ids[0]
    state = json.loads(command(['docker', 'inspect', '--format', '{{json .State}}', container]))
    metadata = json.loads(command(['docker', 'inspect', '--format', '{{json .HostConfig}}', container]))
    environment = json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Env}}', container]))
    credential_environment(environment)
    if metadata['Privileged'] or not metadata['ReadonlyRootfs'] or metadata['NetworkMode'] != 'bridge' or metadata['Memory'] != 128 * 1048576:
        raise RuntimeError('DERP security or memory boundary differs')
    pid = state['Pid']
    status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
    if int(status['Uid'].split()[0]) != 65532 or int(status['CapEff'].strip(), 16) or status['NoNewPrivs'].strip() != '1' or status['Seccomp'].strip() != '2':
        raise RuntimeError('DERP process confinement differs')
    label = Path(f'/proc/{pid}/attr/current').read_text().strip()
    if ':container_t:' not in label:
        raise RuntimeError('DERP SELinux confinement differs')
    directory = '/etc/ghostline/derp'
    mounts = json.loads(command(['docker', 'inspect', '--format', '{{json .Mounts}}', container]))
    mount = next(item for item in mounts if item['Destination'] == directory)
    if mount['RW'] or mount['Source'] != '/mnt/ghostline/config/derp':
        raise RuntimeError('DERP private mount differs')
    root = Path(f'/proc/{pid}/root{directory}')
    public = json.loads((root / 'public.json').read_text())
    for name in ['public.json', 'derper.json', public['ip'] + '.crt', public['ip'] + '.key']:
        path = root / name
        attributes = path.stat()
        if (attributes.st_uid, attributes.st_gid, stat.S_IMODE(attributes.st_mode)) != (65532, 65532, 0o400) or command(['stat', '-f', '-c', '%T', str(path)]) != 'tmpfs':
            raise RuntimeError('DERP private RAM/file permissions differ')
    command(['docker', 'exec', container, '/usr/local/bin/derp-tools', 'health'])
    isolation = json.loads(command(['nsenter', '--target', str(pid), '--net', '--', 'python3', '/opt/ghostline/derp-network-probe.py',
                                    config['awg'], config['xray'], *[peer['ip'] for peer in peers.values()]]))
    return {'container': container, 'identity': public, 'configReadOnly': True, 'ramBacked': True,
            'capabilities': [], 'noNewPrivileges': True, 'seccomp': True, 'memoryMiB': 128, 'healthy': True, **isolation}



if __name__ == '__main__':
    network.command = command
    prepare_tools()
    if sys.argv[1:] == ['boot-id']:
        print(Path('/proc/sys/kernel/random/boot_id').read_text().strip())
    elif not sys.argv[1:]:
        print(json.dumps(verify(configuration())))
    else:
        raise SystemExit('Unknown diagnostics action')
