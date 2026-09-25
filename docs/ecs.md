# ECS gateway runtime

The regional architecture is one official ECS-3 Bottlerocket ARM64 host, one application service/task with three images, and one restricted ECS DAEMON task and a separate finite native bootstrap image. [Architecture](architecture.md) owns resource/billing boundaries; [Stockholm evidence](launch-stockholm-ecs.md) owns live identities and validation; [development](development.md) owns command syntax.

## Task and images

`EcsEndpointStack` creates a `t4g.small`, encrypted 2 GiB OS and 30 GiB data disks, public subnet, one ENI, two retained EIPs and one gateway task. The separate `RegionalReleaseStack` owns the five component repositories and release-document repository and regional release handling. [Release workflow](releases.md) owns static production aliases, digest readiness, native rollback and history. [Images](images.md) owns provenance and update policy.

The task contains essential `xray` and `awg` engines and a nonessential `gateway-config` initializer. ECS injects exactly the two server parameters into the initializer using the execution role. There is no application task role. The initializer is network-disabled, runs as UID/GID 65532, drops all capabilities, has a read-only root and a 64 MiB limit. Both engines depend on its [SUCCESS](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html). It removes the original bundle environment variables before spawning helpers, holds them temporarily in unexported shell variables, and passes only the selected bundle to each renderer. This reduces child-process inheritance; it does not erase ECS/Docker metadata or isolate the two secrets from the initializer itself.

Xray uses the unmodified official image, UID/GID 65532, `NET_BIND_SERVICE`, and the explicit `/usr/local/etc/xray/server.json` config. AWG uses Ghostline's official-source build, UID 0/GID 65532, `NET_ADMIN` and `/dev/net/tun`; its startup script sets up its own namespace and daemon. Engines drop other capabilities and have read-only roots and no injected secret environment.

Fixed ports require stop-first task deployments: `minimumHealthyPercent=0`, `maximumPercent=100`. Releasing a new task can briefly interrupt both protocols; no extra host or surge task exists.

## RAM configuration

An essential finite Bottlerocket bootstrap mounts a single **2 MiB tmpfs `/mnt/ghostline/config`** before ECS workloads start. It runs on every boot; stopping a task does not unmount it. Host shutdown releases RAM. It uses `nosuid,nodev,noexec`; startup and verification reject host swap. The initializer mounts the parent read-write and each engine mounts only its own child read-only.

| Engine | Host child → engine path | Directory / file modes |
| --- | --- | --- |
| Xray | `xray` → `/usr/local/etc/xray` | `0700` / `0400` |
| AWG | `awg` → `/etc/ghostline/awg` | `0750` / `0440` |

All files/directories are owned by 65532:65532; parent mode is 0700. AWG reads through its configured group without extra DAC capabilities. Runtime sockets/scratch use separate writable `/run` and `/tmp` tmpfs mounts. The wrapper removes both renderings on partial failure and preserves child directory inodes for Docker's bind mounts. Detailed AWG option validation remains in the engine.

The initializer runs once for **every new task**, even if its image is unchanged. It reconstructs files from parameters rather than trusting leftover files. Ordinary engine restarts reuse them. Stopping a task while leaving its host running may leave protected configuration in RAM until the next initialization or shutdown. Host stop/reboot/rebuild loses RAM and requires fresh initialization. Publishing an image or updating a parameter alone does not refresh a running task. [ECS secret refresh](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html).

RAM reduces rendered-file disk persistence; it does not hide operational keys from their engine. Privileged Docker/ECS environment metadata may retain injected values on encrypted EBS. See [secret boundaries](secrets.md).

## Engine recovery

Both engines use [native restart policies](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-restart-policy.html), `restartAttemptPeriod=60`, with no ignored exit codes. This is a minimum runtime/restart-frequency condition, not a post-crash delay. An eligible exit restarts only that engine, preserving the task, initializer and sibling. An early/ineligible essential exit replaces the whole task and reruns initialization. The initializer has no restart policy.

