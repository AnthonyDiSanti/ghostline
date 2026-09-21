#!/bin/sh
set -eu
# Stand in for each renderer and expose hashes only, proving it receives just its selected bundle.
test "${GHOSTLINE_XRAY_BUNDLE+x}" != x
test "${GHOSTLINE_AWG_BUNDLE+x}" != x
test "${xray_bundle+x}" != x
test "${awg_bundle+x}" != x
test -n "${GHOSTLINE_CONFIG:-}"
printf '%s' "$GHOSTLINE_CONFIG" | sha256sum
