#!/usr/bin/env python3
"""Verify a relay namespace cannot initiate internet, metadata or private-peer connections."""
import json
import socket
import sys


def reachable(address, port):
    # Only a TCP handshake is attempted, never HTTP, credentials or client payload capture.
    try:
        with socket.create_connection((address, port), timeout=0.4):
            return True
    except OSError:
        return False


targets = [('1.1.1.1', 443), ('169.254.169.254', 80), ('172.17.0.1', 80)]
targets.extend((address, port) for address in sys.argv[1:] for port in (443, 5353))
if any(reachable(address, port) for address, port in targets):
    raise SystemExit('DERP namespace isolation failed; details withheld')
try:
    # A refusal proves reachability, so require a firewall timeout for the real ECS credential service.
    with socket.create_connection(('169.254.170.2', 80), timeout=2):
        pass
except socket.timeout:
    pass
else:
    raise SystemExit('DERP task credential isolation failed')
print(json.dumps({'internetInitiationBlocked': True, 'metadataBlocked': True, 'privatePeersBlocked': True,
                  'taskCredentialsBlocked': True}))
