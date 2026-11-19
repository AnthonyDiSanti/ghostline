#!/usr/bin/env python3
"""Native manual enrollment and lifecycle evidence using one disposable userspace Tailscale client."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

INFRA = Path(__file__).resolve().parents[2]
# Separate synthetic clients keep independent receipts while sharing the same maintained enrollment path.
SLOT = sys.argv[2] if len(sys.argv) > 2 else 'primary'
if not re.fullmatch(r'[a-z][a-z0-9-]{0,15}', SLOT):
    raise RuntimeError('Invalid qualification slot')
RECEIPT = INFRA.parent / '.local/deployments/headscale' / ('enrollment.json' if SLOT == 'primary' else 'enrollment-' + SLOT + '.json')
IMAGE = 'tailscale/tailscale:v1.104.7'


def run(arguments, checked=True, timeout=180, data=None):
    # Capture upstream client output; registration URLs and client state are never printed or copied to source.
    result = subprocess.run(arguments, cwd=INFRA, input=data, capture_output=True, text=True, timeout=timeout, check=False)
    if checked and result.returncode:
        raise RuntimeError('Enrollment operation failed: ' + arguments[0])
    return result


def admin(*arguments, data=None):
    # Use the maintained operator surface so every approval and deletion receives the same exclusion/account guards.
    return json.loads(run(['node', '--import=tsx', 'scripts/headscale.ts', *arguments], data=data).stdout)


def status(name):
    # Extract durable public identity only; the raw status may contain device/account metadata.
    raw = json.loads(run(['docker', 'exec', name, 'tailscale', '--socket=/state/tailscaled.sock', 'status', '--json']).stdout)
    return {'backend': raw['BackendState'], 'id': raw.get('Self', {}).get('ID'), 'addresses': raw.get('Self', {}).get('TailscaleIPs')}


def check(receipt):
    # A restored coordinator must recognize the same enrolled device; polling permits normal reconnect delay.
    for _ in range(30):
        current = status(receipt['container'])
        if current['backend'] == 'Running' and current['id'] == receipt['client']['id'] and current['addresses'] == receipt['client']['addresses']:
            nodes = admin('nodes')
            if any(str(node['id']) == str(receipt['node']) and node.get('online') is True for node in nodes):
                print(json.dumps({'enrolled': True, 'identityPreserved': True}))
                return
        time.sleep(2)
    raise RuntimeError('Enrolled client identity or membership did not recover')


def main():
    # The receipt makes the same synthetic node available during task restart/reboot/host replacement checks.
    action = sys.argv[1]
    if action == 'begin':
        if RECEIPT.exists():
            raise RuntimeError('An enrollment qualification already exists')
        token = uuid.uuid4().hex[:12]
        receipt = {'container': 'ghostline-hs-check-' + token, 'username': 'qualification-' + token}
        RECEIPT.write_text(json.dumps(receipt)); RECEIPT.chmod(0o600)
        run(['docker', 'pull', '--platform', 'linux/arm64', IMAGE])
        user = admin('users', receipt['username'])[0]
        receipt['user'] = user['id']
        RECEIPT.write_text(json.dumps(receipt))
        client = run(['docker', 'run', '-d', '--name', receipt['container'], '--platform', 'linux/arm64', '--read-only',
             '--user', '65532:65532', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '256m',
             '--tmpfs', '/state:rw,nosuid,nodev,uid=65532,gid=65532,mode=0700', '--tmpfs', '/tmp:rw,nosuid,nodev,uid=65532,gid=65532,mode=0700',
             '--entrypoint', 'tailscaled', IMAGE, '--tun=userspace-networking', '--statedir=/state', '--socket=/state/tailscaled.sock', '--port=0'])
        receipt['containerId'] = client.stdout.strip()
        RECEIPT.write_text(json.dumps(receipt))
        time.sleep(2)
        login = run(['docker', 'exec', receipt['container'], 'tailscale', '--socket=/state/tailscaled.sock', 'up',
                     '--login-server=https://ts.bigmantonyd.com', '--hostname=' + receipt['container'], '--accept-dns=false', '--timeout=15s'], checked=False)
        match = re.search(r'https://ts\.bigmantonyd\.com/(?:auth|register)/([A-Za-z0-9_-]+)', login.stdout + login.stderr)
        if not match:
            raise RuntimeError('Manual registration challenge was not returned')
        approved = admin('approve', receipt['username'], data=match.group(1) + '\n')
        receipt['node'] = approved[0]['id']
        receipt['nodeName'] = approved[0].get('name')
        for _ in range(30):
            current = status(receipt['container'])
            if current['backend'] == 'Running' and current['id']:
                receipt['client'] = current
                RECEIPT.write_text(json.dumps(receipt))
                check(receipt)
                return
            time.sleep(2)
        raise RuntimeError('Approved client did not connect')
    elif action == 'check':
        check(json.loads(RECEIPT.read_text()))
    elif action == 'cleanup':
        receipt = json.loads(RECEIPT.read_text())
        current = run(['docker', 'inspect', '--format', '{{.Id}}', receipt['container']], checked=False)
        if current.returncode == 0:
            if current.stdout.strip() != receipt.get('containerId'):
                raise RuntimeError('Qualification container identity changed; refuse cleanup')
            run(['docker', 'rm', '-f', receipt['container']])
        if 'node' in receipt:
            node = next((item for item in admin('nodes') if str(item['id']) == str(receipt['node'])), None)
            if node:
                if node.get('name') != receipt['nodeName']:
                    raise RuntimeError('Qualification membership identity changed; refuse cleanup')
                admin('delete-node', str(receipt['node']))
        if 'user' in receipt:
            user = next((item for item in admin('users') if str(item['id']) == str(receipt['user'])), None)
            if user:
                if user.get('name') != receipt['username']:
                    raise RuntimeError('Qualification user identity changed; refuse cleanup')
                admin('delete-user', str(receipt['user']))
        RECEIPT.rename(RECEIPT.with_stem(RECEIPT.stem + '-completed'))
        print(json.dumps({'syntheticClientRemoved': True}))
    else:
        raise RuntimeError('Unknown enrollment phase')


if __name__ == '__main__':
    main()
