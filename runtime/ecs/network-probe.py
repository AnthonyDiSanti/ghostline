#!/usr/bin/env python3
"""Probe HTTPS egress and metadata isolation from the engine's network namespace."""
import http.client
import ipaddress
import json
import socket
import ssl
import sys

# The caller resolves the destination on the host; retain the original TLS hostname in this namespace.
address = sys.argv[1]
connection = http.client.HTTPSConnection('checkip.amazonaws.com', timeout=15)
connection.sock = ssl.create_default_context().wrap_socket(
    socket.create_connection((address, 443), timeout=15), server_hostname='checkip.amazonaws.com')
connection.request('GET', '/')
response = connection.getresponse()
if response.status != 200:
    raise RuntimeError('Public HTTPS probe failed')
public_ip = str(ipaddress.IPv4Address(response.read(128).decode().strip()))
connection.close()
try:
    metadata = socket.create_connection(('169.254.169.254', 80), timeout=2)
# AL2023's Python 3.9 has a distinct socket.timeout class; newer Python aliases TimeoutError.
except (socket.timeout, ConnectionRefusedError):
    pass
else:
    metadata.close()
    raise RuntimeError('Container can reach instance metadata')
print(json.dumps({'publicIp': public_ip, 'metadataBlocked': True}))
