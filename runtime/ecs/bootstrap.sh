#!/bin/bash
set -euo pipefail
# EIP association follows instance creation; tolerate that short first-boot network gap.
for _ in {1..12}; do
  dnf install -y python3 iptables conntrack-tools amazon-ssm-agent && break
  sleep 5
done
command -v python3 iptables conntrack
systemctl enable --now amazon-ssm-agent
install -d -m 0755 /usr/local/lib/ghostline /etc/ecs /etc/systemd/system/ecs.service.d /etc/systemd/system/docker.service.d
echo '@@NETWORK_GZIP@@' | base64 -d | gzip -d > /usr/local/lib/ghostline/network.py
echo '@@CONFIG_STORAGE_GZIP@@' | base64 -d | gzip -d > /usr/local/lib/ghostline/config-storage.sh
chmod 0755 /usr/local/lib/ghostline/config-storage.sh
echo '@@CHECK_MEMORY_GZIP@@' | base64 -d | gzip -d > /usr/local/lib/ghostline/check-memory.sh
chmod 0755 /usr/local/lib/ghostline/check-memory.sh
cat > /etc/systemd/system/ghostline-config.service <<'UNIT'
@@CONFIG_SERVICE@@
UNIT
cat > /etc/systemd/system/docker.service.d/ghostline.conf <<'UNIT'
@@DOCKER_UNIT@@
UNIT
cat > /etc/ghostline-network.json <<'JSON'
{"family":"@@FAMILY@@","xray":"10.79.0.11","awg":"10.79.0.10"}
JSON
cat > /etc/ecs/ecs.config <<'ECS'
@@ECS_CONFIG@@
ECS
cat > /etc/ghostline-memory.env <<'MEMORY'
GHOSTLINE_TASK_MEMORY=@@TASK_MEMORY@@
MEMORY
# amazon-ec2-net-utils configures both assigned private IPv4 addresses on AL2023.
cat > /etc/systemd/system/ghostline-network.service <<'UNIT'
@@NETWORK_SERVICE@@
UNIT
cat > /etc/systemd/system/ecs.service.d/ghostline.conf <<'UNIT'
@@ECS_UNIT@@
UNIT
systemctl daemon-reload
systemctl enable ghostline-network.service ghostline-config.service
systemctl start ghostline-config.service
systemctl start --no-block ghostline-network.service
systemctl enable --now --no-block ecs
