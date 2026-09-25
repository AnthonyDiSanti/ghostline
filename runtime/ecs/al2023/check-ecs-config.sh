#!/usr/bin/env bash
set -euo pipefail

# A generic AMI must not enroll in the default cluster before launch data selects its target.
config=/etc/ecs/ecs.config
[[ -f $config ]] || exit 1
mapfile -t clusters < <(grep '^ECS_CLUSTER=' "$config" || true)
[[ ${#clusters[@]} -eq 1 && ${clusters[0]} =~ ^ECS_CLUSTER=[a-z][a-z0-9-]{0,100}$ ]]
