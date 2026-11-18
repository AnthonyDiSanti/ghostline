# Option A stage 1: local runtime persistence proof

Observed November 17, 2026 local time (November 18, 00:41 UTC). **The local storage mechanism passes; production Option A is not yet implemented or natively qualified.** [Count-only receipt and exact fixture hashes](local-ram-runtime.json), [credential plan](credential-delivery-plan.md).

## Experiment and findings

The standalone [driver](../../../infra/test/fixtures/ram-runtime.py) runs pinned official ARM64 Docker 29.7.0 and BusyBox 1.37.0 inside local Docker Desktop 29.9.2. Each case gets a unique owned container and backing volume, no network/ports, no host paths or Docker socket. The outer container is privileged solely to run the nested runtime and create Linux mounts. No AWS APIs, credentials or production images are used. Its cgroup has a 768 MiB memory cap and zero swap allowance; RAM mounts explicitly require `noswap`.

The [launcher](../../../infra/test/fixtures/ram-runtime-daemons.sh) prepares storage before starting separate Docker and containerd daemons. Each RAM runtime root has a 256 MiB cap; runtime sockets/logs use a 64 MiB RAM mount and application configuration a separate 2 MiB RAM mount. The initializer receives a random synthetic environment value, writes configuration into RAM and exits successfully. A second initializer exits with a fixed failure code/message. A reader receives no secret environment and mounts configuration read-only. A separate live metadata control keeps a synthetic environment in containerd: deleted records' database pages may otherwise be reused, making detection after initializer exit nondeterministic.

| Storage case | Docker config files with marker after shutdown | containerd database files with marker after shutdown | Marker files in outer filesystem |
| --- | ---: | ---: | ---: |
| Both runtime roots on disk: positive control | 3 | 1 | 0 |
| Docker root in RAM; containerd root on disk | 0 | 1 | 0 |
| Both runtime roots in RAM | 0 | 0 | 0 |

**Moving only Docker's root is insufficient in this tested layout.** The separate containerd `meta.db` retains the synthetic value. The count includes file bytes, not only currently live logical database records. This is a local Docker/containerd result; identify and test the native versions and stores before mapping it to Bottlerocket.

All cases preserve configuration across a Docker-only daemon restart. After outer-container stop/start simulates RAM loss, the both-RAM case has no stale inner container records; reloading its image and recreating initializer/reader succeeds. Missing required RAM mounts exits with code 42 before any runtime file is created. Failed-initializer output is exactly the fixed message. Searches cover literal, base64 and hex variants, quiesced runtime roots, stopped backing volumes and the outer exported filesystem. Scans fail on unreadable/incomplete data; the read-only helper needs `DAC_READ_SEARCH` for overlayfs mode-000 work directories. All owned containers, named volumes and outer anonymous volumes are removed; label-based absence readback passes.

The both-RAM case uses about 8.2 MiB of Docker storage and 6.0 MiB of containerd storage; the outer cgroup peaks at about 126 MiB. These are **tiny BusyBox fixture measurements**, including page cache, not the six/seven-image application's cold-pull memory budget or a sizing recommendation for t4g.small.

## Reproduce

From `infra/`, pull the exact `DIND` and `WORKLOAD` references declared in the driver, then run:

```sh
npm run test:ram-runtime -- --output /absolute/path/to/count-only.json
```

It requires a local Unix-socket ARM64 Linux Docker engine with privileged nesting and kernel `noswap` support. It never falls back to a remote endpoint, disk storage or a different image/version. Output contains fixed progress messages and a count-only receipt, not marker values or captured daemon errors. It is an explicit integration gate rather than part of ordinary offline `npm test`.

Two useful setup findings: Docker's `--tmpfs` parser rejects `noswap`, so the fixture uses explicit Linux `mount` and verifies `/proc/mounts` before startup. The official Docker 29.9.2 image deliberately omits standalone containerd in favor of an embedded implementation; 29.7.0 supplies the separate binary needed by this experiment. See [official packaging](https://github.com/docker-library/docker/blob/master/29/dind/Dockerfile) and [Moby's embedded-containerd change](https://github.com/moby/moby/pull/53388). These are test-fixture choices, not changes to production runtime versions. Docker's [data-root documentation](https://docs.docker.com/engine/daemon/#daemon-data-directory) also distinguishes separately configured containerd storage.

## Next native gates after rebasing

Git Spice records `main` → `feature/tailscale` → `feature/zero-logs`. Both heads were `c837f15` during the initial tracking reversal, so no source rewrite was necessary then. After Tailscale's commit reached main, zero-logs was restacked onto `712e610`; the seven-image runtime and native proof are preserved, alongside this local fixture and count-only receipt. The original dirty tree/index were snapshotted before reconciliation. Selected Tailscale work may merge through this branch before its remainder, as Anthony accepts. Native implementation must now include DERP's third injected server bundle and complete image memory budget.

Then use the chosen maintained region's `trial` workflow, or a disposable deployment if a particular test needs it. A trial is intended for these experiments; it is not restricted to a production canary or required to use a separate region. Capture exact integrated artifacts and inspect lifecycle/publication ownership so other regions do not change.

The remaining proof is supported native bootstrap/mount propagation/SELinux, actual Docker/containerd/ECS stores and checkpoints, temporary IAM credentials/caches, journals/dumps, cold pulls and full-image memory pressure/OOM/ENOSPC, real secret injection, task/runtime restart, EC2 reboot/stop-start and common blue-green recovery. This experiment contains no ECS agent and does not qualify those boundaries. It also does not scan the Docker Desktop VM disk, host journals, swap backing, freed filesystem blocks, snapshots or provider copies, and makes no secure RAM-erasure claim. Preserve current identities, Parameter Store, shared controls and the accepted runtime-fetch fallback.
