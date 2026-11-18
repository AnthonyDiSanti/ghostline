#!/bin/sh
set -eu

# The fixture prepares only synthetic RAM children and reports counts/public metadata.
case "$1" in
  prepare)
    mkdir -p /config/xray /config/awg /config/derp
    chmod 700 /config/xray /config/derp
    chmod 750 /config/awg
    ;;
  empty)
    test "$(find /config -type f | wc -l)" -eq 0
    ;;
  evidence)
    test -s /config/xray/server.json
    test -s /config/awg/awg0.conf
    test -s /config/derp/derper.json
    test "$(stat -c %u:%g:%a /config/derp)" = 65532:65532:700
    test "$(stat -c %u:%g:%a /config/derp/derper.json)" = 65532:65532:400
    cat /config/derp/public.json
    ;;
  *) exit 2 ;;
esac
