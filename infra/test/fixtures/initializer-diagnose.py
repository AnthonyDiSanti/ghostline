#!/usr/bin/env python3
"""Report initializer prerequisites and timing as selected metadata, never raw environments or logs."""
import json
import os
import re
import stat
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path('/.bottlerocket/rootfs')


def command(arguments):
    # The transport may contain secret-bearing metadata on baseline hosts; all failures stay fixed.
    result = subprocess.run(arguments, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Diagnostic operation failed')
    return result.stdout


def main(family):
    # Limit every Docker read to the exact Ghostline initializer labels.
    if not re.fullmatch(r'ghostline-[a-z0-9-]+', family):
        raise RuntimeError('Unexpected family')
    os.environ['DOCKER_HOST'] = f'unix://{ROOT}/run/docker.sock'
    ids = command(['docker', 'ps', '--all', '--filter', f'label=com.amazonaws.ecs.task-definition-family={family}-gateway',
                   '--filter', 'label=com.amazonaws.ecs.container-name=gateway-config', '--format', '{{.ID}}']).decode().split()
    if len(ids) > 12:
        raise RuntimeError('Too many initializer records')
    records = []
    for identifier in ids:
        container = json.loads(command(['docker', 'inspect', identifier]))[0]
        environment = dict(item.split('=', 1) for item in container['Config']['Env'])
        parameters = json.loads(environment.get('GHOSTLINE_PARAMETERS', '{}'))
        state = container['State']
        duration = None
        if state['Status'] == 'exited':
            duration = (datetime.fromisoformat(state['FinishedAt'].replace('Z', '+00:00')) -
                        datetime.fromisoformat(state['StartedAt'].replace('Z', '+00:00'))).total_seconds()
        records.append({'status': state['Status'], 'exit': state['ExitCode'], 'seconds': duration,
                        'credentialLocatorValid': bool(re.fullmatch(r'/v2/credentials/[a-f0-9-]{36}', environment.get('AWS_CONTAINER_CREDENTIALS_RELATIVE_URI', ''))),
                        'parametersComplete': set(parameters) == {'xray', 'awg', 'derp'},
                        'parameterArnsValid': all(re.fullmatch(r'arn:aws:ssm:eu-north-1:[0-9]{12}:parameter/ghostline/prod/server/(xray|awg|derp)', value) for value in parameters.values()),
                        'argumentsEmpty': not container['Config'].get('Cmd'),
                        'userCorrect': container['Config'].get('User') == '65532:65532'})
    path = ROOT / 'mnt/ghostline/config'
    attributes = path.stat()
    policy = command(['iptables', '-w', '-S', 'GHOSTLINE_HOST']).decode()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open('http://127.0.0.1:51678/v1/tasks', timeout=3) as response:
        tasks = json.loads(response.read(1024 * 1024))
    introspection = [{'status': task.get('KnownStatus'), 'containers': [{'name': c.get('Name'),
                      'startedAtPresent': bool(c.get('StartedAt')), 'restartCountPresent': 'RestartCount' in c,
                      'dockerIdPresent': bool(c.get('DockerId')), 'ports': c.get('Ports', [])} for c in task['Containers']]}
                     for task in tasks['Tasks'] if task.get('Family') == family + '-gateway']
    print(json.dumps({'initializers': records, 'ramTypeCorrect': command(['stat', '-f', '-c', '%T', str(path)]).strip() == b'tmpfs',
                      'ramOwnerCorrect': attributes.st_uid == 65532 and attributes.st_gid == 65532,
                      'ramModeCorrect': stat.S_IMODE(attributes.st_mode) == 0o700,
                      'swapHeaderFields': len((ROOT / 'proc/swaps').read_text().split()),
                      'loopbackRoutingEnabled': (ROOT / 'proc/sys/net/ipv4/conf/docker0/route_localnet').read_text().strip() == '1',
                      'globalLoopbackRoutingEnabled': (ROOT / 'proc/sys/net/ipv4/conf/all/route_localnet').read_text().strip() == '1',
                      'initializerHostRulePresent': '51679' in policy, 'initializerRuleLeased': 'GHOSTLINE_LIVE' in policy,
                      'taskIntrospection': introspection,
                      'corePatternDiscards': (ROOT / 'proc/sys/kernel/core_pattern').read_text().strip() in ['|/bin/false', '|/usr/bin/false'],
                      'corePatternUsesPipe': (ROOT / 'proc/sys/kernel/core_pattern').read_text().strip().startswith('|')}))


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception:
        raise SystemExit('Initializer diagnosis failed; details withheld') from None
