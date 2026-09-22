#!/usr/bin/env python3
"""Explicit privileged checks, isolated from the daemon's runtime and permissions."""
import hashlib
import json
import os
import socket
import stat
import sys
import time
from pathlib import Path

import network
from host_support import ROOT, command, configuration, prepare_tools


def daemon_posture(config):
    # Inspect exact runtime confinement without exposing environment values or host credential endpoints.
    ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={config["family"]}-network',
                   '--format', '{{.ID}}']).split()
    if len(ids) != 1:
        raise RuntimeError('Expected one network daemon')
    data = json.loads(command(['docker', 'inspect', '--format', '{{json .HostConfig}}', ids[0]]))
    mounts = json.loads(command(['docker', 'inspect', '--format', '{{json .Mounts}}', ids[0]]))
    pid = int(command(['docker', 'inspect', '--format', '{{.State.Pid}}', ids[0]]))
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
    if command(['docker', 'inspect', '--format', '{{.State.Health.Status}}', ids[0]]) != 'healthy':
        raise RuntimeError('Network daemon is not healthy')
    return {'capabilities': ['NET_ADMIN', 'NET_RAW'], 'hostMounts': False, 'hostPid': False, 'seccomp': True,
            'noNewPrivileges': True, 'selinuxLabel': label, 'healthy': True}

def verify(config):
    # Read operational keys only to hash them locally. Never return configs, Docker environments or logs.
    peers = network.discover(config)
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
        # ECS injects harmless region/runtime markers even without a task role; reject credential channels.
        platform_names = {'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_EXECUTION_ENV'}
        if any(item.startswith(('GHOSTLINE_', 'AWS_')) and item.split('=', 1)[0] not in platform_names for item in env):
            raise RuntimeError('Unexpected engine credential environment')
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
    return evidence



if __name__ == '__main__':
    network.command = command
    prepare_tools()
    if sys.argv[1:] == ['boot-id']:
        print(Path('/proc/sys/kernel/random/boot_id').read_text().strip())
    elif not sys.argv[1:]:
        print(json.dumps(verify(configuration())))
    else:
        raise SystemExit('Unknown diagnostics action')
