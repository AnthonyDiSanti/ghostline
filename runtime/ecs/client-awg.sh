#!/bin/bash
set -euo pipefail
# This disposable client changes only its own container routes, never the laptop's VPN state.
amneziawg-go -f client0 >/tmp/awg.log 2>&1 &
daemon=$!
trap 'kill "$daemon" 2>/dev/null || true' EXIT
for attempt in {1..100}; do
  test -S /run/amneziawg/client0.sock && break
  sleep 0.1
done
awg setconf client0 <(awg-quick strip /test/profile.conf)
address=$(sed -n 's/^Address = //p' /test/profile.conf)
endpoint=$(sed -n 's/^Endpoint = \([^:]*\):.*/\1/p' /test/profile.conf)
gateway=$(ip -4 route show default | awk '{print $3}')
ip address add "$address" dev client0
ip link set mtu 1280 up dev client0
ip route add "$endpoint/32" via "$gateway" dev eth0
ip route replace default dev client0
touch /tmp/ready
wait "$daemon"
