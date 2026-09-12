#!/bin/sh
set -eu
umask 077
# ECS supplies the preserved bundle; only the engine config is needed at runtime.
mkdir -p /run/ghostline
printf '%s' "$GHOSTLINE_CONFIG" | jq -er '.files["server.json"]' | base64 -d > /run/ghostline/server.json
unset GHOSTLINE_CONFIG
/usr/bin/xray -test -config /run/ghostline/server.json >/dev/null 2>&1
exec /usr/bin/xray run -config /run/ghostline/server.json
