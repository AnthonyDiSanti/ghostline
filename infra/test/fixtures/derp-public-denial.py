#!/usr/bin/env python3
"""Prove public listener denial from a direct, non-admitted operator path."""
import ipaddress
import json
import os
import socket
import struct
import subprocess
import sys
import urllib.request


def reachable(ip, port):
    # A TCP handshake is sufficient: no TLS bypass, credentials or application payload is sent.
    try:
        with socket.create_connection((ip, port), timeout=4):
            return True
    except OSError:
        return False


def main():
    # Require a reachable public control and direct Mac routes before interpreting silence as ingress denial.
    relay, control, *admitted = sys.argv[1:]
    if not admitted or relay == control or not all(ipaddress.IPv4Address(ip).is_global for ip in (relay, control, *admitted)):
        raise RuntimeError('Select distinct public relay/control addresses')
    if sys.platform == 'darwin':
        for ip in (relay, control):
            result = subprocess.run(['/sbin/route', '-n', 'get', ip], capture_output=True, text=True, check=True)
            interface = next((line.split(':', 1)[1].strip() for line in result.stdout.splitlines()
                              if line.strip().startswith('interface:')), '')
            if not interface or interface.startswith('utun'):
                raise RuntimeError('Direct-path verification requires the native VPN disconnected')
    # A travel router could already use an admitted AWS exit despite direct Mac routes; never retain the source IP.
    direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with direct.open('https://checkip.amazonaws.com', timeout=8) as response:
        source = str(ipaddress.IPv4Address(response.read(64).decode().strip()))
    if source in admitted:
        raise RuntimeError('Operator source is admitted; select a different path for a conclusive denial test')
    if not reachable(control, 443):
        raise RuntimeError('Public control is unavailable; denial is inconclusive')
    denied = {'tcp443Denied': not reachable(relay, 443), 'internalPortDenied': not reachable(relay, 18443)}
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
        client.settimeout(4)
        client.sendto(struct.pack('!HHI12s', 1, 0, 0x2112A442, os.urandom(12)), (relay, 3478))
        try:
            client.recvfrom(2048)
            denied['stunDenied'] = False
        except TimeoutError:
            denied['stunDenied'] = True
    if not all(denied.values()):
        raise RuntimeError('An unapproved source reached a restricted public listener')
    print(json.dumps({'control443Reachable': True, **denied}))


if __name__ == '__main__':
    main()
