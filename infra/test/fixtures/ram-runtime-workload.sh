#!/bin/sh
set -eu

# Model the initializer's handoff without writing its synthetic input to a layer.
if [ "${1:-}" = fail ]; then
    unset SYNTHETIC_SECRET
    printf '%s\n' 'INITIALIZER_FAILED'
    exit 17
fi
umask 077
printf '%s' "$SYNTHETIC_SECRET" >/config/server.conf
unset SYNTHETIC_SECRET
printf '%s\n' 'READY'
