#!/usr/bin/env python3
"""Reconcile the two ECS bridge peers without granting either host network access."""
import json
import subprocess
import sys
import time
from pathlib import Path


def command(args, data=None):
    # Docker inspection is restricted to metadata: never collect environment/configuration values.
    result = subprocess.run(args, input=data, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{args[0]} operation failed; captured output withheld")
    return result.stdout


def ensure_jump(table, chain, rule):
    # Own only our jump/chains; preserve Docker's managed rules and unrelated host traffic.
    check = subprocess.run(['iptables', '-w', '-t', table, '-C', chain, *rule], capture_output=True)
    if check.returncode:
        command(['iptables', '-w', '-t', table, '-I', chain, '1', *rule])


def replace_chain(table, chain, rules):
    # A table transaction replaces our policy atomically, without flushing Docker's rules.
    data = f'*{table}\n:{chain} - [0:0]\n-F {chain}\n'
    data += ''.join(f'-A {chain} {rule}\n' for rule in rules)
    command(['iptables-restore', '-w', '--noflush'], data + 'COMMIT\n')


def policy(config, peers):
    # Identify egress by container address, never by transport of the tunneled user traffic.
    interface = config['interface']
    rules = ['-i docker0 -d 169.254.0.0/16 -j DROP', '-i docker0 -o docker0 -j DROP',
             '-i docker0 -d 10.79.0.0/24 -j DROP']
    nat = []
    for name, peer in sorted(peers.items()):
        source = peer['ip']
        address = config[name]
        transport = 'tcp' if name == 'xray' else 'udp'
        rules.extend([
            f'-i docker0 -s {source}/32 -o {interface} -j ACCEPT',
            f'-i {interface} -o docker0 -d {source}/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
            f'-i {interface} -o docker0 -d {source}/32 -p {transport} --dport 443 -m conntrack --ctorigdst {address} --ctorigdstport 443 -j ACCEPT',
        ])
        nat.append(f'-s {source}/32 -o {interface} -j SNAT --to-source {address}')
    return rules + ['-i docker0 -j DROP', '-o docker0 -j DROP', '-j RETURN'], nat + ['-j RETURN']


def discover(config):
    # Exact gateway family and container names keep platform/foreign containers out of the rules.
    peers = {}
    for name in ['xray', 'awg']:
        ids = command(['docker', 'ps', '--filter', f'label=com.amazonaws.ecs.task-definition-family={config["family"]}-gateway',
                       '--filter', f'label=com.amazonaws.ecs.container-name={name}', '--format', '{{.ID}}']).split()
        if len(ids) > 1:
            raise RuntimeError('Multiple containers for a single protocol; refuse ambiguous routing')
        if ids:
            # One inspection avoids mixing network and process generations across an in-place restart.
            metadata = json.loads(command(['docker', 'inspect', '--format',
                                           '{"state":{{json .State}},"networks":{{json .NetworkSettings.Networks}}}', ids[0]]))
            state, networks = metadata['state'], metadata['networks']
            address = networks.get('bridge', {}).get('IPAddress', '')
            if networks and set(networks) != {'bridge'}:
                raise RuntimeError('Unexpected container network')
            if not state['Running'] or state['Pid'] <= 0 or not address:
                continue  # Restart in progress: quarantine this peer without withdrawing its healthy sibling.
            import ipaddress
            if not ipaddress.ip_address(address).is_private or set(networks) != {'bridge'}:
                raise RuntimeError('Unexpected container network')
            # A native restart may reuse the container ID/IP; StartedAt distinguishes its network generation.
            peers[name] = {'ip': address, 'id': ids[0], 'started': state['StartedAt']}
    if len({peer['ip'] for peer in peers.values()}) != len(peers):
        raise RuntimeError('Duplicate protocol addresses')
    return peers


def initialize(config):
    # Deny forwarded container traffic before ECS starts; missing reconciliation never uses default NAT.
    rules, nat = policy(config, {})
    replace_chain('filter', 'GHOSTLINE', rules)
    replace_chain('nat', 'GHOSTLINE_SNAT', nat)
    replace_chain('filter', 'GHOSTLINE_HOST', ['-i docker0 -j DROP', '-j RETURN'])
    replace_chain('raw', 'GHOSTLINE_INGRESS', [
        f'-i {config["interface"]} -p tcp --dport 443 ! -d {config["xray"]}/32 -j DROP',
        f'-i {config["interface"]} -p udp --dport 443 ! -d {config["awg"]}/32 -j DROP', '-j RETURN'])
    ensure_jump('filter', 'DOCKER-USER', ['-j', 'GHOSTLINE'])
    ensure_jump('filter', 'INPUT', ['-j', 'GHOSTLINE_HOST'])
    ensure_jump('raw', 'PREROUTING', ['-j', 'GHOSTLINE_INGRESS'])
    ensure_jump('nat', 'POSTROUTING', ['-j', 'GHOSTLINE_SNAT'])


def reconcile(config, peers, previous=None):
    # Keep the unchanged sibling forwarding while quarantining changed/removed identities.
    previous = previous or {}
    stable = {name: peer for name, peer in peers.items() if previous.get(name) == peer}
    changed = {peer['ip'] for name, peer in previous.items() if stable.get(name) != peer}
    changed.update(peer['ip'] for name, peer in peers.items() if stable.get(name) != peer)
    replace_chain('filter', 'GHOSTLINE', policy(config, stable)[0])
    replace_chain('nat', 'GHOSTLINE_SNAT', policy(config, peers)[1])
    for address in sorted(changed):
        # Flush both outbound and DNAT-to-container tuples; never clear the whole Docker bridge.
        for selector in ['--orig-src', '--reply-src']:
            result = subprocess.run(['conntrack', '-D', selector, address], capture_output=True)
            if result.returncode not in (0, 1):  # conntrack returns 1 when no matching flows exist.
                raise RuntimeError('Connection cleanup failed')
    # Jump ownership/order is established at startup; ordinary restarts must not detach global policy.
    replace_chain('filter', 'GHOSTLINE', policy(config, peers)[0])
    Path('/run/ghostline-network-state.json').write_text(json.dumps(peers))
    print('Reconciled protocol network identities: ' + ','.join(sorted(peers)), flush=True)


def main():
    config = json.loads(Path('/etc/ghostline-network.json').read_text())
    config['interface'] = command(['ip', '-4', 'route', 'show', 'default']).split(' dev ')[1].split()[0]
    initialize(config)
    if '--initialize' in sys.argv:
        return
    previous = None
    while True:
        try:
            peers = discover(config)
            if peers != previous:
                reconcile(config, peers, previous)
                previous = peers
        except Exception:
            # Keep a missing/ambiguous metadata view closed, with a redacted retryable diagnostic.
            initialize(config)
            previous = None
            print('Network reconciliation unavailable; forwarding disabled', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
