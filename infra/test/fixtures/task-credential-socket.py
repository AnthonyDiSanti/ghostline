#!/usr/bin/env python3
"""Require a firewall timeout without requesting credential response bytes."""
import socket

try:
    # Refusal is reachability, so it must fail this isolation proof.
    with socket.create_connection(('169.254.170.2', 80), timeout=2):
        pass
except socket.timeout:
    raise SystemExit(0)
raise SystemExit(1)
