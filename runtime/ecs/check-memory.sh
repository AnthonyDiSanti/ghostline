#!/bin/sh
set -eu
# Refuse to register capacity that cannot accommodate both the task and platform reserve.
required=$((GHOSTLINE_TASK_MEMORY + ECS_RESERVED_MEMORY))
awk -v required="$required" '/^MemTotal:/ { found=1; if (int($2 / 1024) < required) exit 1 } END { if (!found) exit 1 }' /proc/meminfo
