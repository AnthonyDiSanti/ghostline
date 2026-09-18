# ECS gateway runtime

The regional architecture is one ECS-optimized AL2023 ARM64 host, one ECS service/task and three container images. [Architecture](architecture.md) owns resource/billing boundaries; [Stockholm evidence](launch-stockholm-ecs.md) owns live identities and validation; [development](development.md) owns command syntax.

## Task and images

`EcsEndpointStack` creates a `t4g.small`, encrypted 30 GiB gp3 disk, public subnet, one ENI, two retained EIPs and one gateway task. The separate `EcsImagesStack` retains `xray`, `awg` and `gateway-config` repositories. [Images](images.md) owns provenance and update policy.

The task contains essential `xray` and `awg` engines and a nonessential `gateway-config` initializer. ECS injects exactly the two server parameters into the initializer using the execution role. There is no application task role. The initializer is network-disabled, runs as UID/GID 65532, drops all capabilities, has a read-only root and a 64 MiB limit. Both engines depend on its [SUCCESS](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html).

Xray uses the unmodified official image, UID/GID 65532, `NET_BIND_SERVICE`, and the explicit `/usr/local/etc/xray/server.json` config. AWG uses Ghostline's official-source build, UID 0/GID 65532, `NET_ADMIN` and `/dev/net/tun`; its startup script sets up its own namespace and daemon. Engines drop other capabilities and have read-only roots and no injected secret environment.

Fixed ports require stop-first task deployments: `minimumHealthyPercent=0`, `maximumPercent=100`. Releasing a new task can briefly interrupt both protocols; no extra host or surge task exists.

## RAM configuration

Systemd mounts a single **2 MiB tmpfs `/run/ghostline-config`** before Docker/ECS and releases it after they stop. It uses `nosuid,nodev,noexec`; startup and verification reject host swap. The initializer mounts the parent read-write and each engine mounts only its own child read-only.

| Engine | Host child → engine path | Directory / file modes |
| --- | --- | --- |
| Xray | `xray` → `/usr/local/etc/xray` | `0700` / `0400` |
| AWG | `awg` → `/etc/ghostline/awg` | `0750` / `0440` |

All files/directories are owned by 65532:65532; parent mode is 0700. AWG reads through its configured group without extra DAC capabilities. Runtime sockets/scratch use separate writable `/run` and `/tmp` tmpfs mounts. The wrapper removes both renderings on partial failure and preserves child directory inodes for Docker's bind mounts. Detailed AWG option validation remains in the engine.

The initializer runs once for **every new task**, even if its image is unchanged. It reconstructs files from parameters rather than trusting leftover files. Ordinary engine restarts reuse them. Stopping a task while leaving its host running may leave protected configuration in RAM until the next initialization or shutdown. Host stop/reboot/rebuild loses RAM and requires fresh initialization. Publishing an image or updating a parameter alone does not refresh a running task. [ECS secret refresh](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html).

RAM reduces rendered-file disk persistence; it does not hide operational keys from their engine. Privileged Docker/ECS environment metadata may retain injected values on encrypted EBS. See [secret boundaries](secrets.md).

## Engine recovery

Both engines use [native restart policies](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-restart-policy.html), `restartAttemptPeriod=60`, with no ignored exit codes. This is a minimum runtime/restart-frequency condition, not a post-crash delay. An eligible exit restarts only that engine, preserving the task, initializer and sibling. An early/ineligible essential exit replaces the whole task and reruns initialization. The initializer has no restart policy.

The host reconciler tracks container ID, bridge IP and start generation. It quarantines changed peers, updates their NAT and removes only their stale connection tuples; healthy sibling flows stay enabled. Ambiguous discovery or reconciliation errors fail closed. A host failure or shared-budget exhaustion can affect both engines. No health probe currently detects a live but broken tunnel.

## Shared memory budget

For advertised instance memory `N` MiB:

```text
platformAllowance = 256
hostBaseline = ceil(max(512, N * 0.10))
taskBudget = floor(N - (platformAllowance + hostBaseline) * 1.20)
agentReserve = N - platformAllowance - taskBudget
```

`t4g.small`: `N=2048`, task **1126 MiB**, ECS reserve **666 MiB**. Round down to whole MiB; no 64 MiB allocation quantum applies. The task budget includes the initializer and charged task storage. Neither engine has an individual hard memory ceiling or soft reservation. These limits do not physically preallocate RAM.

`ecs-memory.ts` provides explicit supported capacity facts; preflight cross-checks AWS. A boot-time check refuses to register a host whose visible memory cannot fit task plus reserve. `ECS_ENABLE_TASK_CPU_MEM_LIMIT=true` enables the shared cgroup limit; `ECS_RESERVED_MEMORY` withholds host capacity from placement, avoiding double-counting platform loss. Verification checks the actual common cgroup and absence of tighter engine limits/OOM events.

Each engine has 256 CPU shares and initialization has 16. Shares are relative scheduling weights, not dedicated cores. Shared budgeting permits either engine to use spare capacity; it does not prevent contention under genuine simultaneous load. Current light-load evidence supports operation, not optimal sizing or sustained CPU-credit/throughput claims.

## Bridge networking

| Engine | Private address | Public identity | Listener |
| --- | --- | --- | --- |
| Xray | `10.79.0.11` | Xray EIP | TCP 443 |
| AWG | `10.79.0.10` | AWG EIP | UDP 443 |

ECS bridge mappings lack Docker `HostIp`, so the host filters listeners to their selected address and SNATs each engine to that identity. Exact gateway family and engine labels determine which containers can forward. Unknown peers, sibling/host access and link-local metadata are blocked. DNS uses explicit public resolvers; subnet egress is excluded.

One public ENI carries both addresses. TCP and UDP 443 are distinct listeners; separate EIPs provide protocol address separation, not HA. A third UDP engine could not reserve a second host-wide UDP 443 mapping merely by adding another EIP. The poll-based reconciler is application-specific networking, not a hostile multi-tenant isolation boundary.

## Host and task lifecycle

Host fixtures only provide storage, capacity checks and networking. They do not fetch application secrets. Cloud-init does not replay modified fixtures on reboot; use a retained-IP cold rebuild to change them. IAM dependencies keep agent authority through host termination and execution permissions through service deletion.

`stop` scales the gateway to zero, waits for actual task termination, then stops EC2. `start` waits for host health and restores one task. `park` removes the endpoint except retained addresses; `destroy` additionally releases its owned allocations. Images/parameters survive. [Lifecycle commands](deployment-lifecycle.md).

`verify` uses redacted SSM checks for hashes, native ARM64, private read-only RAM, absent engine secret/AWS environment, no swap, cgroups, EIP egress and blocked metadata. `test` runs real disposable encrypted clients without changing laptop routes. Neither establishes native client import, DNS/IPv6 leak prevention, sleep stability or representative performance.
