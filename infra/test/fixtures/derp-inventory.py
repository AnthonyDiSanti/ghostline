#!/usr/bin/env python3
"""Read-only maintained-region metadata receipt; never request secret parameter values."""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys


def aws(region, *arguments):
    # Capture failures so provider diagnostics cannot spill configuration or account contact values.
    result = subprocess.run(['aws', '--profile', 'personal', '--region', region, *arguments, '--output', 'json'],
                            capture_output=True, timeout=90, check=False)
    if result.returncode:
        raise RuntimeError('AWS metadata read failed')
    return json.loads(result.stdout)


def observe(item):
    # Read the actual service definition/digests and retained lifecycle without exposing injected environments.
    target, config = item
    region = config['region']
    stack = aws(region, 'cloudformation', 'describe-stacks', '--stack-name', config['stackName'])['Stacks'][0]
    outputs = {row['OutputKey']: row['OutputValue'] for row in stack.get('Outputs', [])}
    lifecycle = aws(region, 'dynamodb', 'get-item', '--table-name', 'ghostline-prod-release-attempts',
                    '--key', json.dumps({'id': {'S': 'lifecycle'}}), '--consistent-read').get('Item', {})
    record = {'target': target, 'region': region, 'stack': stack['StackStatus'], 'outputs': outputs, 'lifecycle': lifecycle}
    # Include temporary capacity so final acceptance detects stranded hosts or allocations, not just stable root outputs.
    record['addresses'] = [{key: address.get(key) for key in ('AllocationId', 'PublicIp', 'NetworkInterfaceId')}
                            for address in aws(region, 'ec2', 'describe-addresses', '--filters',
                                               'Name=tag:Project,Values=ghostline', 'Name=tag:Environment,Values=prod')['Addresses']]
    hosts = aws(region, 'ec2', 'describe-instances', '--filters', 'Name=tag:Project,Values=ghostline',
                'Name=tag:Environment,Values=prod', 'Name=instance-state-name,Values=pending,running,stopping,stopped')['Reservations']
    record['hosts'] = [{'id': host['InstanceId'], 'state': host['State']['Name'], 'image': host['ImageId']}
                       for reservation in hosts for host in reservation['Instances']]
    # Version plus modification time detects replacement as well as ordinary updates, without decrypting identities.
    prefix = config.get('parameterPrefix', '/ghostline/prod')
    parameters = aws(region, 'ssm', 'describe-parameters', '--parameter-filters',
                     f'Key=Name,Option=BeginsWith,Values={prefix}/')['Parameters']
    record['parameters'] = [{key: parameter.get(key) for key in ('Name', 'Type', 'Version', 'LastModifiedDate', 'Tier')}
                            for parameter in parameters]
    controller = aws(region, 'lambda', 'get-function-configuration', '--function-name', 'ghostline-prod-release-gate')
    record['releaseMode'] = {key: controller.get('Environment', {}).get('Variables', {}).get(key)
                             for key in ('AUTOMATION', 'OPERATOR_ONLY', 'DNS_REQUIRED', 'DERP_REQUIRED')}
    detectors = aws(region, 'guardduty', 'list-detectors')['DetectorIds']
    record['guardDuty'] = [{key: detector.get(key) for key in ('Status', 'DataSources', 'Features')}
                           for detector in (aws(region, 'guardduty', 'get-detector', '--detector-id', item)
                                            for item in detectors)]
    if outputs.get('ClusterName'):
        services = aws(region, 'ecs', 'describe-services', '--cluster', outputs['ClusterName'],
                       '--services', config['resourceName'] + '-gateway')['services']
        record['services'] = [{key: service.get(key) for key in ('status', 'desiredCount', 'runningCount',
                              'pendingCount', 'taskDefinition', 'deploymentController')} for service in services]
        tasks = aws(region, 'ecs', 'list-tasks', '--cluster', outputs['ClusterName'],
                    '--service-name', config['resourceName'] + '-gateway')['taskArns']
        record['tasks'] = []
        if tasks:
            live = aws(region, 'ecs', 'describe-tasks', '--cluster', outputs['ClusterName'], '--tasks', *tasks)['tasks']
            for task in live:
                record['tasks'].append({key: task.get(key) for key in ('taskArn', 'taskDefinitionArn', 'lastStatus', 'healthStatus')}
                                      | {'containers': [{key: container.get(key) for key in
                                          ('name', 'image', 'imageDigest', 'lastStatus', 'healthStatus')} for container in task['containers']]})
    return record


def main():
    # The receipt directory is private; stdout contains only endpoint/runtime summary metadata.
    root, output = map(Path, sys.argv[1:])
    catalog = json.loads((root / 'infra/deployment.json').read_text())
    account = aws('us-east-1', 'sts', 'get-caller-identity')['Account']
    if account != catalog['account']:
        raise RuntimeError('AWS account mismatch')
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        regions = list(executor.map(observe, catalog['deployments'].items()))
    receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'account': account, 'regions': regions}
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(receipt, stream, indent=2)
    print(json.dumps([{'target': record['target'], 'services': record.get('services', []),
                       'endpoints': {key: value for key, value in record['outputs'].items() if key in ('EndpointIp', 'AwgEndpointIp')},
                       'containers': [container['name'] for task in record.get('tasks', []) for container in task['containers']]}
                      for record in regions], indent=2))


if __name__ == '__main__':
    main()
