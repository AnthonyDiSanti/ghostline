#!/usr/bin/env bash
set -euo pipefail
umask 077

# The builder has no ECS enrollment authority; install the gate for the AMI's next, fresh boot.
dnf install -y ipset iptables-nft conntrack-tools
install -d -m 0755 /opt/ghostline/al2023/v1 /mnt/ghostline/config \
  /etc/systemd/system/docker.service.d /etc/systemd/system/ecs.service.d /etc/ghostline

write_asset() {
  # Rename a fully decoded root-owned fixture into place; partial content must never become a unit.
  local target=$1 mode=$2 temporary
  temporary=$(mktemp "${target}.XXXXXXXX")
  base64 --decode > "$temporary"
  chmod "$mode" "$temporary"
  mv -f "$temporary" "$target"
}

write_asset /opt/ghostline/al2023/v1/quarantine.sh 0755 <<'ASSET'
@@QUARANTINE_SH@@
ASSET
write_asset /opt/ghostline/al2023/v1/quarantine.py 0644 <<'ASSET'
@@QUARANTINE_PY@@
ASSET
write_asset /opt/ghostline/al2023/v1/guard.py 0644 <<'ASSET'
@@GUARD_PY@@
ASSET
write_asset /opt/ghostline/al2023/v1/network.py 0644 <<'ASSET'
@@NETWORK_PY@@
ASSET
write_asset /opt/ghostline/al2023/v1/bootstrap-probe.sh 0755 <<'ASSET'
@@BOOTSTRAP_SH@@
ASSET
write_asset /etc/systemd/system/mnt-ghostline-config.mount 0644 <<'ASSET'
@@CONFIG_MOUNT@@
ASSET
write_asset /etc/systemd/system/ghostline-bootstrap.service 0644 <<'ASSET'
@@BOOTSTRAP_UNIT@@
ASSET
write_asset /etc/systemd/system/docker.service.d/10-ghostline-gate.conf 0644 <<'ASSET'
@@DOCKER_GATE@@
ASSET
write_asset /etc/systemd/system/ecs.service.d/10-ghostline-gate.conf 0644 <<'ASSET'
@@ECS_GATE@@
ASSET
write_asset /opt/ghostline/al2023/v1/prepare-image.sh 0755 <<'ASSET'
@@PREPARE_IMAGE_SH@@
ASSET
write_asset /opt/ghostline/al2023/v1/check-ecs-config.sh 0755 <<'ASSET'
@@CHECK_ECS_CONFIG_SH@@
ASSET

printf 'GHOSTLINE_BOOTSTRAP_IMAGE=%s\n' '@@BOOTSTRAP_IMAGE@@' > /etc/ghostline/al2023.env
chmod 0600 /etc/ghostline/al2023.env
systemctl daemon-reload
systemd-analyze verify mnt-ghostline-config.mount ghostline-bootstrap.service docker.service ecs.service
systemctl enable mnt-ghostline-config.mount ghostline-bootstrap.service
systemctl show docker.service --property=Requires --value | grep -qw mnt-ghostline-config.mount
systemctl show docker.service --property=ExecStartPre --value | grep -Fq /opt/ghostline/al2023/v1/quarantine.sh
systemctl show ecs.service --property=Requires --value | grep -qw ghostline-bootstrap.service
systemctl show ecs.service --property=After --value | grep -qw ghostline-bootstrap.service
if grep -q '^ECS_CLUSTER=' /etc/ecs/ecs.config; then
  echo 'Refusing to bake a regional ECS cluster into the generic host image' >&2
  exit 1
fi
echo 'Ghostline image-builder gate installed; no gateway enrollment configured'
