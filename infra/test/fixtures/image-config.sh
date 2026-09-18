#!/bin/sh
set -eu
# Inspect only permissions and hashes; never print the rendered test credentials.
case "$1" in
  empty)
    test -z "$(ls -A /config)"
    ;;
  evidence)
    test "$(stat -f -c %T /config)" = tmpfs
    sha256sum "/config/$2"
    stat -c '%u:%g:%a' /config "/config/$2"
    test ! -w "/config/$2"
    # File modes alone are insufficient: even the writer UID cannot create files through this mount.
    if touch /config/.write-probe 2>/dev/null; then rm /config/.write-probe; exit 1; fi
    ;;
  *) exit 2 ;;
esac
