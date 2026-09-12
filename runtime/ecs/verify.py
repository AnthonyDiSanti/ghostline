#!/usr/bin/env python3
"""Return only nonsecret runtime evidence through SSM command output."""
import hashlib
import json
import subprocess
from pathlib import Path


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError('Verification subprocess failed; output withheld')
    return result.stdout.strip()


config = json.loads(Path('/etc/ghostline-network.json').read_text())
peers = json.loads(Path('/run/ghostline-network-state.json').read_text())
result = {}
for name in ['xray', 'awg']:
    # Hash the rendered configuration on the host; never return raw files to SSM's stored output.
    peer = peers[name]
    filename = '/run/ghostline/server.json' if name == 'xray' else '/run/ghostline/awg0.conf'
    digest = run(['docker', 'exec', peer['id'], 'sha256sum', filename]).split()[0]
    public_ip = run(['docker', 'exec', peer['id'], 'wget', '-T', '15', '-qO-', 'https://checkip.amazonaws.com'])
    info = json.loads(run(['docker', 'inspect', '--format', '{{json .HostConfig}}', peer['id']]))
    if info['Privileged'] or info['NetworkMode'] != 'bridge' or not info['ReadonlyRootfs']:
        raise RuntimeError('Container security/network configuration differs')
    # A response, including an IMDS 401, means the host boundary is reachable and is a failure.
    metadata = subprocess.run(['docker', 'exec', peer['id'], 'wget', '-T', '2', '-S', '-O', '/dev/null',
                               'http://169.254.169.254/latest/meta-data/'], capture_output=True, text=True)
    if 'HTTP/' in metadata.stderr or metadata.returncode == 0:
        raise RuntimeError('Container can reach instance metadata')
    result[name] = {'container': peer['id'], 'containerIp': peer['ip'], 'configSha256': digest,
                    'publicIp': public_ip, 'metadataBlocked': True}
print(json.dumps(result))
