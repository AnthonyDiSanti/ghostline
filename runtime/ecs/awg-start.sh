#!/bin/bash
set -euo pipefail
umask 077
# Keep the secret out of child-process environments and materialize it only in tmpfs.
mkdir -p /run/ghostline
printf '%s' "$GHOSTLINE_CONFIG" > /run/ghostline/awg0.conf
unset GHOSTLINE_CONFIG
export GHOSTLINE_AWG_CONFIG=/run/ghostline/awg0.conf
exec /usr/local/bin/ghostline-awg
