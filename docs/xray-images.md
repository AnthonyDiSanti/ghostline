# Maintained Xray images

Assessed 2026-09-13 at Anthony's request. Anthony selected the official `ghcr.io/xtls/xray-core` image with digest-pinned publication to our existing ECR repository. The implementation below replaces the initial packaging recommendation; see [launch evidence](launch-stockholm-ecs.md) for deployment and acceptance status.

## Selected migration design — 2026-09-13

Anthony selected an unmodified XTLS image and a one-shot initializer that converts the existing ECS-injected Parameter Store bundle into a configuration file on an ECS task volume backed by the host's existing encrypted EBS disk. Xray reads that file through a protected read-only mount. This supersedes the earlier compiled-wrapper recommendation below.

Restore RAM-backed rendered configuration as a separate follow-up after the initial migration: task `01M2DA6YG0BA1GD47ZCMKBEWRX` in the [task list](../.context/tasks.md). Anthony accepts encrypted task storage for the cleaner initial integration; shared RAM storage is not an initial acceptance gate. Preserve Parameter Store as the durable source and verify initializer handoff, cleanup and unattended lifecycle when implementing the follow-up.

### How the RAM follow-up could work

One candidate is a host-owned `tmpfs` filesystem with the same configuration directory bind-mounted writable into the initializer and read-only into Xray. Both containers access the same RAM-backed files through ordinary filesystem calls. The host mount outlives the initializer; no process-memory copying or continuously running helper is required. This follows Linux [tmpfs semantics](https://docs.kernel.org/filesystems/tmpfs.html) and Docker [host bind mounts](https://docs.docker.com/engine/storage/bind-mounts/), but Ghostline has not implemented or validated this candidate.

Separate Docker `--tmpfs` mounts are container-local and cannot provide that handoff; their contents disappear when the owning container stops. Keep the backing filesystem's lifecycle independent of the initializer, and handle per-task separation, permissions and cleanup. RAM does not survive a host stop/reboot/rebuild: fetch the durable Parameter Store value and recreate the files on startup. Verify swap behavior before claiming the rendered files never reach disk. [Docker tmpfs limitations](https://docs.docker.com/engine/storage/tmpfs/). The initial encrypted task-volume design remains selected.

## Candidates and maintenance evidence

[Project X's installation documentation](https://xtls.github.io/en/document/install) explicitly identifies the official GHCR image and the third-party Teddysun image. Both have recent releases and Linux amd64/arm64 variants, verified against public registry metadata on the assessment date.

| Image | Maintenance evidence | Packaging and Ghostline fit |
| --- | --- | --- |
| `ghcr.io/xtls/xray-core` — official XTLS | Published `26.9.9`; our current `26.7.28` is also available. Both manifests include amd64 and arm64. The upstream repository owns the source and image build workflow | Distroless, shell-free, non-root. Best publisher alignment; requires adapting our shell-based secret loader and diagnostics |
| `teddysun/xray` — third party | Docker Hub reports `26.9.9` updated 2026-09-09 and `26.7.28` updated 2026-07-29, both with amd64 and arm64 | Alpine with shell tools, running as root by default. Closer to our existing wrapper, but introduces another binary/image publisher |

Sources: [official package](https://github.com/XTLS/Xray-core/pkgs/container/xray-core), [official build workflow](https://github.com/XTLS/Xray-core/blob/main/.github/workflows/docker.yml), [Teddysun tags](https://hub.docker.com/r/teddysun/xray/tags), [Teddysun Dockerfile](https://raw.githubusercontent.com/teddysun/across/master/docker/xray/Dockerfile).

Teddysun's published build script downloads the engine from the maintainer's `dl.lamp.sh`, rather than directly using the XTLS release artifact. Its Dockerfile starts from `alpine:latest`, includes shell utilities but not `jq`, and uses `/usr/bin/xray` with `/etc/xray/config.json`. A thin extension could retain much of our current startup script. This is a convenience/trust tradeoff, not evidence of a defective image. [Build script](https://raw.githubusercontent.com/teddysun/across/master/docker/xray/xray.sh).

The official amd64/arm64 Dockerfile compiles Xray from the repository and uses `gcr.io/distroless/static:nonroot` for the runtime. Published `26.7.28` amd64 image metadata confirms user `65532`, entrypoint `/usr/local/bin/xray`, and default arguments `-confdir /usr/local/etc/xray/`. [Versioned Dockerfile](https://github.com/XTLS/Xray-core/blob/v26.7.28/.github/docker/Dockerfile).

## Version and pinning

The migration retains **26.7.28**, matching the previously deployed engine version. This isolates image/configuration changes from a protocol-engine upgrade; it does not establish identical binary bytes between the old ZIP and official container. Live GHCR manifest inspection resolved:

| Official `26.7.28` artifact | SHA-256 digest |
| --- | --- |
| Multi-architecture index | `b697cda1588faca696ab7f7755dd1161f60862af3ff6026300e44cff6aedd558` |
| Linux amd64 | `d7911c19a283acdc57e171ae0e3bd49ab4c29db14e2ab9274aa97132dd3ca3b9` |
| Linux arm64 | `96e356574d4de2e4c6f9dea2ff79a9e4dc439558df73a38eefd8192553c9f367` |

The [GitHub releases API](https://api.github.com/repos/XTLS/Xray-core/releases?per_page=5) marks **26.9.9, 26.9.8 and our existing 26.7.28 as prereleases** at assessment time. Do not describe 26.7.28 as an upstream stable release or silently select the newest tag. Cached package/overview pages disagreed about `latest`; direct registry/API checks supplied the evidence above. Pin a selected digest and update deliberately. An actively maintained publisher does not automatically refresh our pinned ECR releases or guarantee a vulnerability-free image.

## Implemented ECS packaging

The former ECS recipe installed the checksum-verified official ZIP on Alpine 3.15, matching the [legacy Ubuntu recipe](../runtime/xray/Dockerfile). The ECS publisher now mirrors the official amd64 image without rebuilding it, verifies its image configuration/layer identity, and builds only the separate [configuration initializer](../runtime/ecs/xray-config.Dockerfile). Cape Town retains the legacy recipe. Moving off Alpine 3.15's regular-support window is a maintenance benefit independent of compute sizing. [Alpine release support](https://alpinelinux.org/releases/).

The configuration path is Parameter Store → ECS secret injection into `xray-config` → private task volume → unmodified Xray:

1. The [initializer](../runtime/ecs/xray-config-start.sh) uses pinned Alpine 3.24.1 and jq 1.8.2-r0. It decodes only `files["server.json"]`, validates JSON, preserves exact bytes, publishes atomically and reports redacted failures. It has no networking, a read-only root filesystem, only CHOWN capability and a 64 MiB limit.
2. A task-scoped Docker `local` volume resides on the existing encrypted EBS disk. The initializer writes it; Xray mounts it read-only at `/usr/local/etc/xray`. Directory/file ownership is `65532:65532`, with modes `0700`/`0400`. ECS cleans task storage during its cleanup lifecycle, not as a secure-erasure guarantee.
3. ECS requires the nonessential initializer to exit successfully before starting the essential engine. Xray retains its upstream entrypoint and receives explicit `run -config /usr/local/etc/xray/server.json` arguments. Bundled fragments are not merged into our configuration. Xray receives no secret environment variable or task role.
4. [Server verification](../runtime/ecs/verify.py) hashes configuration through the running process's filesystem and uses host Python in that exact network namespace for TLS-verified public egress and metadata isolation. Host DNS resolves the probe address; this diagnostic alone does not test container DNS. [Disposable clients](../infra/lib/ecs-client-test.ts) use the initializer to preserve private host-file permissions while providing non-root configuration access.
5. Two services/EIPs, existing protocol settings and all six credential identities remain the baseline. ARM image availability enables a later Graviton experiment; the publisher and client tests still select `linux/amd64`.

`npm run test:ecs-images` builds/mirrors local images and uses synthetic credentials to test handoff after initializer exit, exact bytes/ownership/read-only access, official configuration validation, non-root port 443 and rejection of malformed input. It requires Docker but no AWS credentials. The normal `npm test` gate remains offline. Actual deployed protocol/lifecycle/device evidence belongs in the launch record; image manifests and local tests alone do not establish connectivity or compute savings.

AL2023's host Python is 3.9: catch `socket.timeout` when checking blocked metadata access. It is a distinct class there, although newer Python aliases it to `TimeoutError`. An unexpected socket error must fail verification rather than count as isolation; the namespace-probe regression covers this distinction.
