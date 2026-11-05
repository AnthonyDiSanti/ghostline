#!/usr/bin/env python3
"""Reconcile named ECS bridge peers without granting them host network access."""
import json
import subprocess
from pathlib import Path

DNS_SETTINGS = json.loads(Path(__file__).with_name('dns-policy.json').read_text())


def command(args, data=None):
    # Shared primitives accept only public topology; suppress captured tool output on failure.
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
    if set(peers) - {'xray', 'awg', 'dns-policy'}:
        raise RuntimeError('Unknown bridge peer')
    rules = ['-i docker0 -d 169.254.0.0/16 -j DROP']
    nat = []
    dns = peers.get('dns-policy') if config.get('dnsRequired') else None
    if dns:
        # DNS is the only permitted bridge peer, and replies must belong to established exchanges.
        port = int(DNS_SETTINGS['listenPort'])
        for name in ('awg', 'xray'):
            if name not in peers:
                continue
            source = peers[name]['ip']
            for transport in ('tcp', 'udp'):
                rules.append(f'-i docker0 -o docker0 -s {source}/32 -d {dns["ip"]}/32 -p {transport} --dport {port} -j ACCEPT')
            rules.append(f'-i docker0 -o docker0 -s {dns["ip"]}/32 -d {source}/32 '
                         '-m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT')
    rules.extend(['-i docker0 -o docker0 -j DROP', '-i docker0 -d 10.79.0.0/24 -j DROP'])
    for name, peer in sorted(peers.items()):
        if name == 'dns-policy':
            continue
        source = peer['ip']
        address = config[name]
        transport = 'tcp' if name == 'xray' else 'udp'
        if config.get('dnsRequired'):
            # The DNAT path handles ordinary DNS; if it disappears, port 53 must fail closed.
            for dns_transport in ('tcp', 'udp'):
                rules.append(f'-i docker0 -s {source}/32 -o {interface} -p {dns_transport} --dport 53 -j DROP')
        rules.extend([
            f'-i docker0 -s {source}/32 -o {interface} -j ACCEPT',
            f'-i {interface} -o docker0 -d {source}/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
            f'-i {interface} -o docker0 -d {source}/32 -p {transport} --dport 443 -m conntrack --ctorigdst {address} --ctorigdstport 443 -j ACCEPT',
        ])
        nat.append(f'-s {source}/32 -o {interface} -j SNAT --to-source {address}')
    if dns:
        # DNS uses the host's primary source address without traversing either engine container.
        source = dns['ip']
        for upstream in DNS_SETTINGS['upstreams']:
            address = upstream['address']
            rules.extend([
                f'-i docker0 -s {source}/32 -o {interface} -d {address}/32 -p tcp --dport 853 -j ACCEPT',
                f'-i {interface} -o docker0 -s {address}/32 -d {source}/32 -p tcp --sport 853 '
                '-m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
            ])
        nat.append(f'-s {source}/32 -o {interface} -j SNAT --to-source {config["dnsSource"]}')
    return rules + ['-i docker0 -j DROP', '-o docker0 -j DROP', '-j RETURN'], nat + ['-j RETURN']


def dns_redirect(config, peers):
    # Redirect both engines' port-53 traffic only to the currently leased private resolver.
    dns = peers.get('dns-policy') if config.get('dnsRequired') else None
    if not dns:
        return ['-j RETURN']
    port = int(DNS_SETTINGS['listenPort'])
    rules = []
    for name in ('awg', 'xray'):
        if name not in peers:
            continue
        for transport in ('tcp', 'udp'):
            rules.append(f'-i docker0 -s {peers[name]["ip"]}/32 -p {transport} --dport 53 '
                         f'-j DNAT --to-destination {dns["ip"]}:{port}')
    return rules + ['-j RETURN']


def initialize(config):
    # Deny forwarded container traffic before ECS starts; missing reconciliation never uses default NAT.
    rules, nat = policy(config, {})
    replace_chain('filter', 'GHOSTLINE', rules)
    replace_chain('nat', 'GHOSTLINE_SNAT', nat)
    replace_chain('nat', 'GHOSTLINE_DNS', ['-j RETURN'])
    replace_chain('filter', 'GHOSTLINE_HOST', ['-i docker0 -j DROP', '-j RETURN'])
    ingress = [
        f'-i {config["interface"]} -p tcp --dport 443 ! -d {config["xray"]}/32 -j DROP',
        f'-i {config["interface"]} -p udp --dport 443 ! -d {config["awg"]}/32 -j DROP']
    if config.get('dnsRequired'):
        # Docker publishes the metadata binding, but no outside packet may use it as a DNS listener.
        ingress.extend(f'-i {config["interface"]} -p {transport} --dport {DNS_SETTINGS["hostPort"]} -j DROP'
                       for transport in ('tcp', 'udp'))
    replace_chain('raw', 'GHOSTLINE_INGRESS', ingress + ['-j RETURN'])
    ensure_jump('filter', 'DOCKER-USER', ['-j', 'GHOSTLINE'])
    ensure_jump('filter', 'INPUT', ['-j', 'GHOSTLINE_HOST'])
    ensure_jump('raw', 'PREROUTING', ['-j', 'GHOSTLINE_INGRESS'])
    ensure_jump('nat', 'POSTROUTING', ['-j', 'GHOSTLINE_SNAT'])
    ensure_jump('nat', 'PREROUTING', ['-j', 'GHOSTLINE_DNS'])


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
    replace_chain('nat', 'GHOSTLINE_DNS', dns_redirect(config, peers))
    Path('/run/ghostline-network-state.json').write_text(json.dumps(peers))
    print('Reconciled protocol network identities: ' + ','.join(sorted(peers)), flush=True)
