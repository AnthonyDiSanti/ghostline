#!/usr/bin/env python3
"""Exercise the actual policy builder without invoking the host packet filter."""
from pathlib import Path
import importlib.util
import json

spec = importlib.util.spec_from_file_location('network', Path(__file__).resolve().parents[3] / 'runtime/ecs/network.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
c = {'interface': 'ens5', 'xray': '10.79.0.11', 'awg': '10.79.0.10'}
p = {'xray': {'ip': '172.17.0.2', 'id': 'x'}, 'awg': {'ip': '172.17.0.3', 'id': 'a'}}
rules, nat = n.policy(c, p)
empty, _ = n.policy(c, {})
shared = {**p, 'dns-policy': {'ip': '172.17.0.4', 'id': 'd'}}
shared_rules, shared_nat = n.policy({**c, 'dnsRequired': True, 'dnsSource': c['awg']}, shared)
pending_dns_rules, pending_dns_nat = n.policy({**c, 'dnsRequired': True, 'dnsSource': c['awg']}, {'dns-policy': shared['dns-policy']})
other_primary_rules, other_primary_nat = n.policy({**c, 'dnsRequired': True, 'dnsSource': '10.79.0.12'}, shared)
missing_dns_rules, _ = n.policy({**c, 'dnsRequired': True}, p)
redirect = n.dns_redirect({**c, 'dnsRequired': True}, shared)
missing_redirect = n.dns_redirect({**c, 'dnsRequired': True}, p)
chains = {}
n.replace_chain = lambda table, name, entries: chains.update({f'{table}/{name}': entries})
n.ensure_jump = lambda *_: None
n.initialize({**c, 'dnsRequired': True, 'dnsSource': c['awg']})
print(json.dumps({'rules': rules, 'nat': nat, 'empty': empty,
                  'sharedRules': shared_rules, 'sharedNat': shared_nat, 'otherPrimaryNat': other_primary_nat,
                  'pendingDnsRules': pending_dns_rules, 'pendingDnsNat': pending_dns_nat,
                  'missingDnsRules': missing_dns_rules,
                  'redirect': redirect, 'missingRedirect': missing_redirect, 'coldChains': chains}))
