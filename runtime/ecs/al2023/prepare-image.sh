#!/usr/bin/env bash
set -euo pipefail

# Run only on the disposable builder after verifying the installed gate; remove per-instance state.
test -x /opt/ghostline/al2023/v1/quarantine.sh
test -x /opt/ghostline/al2023/v1/bootstrap-probe.sh
systemctl show docker.service --property=ExecStartPre --value | grep -Fq /opt/ghostline/al2023/v1/quarantine.sh
systemctl show ecs.service --property=Requires --value | grep -qw ghostline-bootstrap.service
if grep -q '^ECS_CLUSTER=' /etc/ecs/ecs.config; then
  echo 'Refusing to image an ECS-registered builder' >&2
  exit 1
fi

# AWS's ECS image guidance requires the agent and Docker to stop before removing agent state.
systemctl stop ecs.service
systemctl stop docker.service docker.socket containerd.service
if systemctl is-active --quiet ecs.service docker.service containerd.service; then
  echo 'Runtime still active; refusing to prepare image' >&2
  exit 1
fi
rm -f /var/lib/ecs/data/agent.db
rm -rf /var/log/ecs/* /var/lib/docker /var/lib/containerd

# Prevent builder identity, SSH authorization and transient diagnostics from entering the AMI.
rm -f /etc/ssh/ssh_host_* /root/.ssh/authorized_keys /home/ec2-user/.ssh/authorized_keys
rm -f /etc/hostname /var/lib/systemd/random-seed
cloud-init clean --logs --seed
# AL2023's cloud-init lacks --machine-id; systemd regenerates an empty machine ID at next boot.
truncate -s 0 /etc/machine-id
rm -rf /var/log/amazon/ssm/* /var/log/journal/*
rm -f /opt/ghostline/al2023/v1/prepare-image.sh
sync
echo 'Ghostline derivative image prepared; stop the instance before CreateImage'
