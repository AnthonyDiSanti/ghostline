#!/bin/sh
set -eu

require_ram() {
    # A failed prerequisite must stop before either daemon can create disk records.
    for path in "$@"; do
        awk -v path="$path" '$2 == path && $3 == "tmpfs" && $4 ~ /(^|,)noswap(,|$)/ { found = 1 } END { exit !found }' /proc/mounts || {
            printf '%s\n' 'RAM_PREREQUISITE_FAILED' >&2
            exit 42
        }
    done
}

start_docker() {
    # Use an external containerd so its durable root is independently tested.
    dockerd --containerd=/run/stage1/containerd.sock \
        --data-root=/state/docker --exec-root=/run/stage1/docker \
        --pidfile=/run/stage1/docker.pid --host=unix:///run/stage1/docker.sock \
        --storage-driver=overlayfs --iptables=false --ip6tables=false \
        --bridge=none --ip-masq=false --live-restore=true --log-level=error \
        >/run/stage1/docker.log 2>&1 &
}

case "${1:-}" in
    pause|resume)
        # Quiesce daemon-owned databases for a consistent byte scan, leaving PID 1 responsive.
        signal=STOP
        [ "$1" = pause ] || signal=CONT
        kill -"$signal" "$(cat /run/stage1/docker.pid)" "$(cat /run/stage1/containerd.pid)"
        ;;
    restart-docker)
        # Preserve containerd and the mounted stores during a Docker-only restart.
        kill -TERM "$(cat /run/stage1/docker.pid)"
        for _ in $(seq 1 100); do
            [ ! -f /run/stage1/docker.pid ] && break
            sleep 0.1
        done
        [ ! -f /run/stage1/docker.pid ] || exit 43
        start_docker
        ;;
    run)
        # Docker's --tmpfs parser rejects noswap; mount explicitly before runtime startup.
        mkdir -p /run/stage1 /state/docker /state/containerd
        mount -t tmpfs -o rw,nosuid,nodev,noswap,size=64m tmpfs /run/stage1
        mkdir -m 0700 /run/stage1/config
        mount -t tmpfs -o rw,nosuid,nodev,noexec,noswap,size=2m,mode=0700 tmpfs /run/stage1/config
        require_ram /run/stage1/config
        if [ "${3:-}" != 'missing-ram' ]; then
            case "${2:-}" in
                docker-ram|all-ram) mount -t tmpfs -o rw,nosuid,nodev,noswap,size=256m tmpfs /state/docker ;;
            esac
            if [ "${2:-}" = 'all-ram' ]; then
                mount -t tmpfs -o rw,nosuid,nodev,noswap,size=256m tmpfs /state/containerd
            fi
        fi
        case "${2:-}" in
            control) require_ram /run/stage1 ;;
            docker-ram) require_ram /run/stage1 /state/docker ;;
            all-ram) require_ram /run/stage1 /state/docker /state/containerd ;;
            *) exit 44 ;;
        esac
        mkdir -p /state/docker /state/containerd /run/stage1/containerd
        # Configuration and diagnostics are volatile, including startup failures.
        cat >/run/stage1/containerd.toml <<'EOF'
version = 3
root = "/state/containerd"
state = "/run/stage1/containerd"
[grpc]
  address = "/run/stage1/containerd.sock"
EOF
        containerd --config /run/stage1/containerd.toml --log-level error >/run/stage1/containerd.log 2>&1 &
        containerd_pid=$!
        printf '%s\n' "$containerd_pid" >/run/stage1/containerd.pid
        trap 'kill -TERM "$containerd_pid" 2>/dev/null || true; [ ! -f /run/stage1/docker.pid ] || kill -TERM "$(cat /run/stage1/docker.pid)" 2>/dev/null || true; wait || true; exit 0' TERM INT
        for _ in $(seq 1 100); do
            [ -S /run/stage1/containerd.sock ] && break
            sleep 0.1
        done
        [ -S /run/stage1/containerd.sock ] || exit 45
        start_docker
        while kill -0 "$containerd_pid" 2>/dev/null; do sleep 1 & wait $! || true; done
        exit 46
        ;;
    *) exit 44 ;;
esac
