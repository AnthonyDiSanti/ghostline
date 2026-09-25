#!/usr/bin/env bash
set -euo pipefail

# Install an empty lease guard before Docker can restore any bridge container.
if [[ ! -e /proc/sys/net/bridge/bridge-nf-call-iptables ]]; then
  modprobe br_netfilter
fi
sysctl -q -w net.bridge.bridge-nf-call-iptables=1
sysctl -q -w net.bridge.bridge-nf-call-ip6tables=1
PYTHONPATH=/opt/ghostline/al2023/v1 python3 /opt/ghostline/al2023/v1/quarantine.py
