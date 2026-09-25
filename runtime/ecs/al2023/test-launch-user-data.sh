#!/usr/bin/env bash
set -euo pipefail

# The baked gate protects Docker before this late cloud-init script admits the trial to ECS.
test -x /opt/ghostline/al2023/v1/quarantine.sh
test -x /opt/ghostline/al2023/v1/bootstrap-probe.sh
systemctl show docker.service --property=ExecStartPre --value | grep -Fq /opt/ghostline/al2023/v1/quarantine.sh
systemctl show ecs.service --property=Requires --value | grep -qw ghostline-bootstrap.service
if grep -q '^ECS_CLUSTER=' /etc/ecs/ecs.config; then
  echo 'Refusing to replace an existing ECS cluster assignment' >&2
  exit 1
fi
printf 'ECS_CLUSTER=%s\n' '@@CLUSTER@@' >> /etc/ecs/ecs.config
# The stock ECS unit orders After=cloud-final; blocking here deadlocks that dependency.
systemctl --no-block start ecs.service
