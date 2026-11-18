# ECS gateway runtime

The regional architecture is one official ECS-3 Bottlerocket ARM64 host, one shared gateway task, one restricted ECS DAEMON task and a separate finite native bootstrap image. DERP-enabled gateways have five application containers. [Architecture](architecture.md) owns resource/billing boundaries; launch records/handoff own observed identities and validation; [development](development.md) owns commands.

## Task and images

`EcsEndpointStack` creates a `t4g.small`, encrypted 2 GiB OS and 30 GiB data disks, public subnet, one ENI, two retained EIPs and one gateway task. The separate `RegionalReleaseStack` owns seven component repositories, the release-document repository and regional release handling. [Release workflow](releases.md) owns aliases, readiness, native rollback and history; [images](images.md) owns provenance.

The task contains essential Xray/AWG engines, private CoreDNS, optional essential DERP/STUN and a nonessential initializer. The new credential-delivery recipe gives the task exact server-parameter read authority. The initializer receives only public parameter ARNs, obtains ECS task credentials and retrieves/decrypts the values with the pinned official SDK directly into RAM. It validates a stable complete set with two reads, disables core dumps and supplies each renderer through a private stdin pipe. Plaintext never enters container-creation environment or arguments. UID/GID 65532, no capabilities, read-only root and the 64 MiB limit remain. Engines require its [SUCCESS](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html). Native trial evidence and deployment status belong in the handoff/launch records; source implementation alone does not remove existing disk copies.

Maintained gateways require CoreDNS. The initializer and Xray/AWG wait for its real upstream resolution health. It has no secret inputs or engine mounts; guarded DNS interception admits only verified CoreDNS DoT egress while engines remain pending. DoT uses the primary private address mapped to the AWG EIP; it does not traverse AWG. Activation requires the exact configured whole image set. [DNS design](dns.md).

