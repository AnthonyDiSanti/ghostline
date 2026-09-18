#!/bin/bash
set -euo pipefail
umask 077
# Only the initializer receives secrets. Refuse accidental injection or an unsafe config handoff.
test "${GHOSTLINE_CONFIG+x}" != x
export GHOSTLINE_AWG_CONFIG=/etc/ghostline/awg/awg0.conf
test "$(stat -f -c %T "$GHOSTLINE_AWG_CONFIG")" = tmpfs
test "$(stat -c %u:%g:%a "$GHOSTLINE_AWG_CONFIG")" = 65532:65532:440
test -r "$GHOSTLINE_AWG_CONFIG"
test ! -w "$GHOSTLINE_AWG_CONFIG"
exec /usr/local/bin/ghostline-awg
