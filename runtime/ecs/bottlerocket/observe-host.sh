#!/bin/sh
# Fixed read-only SSM observation; no caller-supplied commands, application files or credential retrieval.
set -eu
boot_id=$(cat /proc/sys/kernel/random/boot_id)
case "$boot_id" in *[!a-f0-9-]*|'') exit 1 ;; esac
printf '{"bootId":"%s","os":' "$boot_id"
apiclient get os
printf ',"attributes":'
apiclient get settings.ecs.instance-attributes
printf '}\n'
