#!/bin/sh
set -eu
# Exercise the shared mount without putting synthetic configuration bytes in diagnostic output.
case "$1" in
  directories)
    mkdir -p /config/xray /config/awg
    chmod 0700 /config/xray
    chmod 0750 /config/awg
    ;;
  evidence)
    sha256sum /config/xray/server.json /config/awg/awg0.conf
    stat -c %u:%g:%a /config/xray /config/awg /config/xray/server.json /config/awg/awg0.conf
    ;;
  empty)
    test -z "$(find /config -type f -print)"
    ;;
  *) exit 2 ;;
esac
