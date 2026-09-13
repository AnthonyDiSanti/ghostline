#!/usr/bin/env python3
"""Return only nonsecret runtime evidence through SSM command output."""
import hashlib
import ipaddress
import json
import socket
import stat
import subprocess
from pathlib import Path


# Use host Python inside only the engine's network namespace: distroless needs no diagnostic tools.
# Resolve the public probe on the host, then preserve its TLS hostname inside the namespace.
NETWORK_PROBE = r'''
import http.client, ipaddress, json, socket, ssl, sys
address = sys.argv[1]
connection = http.client.HTTPSConnection('checkip.amazonaws.com', timeout=15)
connection.sock = ssl.create_default_context().wrap_socket(
    socket.create_connection((address, 443), timeout=15), server_hostname='checkip.amazonaws.com')
connection.request('GET', '/')
response = connection.getresponse()
if response.status != 200:
    raise RuntimeError('Public HTTPS probe failed')
public_ip = str(ipaddress.IPv4Address(response.read(128).decode().strip()))
connection.close()
try:
    metadata = socket.create_connection(('169.254.169.254', 80), timeout=2)
# AL2023's Python 3.9 has a distinct socket.timeout class; newer Python aliases TimeoutError.
except (socket.timeout, ConnectionRefusedError):
    pass
else:
    metadata.close()
    raise RuntimeError('Container can reach instance metadata')
print(json.dumps({'publicIp': public_ip, 'metadataBlocked': True}))
'''


def run(args):
    # Subprocess stderr may contain runtime details; only selected evidence reaches SSM output.
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=45)
    if result.returncode:
        raise RuntimeError('Verification subprocess failed; output withheld')
    return result.stdout.strip()


def verify():
    peers = json.loads(Path('/run/ghostline-network-state.json').read_text())
    address = socket.getaddrinfo('checkip.amazonaws.com', 443, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    result = {}
    for name in ['xray', 'awg']:
        # Read files through the exact running process's mount namespace; never return raw configuration.
        peer = peers[name]
        state = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', peer['id']]))
        if not state['Running'] or not isinstance(state['Pid'], int) or state['Pid'] <= 0:
            raise RuntimeError('Expected a running protocol container')
        pid = state['Pid']
        filename = '/usr/local/etc/xray/server.json' if name == 'xray' else '/run/ghostline/awg0.conf'
        path = Path(f'/proc/{pid}/root{filename}')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        info = json.loads(run(['docker', 'inspect', '--format', '{{json .HostConfig}}', peer['id']]))
        if info['Privileged'] or info['NetworkMode'] != 'bridge' or not info['ReadonlyRootfs']:
            raise RuntimeError('Container security/network configuration differs')
        if name == 'xray':
            # Verify actual permissions/mounts, not just the intended task definition.
            file_stat = path.stat()
            mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', peer['id']]))
            mount = next(m for m in mounts if m['Destination'] == '/usr/local/etc/xray')
            user = run(['docker', 'inspect', '--format', '{{.Config.User}}', peer['id']])
            if user != '65532:65532' or file_stat.st_uid != 65532 or stat.S_IMODE(file_stat.st_mode) != 0o400 or mount['RW']:
                raise RuntimeError('Xray configuration permissions differ')
        network = json.loads(run(['nsenter', '--target', str(pid), '--net', '--', '/usr/bin/python3', '-c', NETWORK_PROBE, address]))
        ipaddress.IPv4Address(network['publicIp'])
        current = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', peer['id']]))
        if not current['Running'] or current['Pid'] != pid:
            raise RuntimeError('Container changed during verification; retry')
        result[name] = {'container': peer['id'], 'containerIp': peer['ip'], 'configSha256': digest, **network}
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(verify()))
    except Exception:
        raise SystemExit('Runtime verification failed; confidential details withheld.')
