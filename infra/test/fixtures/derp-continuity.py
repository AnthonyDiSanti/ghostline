#!/usr/bin/env python3
"""Compare metadata-only fleet receipts without reading or retaining credentials."""
import json
import sys
from pathlib import Path


def controls(detectors):
    # Compare enabled collection controls, not changing timestamps or backend feature ordering.
    result = []
    for detector in detectors:
        statuses = {}

        def collect(value, path):
            # Preserve each source's identity while discarding unrelated mutable API metadata.
            if isinstance(value, dict):
                for key, child in value.items():
                    if key == 'Status':
                        statuses[path] = child
                    else:
                        collect(child, f'{path}/{key}')
        collect(detector.get('DataSources', {}), 'sources')
        for feature in detector.get('Features', []):
            path = f'feature/{feature["Name"]}'
            statuses[path] = feature['Status']
            for setting in feature.get('AdditionalConfiguration', []):
                statuses[f'{path}/{setting["Name"]}'] = setting['Status']
        result.append({'detector': detector['Status'], 'controls': statuses})
    return result


def main():
    # Stable addresses/identities/security are mandatory; live hosts/tasks may change through the native rollout.
    before_path, after_path, *options = sys.argv[1:]
    if options not in ([], ['--derp']):
        raise RuntimeError('Usage: derp-continuity.py baseline current [--derp]')
    before, after = [json.loads(Path(path).read_text()) for path in (before_path, after_path)]
    if before['account'] != after['account']:
        raise RuntimeError('Fleet account changed')
    expected = {record['target']: record for record in before['regions']}
    observed = {record['target']: record for record in after['regions']}
    if expected.keys() != observed.keys():
        raise RuntimeError('Maintained fleet membership changed')
    report = []
    for target, old in expected.items():
        new = observed[target]
        if old['region'] != new['region']:
            raise RuntimeError(f'{target}: region changed')
        for key in ('EndpointIp', 'AwgEndpointIp', 'EipAllocationId', 'AwgEipAllocationId'):
            if old['outputs'][key] != new['outputs'][key]:
                raise RuntimeError(f'{target}: retained endpoint changed')
        parameters = {item['Name']: item for item in new['parameters']}
        if any(parameters.get(item['Name']) != item for item in old['parameters']):
            raise RuntimeError(f'{target}: pre-existing credential/contact metadata changed')
        if controls(old['guardDuty']) != controls(new['guardDuty']):
            raise RuntimeError(f'{target}: GuardDuty protection changed')
        if any(old['releaseMode'][key] != new['releaseMode'][key] for key in ('AUTOMATION', 'OPERATOR_ONLY')):
            raise RuntimeError(f'{target}: original automation mode is not restored')
        active = bool(old.get('services'))
        if bool(new.get('services')) != active:
            raise RuntimeError(f'{target}: running/parked lifecycle changed')
        if options:
            if len(new['addresses']) != 2 or len(new['hosts']) != int(active):
                raise RuntimeError(f'{target}: temporary capacity or allocations remain')
            if len(new.get('tasks', [])) != int(active) or any(host['state'] != 'running' for host in new['hosts']):
                raise RuntimeError(f'{target}: expected serving capacity is not running')
            if any(service['desiredCount'] != 1 or service['runningCount'] != 1 or service['pendingCount'] != 0
                   or service['status'] != 'ACTIVE' for service in new.get('services', [])):
                raise RuntimeError(f'{target}: gateway service is not stable')
            for task in new.get('tasks', []):
                if task['lastStatus'] != 'RUNNING' or task['healthStatus'] != 'HEALTHY' or {row['name'] for row in task['containers']} != {
                        'xray', 'awg', 'dns-policy', 'derp', 'gateway-config'}:
                    raise RuntimeError(f'{target}: seven-image task is not healthy')
        report.append({'target': target, 'preservedParameters': len(old['parameters']),
                       'preservedEips': 2, 'parked': not active, 'securityAndModePreserved': True})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