The restricted network daemon tracks validated ECS task/container identity and kernel bridge bindings. It quarantines changed peers, updates their NAT and removes only their stale connection tuples; healthy sibling flows stay enabled. Ambiguous discovery or reconciliation errors fail closed. Five-second kernel IP-set leases also close forwarding if the daemon stalls; ECS replaces an unhealthy daemon. A host failure or shared-budget exhaustion can affect both engines. No health probe currently detects a live but broken tunnel.

## Shared memory budget

For advertised instance memory `N` MiB:

```text
platformAllowance = 256
hostBaseline = ceil(max(512, N * 0.10))
taskBudget = floor(N - (platformAllowance + hostBaseline) * 1.20)
agentReserve = N - platformAllowance - taskBudget
```

`t4g.small`: `N=2048`, task **1126 MiB**, total platform reserve **666 MiB**: **64 MiB** for the daemon task and **602 MiB** withheld from ECS placement. Round down to whole MiB; no 64 MiB allocation quantum applies. The task budget includes the initializer and charged task storage. Neither engine has an individual hard memory ceiling or soft reservation. These limits do not physically preallocate RAM.

`ecs-memory.ts` provides explicit supported capacity facts; preflight cross-checks AWS. A boot-time check refuses to register a host whose visible memory cannot fit task plus reserve. Bottlerocket's ECS agent enforces the shared task cgroup; `settings.ecs.reserved-memory` withholds the remaining host capacity from placement, avoiding double-counting daemon or platform memory. Verification checks the actual common cgroup and absence of tighter engine limits/OOM events.

Each engine has 256 CPU shares and initialization has 16. Shares are relative scheduling weights, not dedicated cores. Shared budgeting permits either engine to use spare capacity; it does not prevent contention under genuine simultaneous load. Current light-load evidence supports operation, not optimal sizing or sustained CPU-credit/throughput claims.

## Bridge networking

| Engine | Private address | Public identity | Listener |
| --- | --- | --- | --- |
| Xray | `10.79.0.11` | Xray EIP | TCP 443 |
| AWG | `10.79.0.10` | AWG EIP | UDP 443 |

ECS bridge mappings lack Docker `HostIp`, so the host filters listeners to their selected address and SNATs each engine to that identity. The read-only ECS introspection API supplies exact task/engine identity; validated kernel Docker bindings supply the missing bridge addresses. The daemon brackets discovery with identity snapshots and never mounts Docker's control socket. Unknown peers, sibling/host access and link-local metadata are blocked. DNS uses explicit public resolvers; subnet egress is excluded.

One public ENI carries both addresses. TCP and UDP 443 are distinct listeners; separate EIPs provide protocol address separation, not HA. A third UDP engine could not reserve a second host-wide UDP 443 mapping merely by adding another EIP. The poll-based reconciler is application-specific networking, not a hostile multi-tenant isolation boundary.

## Host and task lifecycle

The platform image provides storage/capacity checks in finite bootstrap and ongoing routing in a separate restricted daemon. It never fetches application secrets. The daemon has only NET_ADMIN/NET_RAW, no host mounts/PID/devices/task IAM, read-only root, seccomp, no-new-privileges and enforcing ordinary SELinux. Bootstrap uses the privileges necessary to initialize native host RAM. See [platform lifecycle and permissions](platform.md). Use a retained-IP cold rebuild for a selected OS/platform image change. IAM dependencies keep agent authority through host termination and execution permissions through service deletion.

`stop` scales the gateway to zero, waits for task termination, drains the host and waits for the daemon to stop before stopping EC2. `start` waits for host health/registration, reactivates placement, waits for a healthy daemon and restores one gateway task. `park` removes the endpoint except retained addresses; `destroy` additionally releases its owned allocations. Images/parameters survive. [Lifecycle commands](deployment-lifecycle.md).

`verify` temporarily enables the maintained diagnostic host container, performs redacted SSM checks, then disables it and verifies administrative lockdown before waiting for GuardDuty. Checks cover hashes, native ARM64, private read-only RAM, absent engine secret/AWS environment, no swap, cgroups, EIP egress and blocked metadata. `test` runs real disposable encrypted clients without changing laptop routes. Neither establishes native client import, DNS/IPv6 leak prevention, sleep stability or representative performance.
