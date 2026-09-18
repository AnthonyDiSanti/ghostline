#!/bin/sh
set -eu
# Only public diagnostic code is unpacked; credentials remain inside the verifier's process.
directory=$(mktemp -d "${TMPDIR:-/tmp}/ghostline-verify.XXXXXX")
trap 'rm -rf "$directory"' EXIT
trap 'exit 1' HUP INT TERM
printf '%s' '@@VERIFIER@@' | base64 -d > "$directory/verify.py"
printf '%s' '@@NETWORK_PROBE@@' | base64 -d > "$directory/network-probe.py"
python3 -B "$directory/verify.py"
