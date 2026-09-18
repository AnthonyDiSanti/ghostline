#!/bin/sh
set -eu
# Replace only Python execution in the transport test; decoding, temporary files and traps run normally.
test "$1" = -B
directory=$(dirname "$2")
printf '%s\n' "$directory"
cmp "$directory/verify.py" "$GHOSTLINE_TEST_VERIFIER"
cmp "$directory/network-probe.py" "$GHOSTLINE_TEST_NETWORK_PROBE"
exit "$GHOSTLINE_TEST_EXIT"