ECS task IAM is shared by all containers, including CoreDNS and the engines. Its opaque credential locator is not a server secret; it must remain unreachable from their namespaces. The daemon correlates the running initializer to its kernel port binding, grants only leased credential-service access plus private DNS/public TLS, and withdraws it on exit or lease expiry. Port 18082 is a non-listening identity binding, dropped at external ingress and absent from security-group admission. Host/execution roles retain no application parameter reads. This network boundary does not provide independent IAM isolation against a compromised host, kernel or sufficiently privileged container. [Secret threat boundary](secrets.md#ecs-delivery-and-threat-boundary).

DERP runs as UID/GID 65532, drops all capabilities, has a read-only root/private RAM mount and a 128 MiB hard limit. It shares the existing AWG EIP: source/address-aware forwarding dispatches TCP 443 to container 8443 through the unique host 18443 binding, and UDP 3478 to bundled STUN. New outbound initiation, the internal host port and wrong-address/source paths stay blocked. [DERP configuration, identity and evidence](derp-poc.md).

Xray uses the unmodified official image, UID/GID 65532, `NET_BIND_SERVICE`, and the explicit `/usr/local/etc/xray/server.json` config. AWG uses Ghostline's official-source build, UID 0/GID 65532, `NET_ADMIN` and `/dev/net/tun`; its startup script sets up its own namespace and daemon. Engines drop other capabilities and have read-only roots and no injected secret environment.

Meaningful releases use native ECS blue-green across a temporary second host (`minimumHealthyPercent=100`, `maximumPercent=200`), followed by direct EIP handoff and source retirement. Existing sessions may reconnect during handoff. Ordinary service recovery on the single serving host is distinct from this release path and can briefly interrupt both protocols when ECS replaces the shared task.

## RAM configuration

An essential finite Bottlerocket bootstrap mounts a single **2 MiB tmpfs `/mnt/ghostline/config`** before ECS workloads start. It runs on every boot; stopping a task does not unmount it. Host shutdown releases RAM. It uses `nosuid,nodev,noexec`; startup and verification reject host swap. The initializer mounts the parent read-write and each engine mounts only its own child read-only.

| Engine | Host child → engine path | Directory / file modes |
| --- | --- | --- |
| Xray | `xray` → `/usr/local/etc/xray` | `0700` / `0400` |
| AWG | `awg` → `/etc/ghostline/awg` | `0750` / `0440` |
| DERP | `derp` → `/etc/ghostline/derp` | `0700` / `0400` |

All files/directories are owned by 65532:65532; parent mode is 0700. AWG reads through its group without extra DAC capabilities. Sockets/scratch use separate `/run` and `/tmp` tmpfs mounts. Partial initialization clears every configured protocol while preserving child inodes for Docker bind mounts. Detailed AWG option validation remains in the engine.

The initializer runs once for **every new task**, even if its image is unchanged. It reconstructs files from parameters rather than trusting leftover files. Ordinary engine restarts reuse them. Stopping a task while leaving its host running may leave protected configuration in RAM until the next initialization or shutdown. Host stop/reboot/rebuild loses RAM and requires fresh initialization. Publishing an image or updating a parameter alone does not refresh a running task. [ECS secret refresh](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html).

RAM reduces rendered-file disk persistence; it does not hide operational keys from their engine. Privileged Docker/ECS environment metadata may retain injected values on encrypted EBS. See [secret boundaries](secrets.md).

## Engine recovery

DERP uses the same 60-second native restart eligibility as Xray/AWG. Its bounded local health checks pinned TLS/certificate validity and a real STUN response; three failed checks make the essential container unhealthy. Its connection tables and sockets do not migrate across host replacement. Production serving suppresses upstream client/address output while exit/health remain observable; the existing quiet Xray/AWG/CoreDNS behavior is preserved.

Both engines use [native restart policies](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-restart-policy.html), `restartAttemptPeriod=60`, with no ignored exit codes. This is a minimum runtime/restart-frequency condition, not a post-crash delay. An eligible exit restarts only that engine, preserving the task, initializer and sibling. An early/ineligible essential exit replaces the whole task and reruns initialization. The initializer has no restart policy.

The essential CoreDNS container has the same 60-second restart policy. If it exits after an eligible run, ECS can restart only CoreDNS; otherwise its essential failure can stop the shared task and the service replaces that task. Xray and AWG require CoreDNS to report `HEALTHY` before they start; the dependency is checked only at task startup. Its 30-second health check first requires local UDP and TCP `.onion` NXDOMAIN answers, then a public A answer for `example.com` or `google.com` through the normal authenticated upstream DoT path. Each public attempt is bounded at six seconds. After startup, Docker starts each normal check 30 seconds after the previous check completes, so checks do not overlap; the 20-second timeout aborts a stalled check. Three failed checks make the essential container/task unhealthy and the ECS service can replace the task. This detects sustained failure across both configured providers, but also means a prolonged upstream outage can recycle both VPN engines without repairing the external fault. The check proves gateway DNS resolution, not the client tunnel's DNS interception. [ECS container health](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html), [service replacement](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html).

The restricted network daemon tracks validated ECS task/container identity and kernel bridge bindings. It quarantines changed peers, updates their NAT and removes only their stale connection tuples; healthy sibling flows stay enabled. Ambiguous discovery or reconciliation errors fail closed. Five-second kernel IP-set leases also close forwarding if the daemon stalls; ECS replaces an unhealthy daemon. A host failure or shared-budget exhaustion can affect both engines. No health probe currently detects a live but broken tunnel.

## Normal-mode logging policy

The initializer owns the explicit Xray silence policy, applied only to RAM-rendered logging/REALITY diagnostic fields; stored identities and protocol settings stay intact. CoreDNS omits query and per-question error plugins, AWG runs at its supported silent level, and wrappers/network tools report fixed failures without captured peer/configuration details. Health/exit status remains active. Docker metadata and host journals are still persistent, and initializer secret injection still leaves disk metadata. See the [audit and live/source boundary](logging-privacy-audit.md#follow-up-confirmed-records-and-prepared-fixes); the November 17 release is live in all four active regions, while persistent metadata and independent telemetry prevent a RAM-only guarantee.

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

September 28 follow-up: Anthony intends classic WireGuard as the next protocol. A separate EIP on public UDP 443 is feasible without changing the shared bridge task. Proposed extension: assign each UDP engine a distinct ECS host port, discover its container through the validated name/transport/host-port binding, then have the existing network daemon install destination-private-IP/443 DNAT directly to that engine's discovered container address/port before Docker's generic mapping. Keep the internal published host ports externally blocked and SNAT each engine to its own EIP-associated private address. This is a design proposal, not deployed behavior; qualify connection tracking/replies, wrong-IP/port rejection, identity churn and forwarding-lease expiry. ECS [PortMapping](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html) permits different host/container ports but does not expose Docker's address-specific HostIp binding. Additional addresses remain subject to ENI/EIP limits; no extra NIC is inherently required for this third protocol.

## Host and task lifecycle

The platform image provides storage/capacity checks in finite bootstrap and ongoing routing in a separate restricted daemon. It never fetches application secrets. The daemon has only NET_ADMIN/NET_RAW, no host mounts/PID/devices/task IAM, read-only root, seccomp, no-new-privileges and enforcing ordinary SELinux. Bootstrap uses the privileges necessary to initialize native host RAM. See [platform lifecycle and permissions](platform.md). Use a retained-IP cold rebuild for a selected OS/platform image change. IAM dependencies keep agent authority through host termination and execution permissions through service deletion.

`stop` scales the gateway to zero, waits for task termination, drains the host and waits for the daemon to stop before stopping EC2. `start` waits for host health/registration, reactivates placement, waits for a healthy daemon and restores one gateway task. `park` removes the endpoint except retained addresses; `destroy` additionally releases its owned allocations. Images/parameters survive. [Lifecycle commands](deployment-lifecycle.md).

`verify` temporarily enables the maintained diagnostic host container, performs redacted SSM checks, then disables it and verifies administrative lockdown before waiting for GuardDuty. Checks cover hashes, native ARM64, private read-only RAM, absent engine secret/AWS environment, no swap, cgroups, EIP egress and blocked metadata. `test` runs real disposable encrypted clients without changing laptop routes. Neither establishes native client import, DNS/IPv6 leak prevention, sleep stability or representative performance.

## IPv6 feasibility — September 28, 2026

Anthony selects egress-only scope and defers implementation until official Bottlerocket Docker bridge IPv6 configuration support is available. The proposal is tracked in [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954); see the [upstream review](../.context/knowledge/bottlerocket-ipv6-upstream.md) for scope and evidence. He explicitly declines stable IPv6 retention: keep current park deletion of the VPC/subnet/ENI and accept new IPv6 egress addresses on unpark. Clients keep the existing IPv4 EIPs. AWS warns that [a released Amazon-provided IPv6 CIDR is not guaranteed on reassociation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html); this is acceptable for the selected scope.

Both existing engines can support IPv6: Xray can reach IPv6 destinations ([upstream routing guide](https://xtls.github.io/en/document/level-2/redirect.html)), and AmneziaWG's [receive implementation](https://github.com/amnezia-vpn/amneziawg-go/blob/master/device/receive.go) handles IPv6 inner packets and IPv4/IPv6 transport. An IPv4 outer connection to the current EIPs can carry IPv6 destination traffic; native IPv6 on the owner's ISP is not required for that capability. This is engine feasibility, not validation of our existing profiles or deployed runtime.

Current `ecs-stack.ts` provisions IPv4-only VPC/subnet/ENI routes and security rules. `network.py` plus the bootstrap/daemon guard use IPv4 iptables/ipsets and IPv4 container discovery. Enabling IPv6 requires a complete parallel forwarding/isolation path, including initial quarantine, expiring leases, metadata/host/peer restrictions and protocol-specific egress; do not merely enable client IPv6. AWS documents [VPC/subnet/address/route changes](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-migrate-ipv6-add.html) and [Docker bridge IPv6 configuration](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-networkmode-bridge.html). The exact supported Bottlerocket bridge configuration still needs an isolated design/qualification exercise; the generic Docker daemon.json instructions are not a Bottlerocket implementation.

Xray additionally needs appropriate destination resolution/client capture settings; AWG needs IPv6 tunnel addressing, peer AllowedIPs/client default routes and a designed return/egress path. Egress-first is a proposed sequencing choice, not a restriction: both engines can use IPv6 outer transport too. The current home-network tests found no working native IPv6, so that transport cannot yet be compared there. Keep IPv4 fallback; dual-stack transport needs client qualification and an explicit address-lifecycle design because [AWS EIPs are IPv4-only](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html), while park removes the VPC/ENI. IPv6 does not inherently improve VPN encryption, stealth or throughput; compare actual routes before claiming a performance benefit. A future trial could qualify Xray first, then AWG, but no implementation or priority change is selected. Until then the product keeps its IPv4 tunnel/client IPv6-blocking policy. IPv6-only destination reachability through an IPv4 tunnel and leak prevention on a natively IPv6-capable access network are distinct tests.

### Networking mode decision — retain bridge

Anthony rejects awsvpc for this product. Keep per-engine network namespaces/public identities, a narrowly networked initializer, one shared task memory budget and one coordinated deployment unit. IPv6 must fit these boundaries; no generated-config workaround is approved. The next feasibility step is the Bottlerocket bridge configuration lifecycle, not splitting the application into services. Additional same-transport port-443 engines remain a separate mapping design concern as noted above.

The [core-kit 17.0.0 Docker template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/docker-engine-29/daemon-json), selected by Bottlerocket 1.66.0, does not expose IPv6 bridge settings. Correction to the earlier bootstrap-trial suggestion: [Bottlerocket bootstrap guidance](https://bottlerocket.dev/en/os/1.57.x/concepts/bootstrap-containers/) explicitly advises against changing critical `/etc` configuration, and [maintainer discussion #1957](https://github.com/bottlerocket-os/bottlerocket/discussions/1957) explains its SELinux protection. This is the documented platform boundary, not a new live denial test on 1.66. Do not bypass labels/protections or treat generated-file editing as a supported solution.

Remaining options are upstream typed settings/template support followed by an official release (recommended), a custom Bottlerocket build implementing that support (requires separate OS build/update ownership; not selected), or custom per-container IPv6 networking/encapsulation outside Docker IPAM (unqualified and substantially more networking/lifecycle machinery). Host-side IPv6 routes alone do not configure engine namespaces. Docker custom networks are not a native ECS bridge-task selector; out-of-band network attachment would add orchestration and control authority. No option is implemented. Defer IPv6 if none fits the existing security/lifecycle constraints; classic WireGuard's IPv4 integration is independent.

ECS [`awsvpc`](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html) offers a native dual-stack task ENI and per-task security groups, avoiding default-bridge IPv6 configuration. This is not another host or Fargate migration. EC2 tasks receive no automatic public IPv4 address; their ECS-managed ENIs are not operator-owned EIP anchors. Preserve both public ingress and protocol-specific IPv4 egress requirements when comparing managed load-balancer/NAT designs with custom host forwarding. An ingress load balancer alone does not determine outbound browsing identity. Do not assume the existing bridge daemon/quarantine covers task ENI traffic.

One shared task retains initializer dependencies and the shared memory cap but shares its network namespace: AWG NET_ADMIN would affect Xray networking. Distinct filesystem mounts/secrets remain possible. ECS also disallows per-container `disableNetworking` and `dnsServers` in this mode ([task parameter reference](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html)). Splitting protocols into separate tasks restores network separation and allows distinct security groups/ports, but requires per-task initialization, revised memory limits and multi-service release coordination. These tradeoffs explain the rejection; they are not an alternative implementation roadmap.
