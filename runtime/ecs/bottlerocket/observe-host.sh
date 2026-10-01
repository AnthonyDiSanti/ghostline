#!/bin/sh
# Fixed read-only SSM observation; no caller-supplied commands, application files or credential retrieval.
set -eu
boot_id=$(cat /proc/sys/kernel/random/boot_id)
case "$boot_id" in *[!a-f0-9-]*|'') exit 1 ;; esac
printf '{"bootId":"%s","os":' "$boot_id"
apiclient get os
printf ',"attributes":'
apiclient get settings.ecs.instance-attributes
printf ',"network":'
# Missing daemon observation is data, never a reason to prevent an otherwise safe recovery boot.
network=$(curl --silent --fail --max-time 2 --max-filesize 8192 http://127.0.0.1:51680/ready) || network='null'
printf '%s' "$network"
printf '}\n'
