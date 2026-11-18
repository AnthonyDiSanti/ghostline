#!/usr/bin/env python3
"""Count-only native credential isolation and SDK fail-closed checks, without reading keys."""
import json
import os
import subprocess
import sys

# The transport substitutes the separately maintained socket fixture before sending this nonsecret program.
SOCKET_PROBE = ''


def command(arguments):
    # Never include Docker environment/transport output in a diagnostic exception.
    result = subprocess.run(arguments, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Native initializer probe operation failed')
    return result.stdout


def main(family):
    # Resolve only this exact owned task family; namespace probes attempt TCP, never credential HTTP requests.
    if not family.startswith('ghostline-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in family):
        raise RuntimeError('Invalid native probe family')
    os.environ['DOCKER_HOST'] = 'unix:///.bottlerocket/rootfs/run/docker.sock'
    names = ['xray', 'awg', 'dns-policy', 'derp']
    blocked = 0
    task = None
    for name in names:
        ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}-gateway',
                       '--filter', f'label=com.amazonaws.ecs.container-name={name}', '--format', '{{.ID}}']).decode().split()
        if len(ids) != 1:
            raise RuntimeError('Expected exactly one owned engine namespace')
        labels = json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Labels}}', ids[0]]))
        current = labels.get('com.amazonaws.ecs.task-arn')
        if not current or task is not None and task != current:
            raise RuntimeError('Engine task identity differs')
        task = current
        pid = command(['docker', 'inspect', '--format', '{{.State.Pid}}', ids[0]]).decode().strip()
        # Use the production probe's strict timeout semantics in every container, including CoreDNS.
        if not SOCKET_PROBE:
            raise RuntimeError('Socket fixture was not supplied')
        result = subprocess.run(['nsenter', '--target', pid, '--net', '--', 'python3', '-c', SOCKET_PROBE],
                                capture_output=True, timeout=10)
        if result.returncode:
            raise RuntimeError('Task credential endpoint is reachable or isolation is unproven')
        blocked += 1
    rules = command(['iptables', '-w', '-S', 'GHOSTLINE_HOST']).decode()
    if 'ACCEPT' in rules or '-i docker0 -j DROP' not in rules:
        raise RuntimeError('Exited initializer still has credential access')
    ids = command(['docker', 'ps', '--all', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}-gateway',
                   '--filter', f'label=com.amazonaws.ecs.task-arn={task}',
                   '--filter', 'label=com.amazonaws.ecs.container-name=gateway-config', '--format', '{{.ID}}']).decode().split()
    if len(ids) != 1:
        raise RuntimeError('Expected one completed initializer')
    container = json.loads(command(['docker', 'inspect', ids[0]]))[0]
    environment = dict(item.split('=', 1) for item in container['Config']['Env'])
    if container['State']['ExitCode'] != 0 or any(key.endswith('_BUNDLE') for key in environment):
        raise RuntimeError('Initializer status or environment differs')
    parameters = environment['GHOSTLINE_PARAMETERS']
    # A disposable capless/offline instance has its own tmpfs and no task credentials; it cannot touch serving config.
    failed = subprocess.run(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                             '--security-opt', 'no-new-privileges:true', '--user', '65532:65532', '--log-driver', 'none',
                             '--tmpfs', '/config:rw,nosuid,nodev,noexec,size=2m,mode=0700,uid=65532,gid=65532',
                             '--env', 'GHOSTLINE_PARAMETERS=' + parameters, container['Image']], capture_output=True, timeout=60)
    if failed.returncode != 1 or failed.stdout or failed.stderr.strip() != b'Configuration preparation failed; details withheld.':
        raise RuntimeError('Missing credentials did not fail closed with fixed output')
    print(json.dumps({'credentialNamespacesBlocked': blocked, 'initializerAccessWithdrawn': True,
                      'noInjectedBundles': True, 'initializerSucceeded': True, 'missingCredentialsRejected': True,
                      'failureOutputFixed': True, 'servingConfigurationUntouched': True}))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise RuntimeError('Expected exact family')
        main(sys.argv[1])
    except Exception:
        raise SystemExit('Native initializer probe failed; details withheld') from None
