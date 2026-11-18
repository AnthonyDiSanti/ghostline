#!/bin/sh
set -eu
# Stand in for each renderer and expose hashes only, proving it receives just its selected bundle.
test "${GHOSTLINE_XRAY_BUNDLE+x}" != x
test "${GHOSTLINE_AWG_BUNDLE+x}" != x
test "${xray_bundle+x}" != x
test "${awg_bundle+x}" != x
test "${GHOSTLINE_CONFIG+x}" != x
sha256sum
