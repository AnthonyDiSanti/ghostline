#!/usr/bin/env bash
set -euo pipefail
# Run only on the fresh Ubuntu host; all inputs are nonsecret private addressing metadata.
primary_ip=$1
secondary_ip=$2
nic_mac=$3
test "$(. /etc/os-release; echo "$VERSION_ID")" = 24.04
cloud-init status --wait >/dev/null

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# This Ubuntu AMI renders EC2 secondary addresses through cloud-init; verify its durable configuration.
python3 - "$secondary_ip" "$nic_mac" <<'PY'
import glob, sys, yaml
address, mac = sys.argv[1:]
matches = set()
for path in glob.glob('/etc/netplan/*.yaml'):
    data = yaml.safe_load(open(path)) or {}
    for name, config in data.get('network', {}).get('ethernets', {}).items():
        if (config.get('match', {}).get('macaddress', '').lower() == mac.lower()
            and any(item.split('/')[0] == address for item in config.get('addresses', []))):
            matches.add(name)
if len(matches) != 1:
    raise SystemExit('Expected cloud-init to persist the managed ENI secondary IPv4 in netplan.')
PY
ip -4 address show | grep -F "$primary_ip/" >/dev/null
ip -4 address show | grep -F "$secondary_ip/" >/dev/null
install -d -m 0700 /opt/ghostline
echo 'Managed Ubuntu host, Docker and secondary IPv4 ready.'
