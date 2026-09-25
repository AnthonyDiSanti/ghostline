#!/usr/bin/env bash
set -euo pipefail

# This finite probe tests the systemd/Image boundary before the real host bootstrap is ported.
[[ ${GHOSTLINE_BOOTSTRAP_IMAGE:-} =~ ^[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}$ ]] || exit 2
[[ $(findmnt -n -o FSTYPE --mountpoint /mnt/ghostline/config) == tmpfs ]]
[[ $(stat -c '%u:%g:%a' /mnt/ghostline/config) == '65532:65532:700' ]]
docker pull "$GHOSTLINE_BOOTSTRAP_IMAGE"
docker run --rm --pull=never --network=none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --mount type=bind,src=/mnt/ghostline/config,dst=/config,readonly \
  --entrypoint /bin/sh "$GHOSTLINE_BOOTSTRAP_IMAGE" -c 'test -d /config && test -r /proc/sys/kernel/random/boot_id'
install -d -m 0700 /run/ghostline
cat /proc/sys/kernel/random/boot_id > /run/ghostline/bootstrap-boot-id
