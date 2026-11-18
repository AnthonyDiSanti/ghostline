#!/usr/bin/env python3
"""Exercise pending initializer admission and its exact non-public credential/network boundary."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'runtime/ecs'))
sys.path.insert(0, str(root / 'runtime/ecs/bottlerocket'))
import discovery
import network


def main():
    # A complete pending-task identity and unique kernel binding are both necessary for the writer.
    identity = {'Name': 'gateway-config', 'DockerId': 'a' * 64, 'StartedAt': '2026-11-17T00:00:00Z', 'RestartCount': 0,
                'Ports': [{'ContainerPort': 18082, 'HostPort': 18082, 'Protocol': 'tcp'}]}
    document = {'Tasks': [{'Family': 'selected-gateway', 'Arn': 'task/synthetic', 'DesiredStatus': 'RUNNING',
                           'KnownStatus': 'PENDING', 'Containers': [identity]}]}
    assert set(discovery.identities(document, 'selected')) == {'gateway-config'}
    del identity['RestartCount']
    assert discovery.identities(document, 'selected')['gateway-config']['restarts'] == 0
    identity['RestartCount'] = 1
    try:
        discovery.identities(document, 'selected')
    except RuntimeError:
        pass
    else:
        raise AssertionError('Restartable initializer was admitted')
    del identity['RestartCount']
    rules = '-A DOCKER ! -i docker0 -p tcp -m tcp --dport 18082 -j DNAT --to-destination 172.17.0.6:18082'
    assert discovery.destinations(rules, '172.17.0.0/16') == {'gateway-config': '172.17.0.6'}
    identity['DockerId'] = ''
    assert discovery.identities(document, 'selected') == {}
    config = {'interface': 'ens5', 'xray': '10.79.0.11', 'awg': '10.79.0.10', 'dnsRequired': True, 'dnsSource': '10.79.0.10'}
    peers = {'gateway-config': {'ip': '172.17.0.6'}, 'dns-policy': {'ip': '172.17.0.4'},
             'awg': {'ip': '172.17.0.3'}, 'xray': {'ip': '172.17.0.2'}}
    forwarded, _ = network.policy(config, peers)
    writer_accept = [rule for rule in forwarded if '-s 172.17.0.6/32' in rule and rule.endswith('ACCEPT')]
    assert all('--dport 5353' in rule or '-p tcp --dport 443' in rule for rule in writer_accept)
    assert any('-s 172.17.0.6/32 -d 10.0.0.0/8 -j DROP' in rule for rule in forwarded)
    credentials = network.host_policy(peers)
    assert credentials == ['-i docker0 -s 172.17.0.6/32 -d 127.0.0.1/32 -p tcp --dport 51679 '
                           '-m set --match-set GHOSTLINE_LIVE src -j ACCEPT', '-i docker0 -j DROP', '-j RETURN']
    del peers['gateway-config']
    assert network.host_policy(peers) == ['-i docker0 -j DROP', '-j RETURN']
    assert all('172.17.0.6' not in rule for rule in network.dns_redirect(config, peers))
    print(json.dumps({'passed': True}))


if __name__ == '__main__':
    main()
