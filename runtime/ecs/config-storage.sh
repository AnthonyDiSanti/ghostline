#!/bin/sh
set -eu
directory=/run/ghostline-config
case "${1:-}" in
  start)
    # A shared host tmpfs outlives initializer exit; engines bind only their private child directory.
    test "$(wc -l < /proc/swaps)" -eq 1
    install -d -m 0700 "$directory"
    mount -t tmpfs -o size=2m,nosuid,nodev,noexec,mode=0700,uid=65532,gid=65532 ghostline-config "$directory"
    install -d -o 65532 -g 65532 -m 0700 "$directory/xray"
    install -d -o 65532 -g 65532 -m 0750 "$directory/awg"
    ;;
  stop)
    # Docker/ECS stop first through unit ordering; unmounting releases the remaining RAM files.
    umount "$directory"
    rmdir "$directory"
    ;;
  *) exit 2 ;;
esac
