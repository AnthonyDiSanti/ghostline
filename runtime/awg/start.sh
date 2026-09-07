#!/bin/bash
set -euo pipefail
# The userspace daemon owns the foreground lifetime; configuration never generates keys at startup.
amneziawg-go -f awg0 &
daemon_pid=$!
trap 'kill "$daemon_pid" 2>/dev/null || true; wait "$daemon_pid" 2>/dev/null || true' EXIT
trap 'exit 0' TERM INT
for attempt in {1..100}; do
  test -S /var/run/amneziawg/awg0.sock && break
  kill -0 "$daemon_pid"
  sleep 0.1
done
test -S /var/run/amneziawg/awg0.sock
awg setconf awg0 <(awg-quick strip /etc/amnezia/amneziawg/awg0.conf)
ip address add 10.78.0.1/24 dev awg0
ip link set mtu 1280 up dev awg0
# Masquerade tunnel peers into this container's dedicated, address-specific Docker egress network.
iptables -A FORWARD -i awg0 -o eth0 -s 10.78.0.0/24 -j ACCEPT
iptables -A FORWARD -i eth0 -o awg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.78.0.0/24 -o eth0 -j MASQUERADE
wait "$daemon_pid"
