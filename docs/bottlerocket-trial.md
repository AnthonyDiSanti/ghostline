# Isolated Bottlerocket validation

September 21–22, 2026: isolated trial, using the official ECS-3 ARM64 AMI and the three unchanged, qualified application images. The restricted ECS network daemon passes cold deployment, protocol/security checks, fault recovery, reboot, stop/start and stopped-host reconstruction. One post-resume GuardDuty coverage check exceeded its ten-minute deadline, then passed after automatic recovery; see the evidence limitation below. Production promotion uses the same common recipe; see the regional launch records for current state. [Research](../.context/knowledge/host-os-evaluation.md) records the OS comparison and security tradeoffs.

## Scope and ownership

`GhostlineBottlerocketTrial` reuses `EcsEndpointStack` with explicit platform inputs for user data, storage paths and disks. It owns one temporary Stockholm t4g.small, a dedicated VPC/cluster and two disposable EIPs. The trial uses isolated identities and never modifies either production endpoint. It exercises the same platform and daemon builders as normal deployments.

Synthetic credentials live under `/ghostline/experiments/bottlerocket/server/{xray,awg}`. The experiment fixes existing app digests, does not join release subscriptions and never moves production aliases. `GhostlineBottlerocketPlatform` owns the separate immutable-tag support repository. Normal teardown releases the trial addresses, host, both encrypted disks, VPC, parameters and support repository; regional GuardDuty persists.

## Boot, application and network orchestration

Three separate lifecycle owners cooperate:

1. **Bottlerocket bootstrap:** the essential `mode=always` bootstrap container checks RAM/no swap, mounts a 2 MiB tmpfs through the supported shared mount area at `/mnt/ghostline/config`, and creates the private protocol directories. It installs only an empty expiring-lease guard before Docker/ECS can restore workloads. Native settings load bridge netfilter and enable bridge firewall processing. A bootstrap failure prevents normal boot/ECS registration.
2. **ECS application task:** the nonessential initializer receives server parameters, writes RAM-backed configurations, then exits. ECS starts the engines after SUCCESS. Engines retain read-only protocol-private mounts, ordinary SELinux confinement and no task IAM or injected secret environment. Engine restart reuses those files; task replacement reruns initialization; host reboot reconstructs RAM and application state.
3. **ECS network DAEMON:** one task on each eligible trial host owns secondary addressing, per-engine NAT/filtering, conntrack cleanup, discovery and repairs. The same implementation handles initial setup and later reconciliation. The daemon never mounts the RAM volume or reads application keys.

CloudFormation waits for initial daemon service creation before creating the gateway service; ECS normally gives daemon placement priority. Neither provides cross-task runtime readiness after crashes. Five-second kernel leases, renewed roughly once per second only after successful discovery/reconciliation, gate engine forwarding. Missing metadata, daemon death/stall or ambiguous identities withdraw/expire permission independently of ECS replacement. Daemon health can succeed with no engines, avoiding a startup dependency cycle.

The guard is first in `DOCKER-USER`, ahead of any accepting application rule. Docker preserves this chain while it can prepend its own FORWARD rules. The controller also keeps Ghostline's SNAT jump first, withdrawing leases before repairing order. A corrected rule order does not authorize forwarding until identities are reconciled again. [Bootstrap lifecycle](https://bottlerocket.dev/en/os/1.64.x/concepts/bootstrap-containers/), [ECS daemon scheduling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_service-options.html).

## Daemon authority and discovery

The daemon uses host networking with only `NET_ADMIN` and `NET_RAW`, a read-only root, private small `/run` and `/tmp` tmpfs mounts, no-new-privileges, default seccomp and ordinary `container_t` SELinux confinement. It has no host filesystem mounts, host PID namespace, devices, Docker/Bottlerocket management sockets, application parameters or task IAM role. UID 0 preserves the explicitly selected capabilities across networking subprocesses; it does not grant the old helper's filesystem/process authority.

Live qualification proved `NET_ADMIN` alone insufficient: the iptables IP-set matcher fails with `Can't open socket to ipset`. The same unreferenced rule/set probe succeeds with `NET_RAW` added. Creating an IP set and an unrelated iptables rule separately was an insufficient test; qualification now exercises the actual matcher through iptables-restore. No SELinux exception, privileged ECS container or extra capability is used.

Host network authority remains broad: a compromised daemon can alter routes/firewalls, inspect/inject traffic and potentially reach the host's IMDS credentials. Absent task IAM is not host-role isolation. Removing management sockets/files/PIDs still eliminates direct host administration and secret-file access paths. The host role has no Parameter Store reads.

Local read-only ECS introspection supplies exact task family, active task identity, engine Docker ID, published listener, start time and restart count. On the installed agent, bridge-mode `Networks` is absent. The daemon therefore joins these identities to Docker's kernel NAT destinations for TCP/443 and UDP/443, validates the actual bridge subnet and brackets the read with two matching ECS snapshots. This classifies the public listener, not the transport of decrypted client traffic. Unknown rule shapes, duplicate identities/destinations and inconsistent snapshots fail closed. ECS metadata files were rejected because the agent mounts them writable inside their engine containers. No Docker API access is needed. [Introspection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-agent-introspection.html).

## Storage, platform image and protections

One separate platform OCI image packages bootstrap, daemon and explicitly invoked diagnostics. CDK pins the same digest for bootstrap and the daemon task definition. It is outside the three-image application release schema. Platform changes currently require a cold trial rebuild to avoid bootstrap/runtime drift. Production selection/publication and retained repositories are defined in [platform workflow](platform.md). For a published candidate, set its exact owned platform-repository digest in the private trial selection before deployment.

The bootstrap uses native tmpfs labeling (`any_t:s0`) with enforcing SELinux. Attempting to relabel the filesystem to `data_t` was denied by the native bootstrap policy; no override was installed. Private mounts, ownership/modes and read-only engine access isolate protocol files, rather than separate SELinux categories. The default SSM control image needs an exact regional repository pull grant, as does the supported GuardDuty host agent. [Supported kernel settings](https://bottlerocket.dev/en/os/1.64.x/api/settings/kernel/), [native SELinux policy](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/352546d/packages/selinux-policy/rules.cil).

The original trial on this same official AMI verified Secure Boot, integrity lockdown, enforcing SELinux, read-only EROFS root and active engine seccomp/no-new-privileges. Swap and the admin container are disabled; IMDSv2/hop limit one and encrypted OS/data disks remain configured. No permissive SELinux override is used. Verified-root and compiler protections derive from the official AMI; a separate live dm-verity health attestation was not obtained. [AWS security guidance](https://github.com/bottlerocket-os/bottlerocket/blob/develop/SECURITY_GUIDANCE.md).

There is **no persistent superpowered Ghostline host container**. `ghostline-diagnostics` is disabled by default and temporarily enabled by bounded verification/fault operations, with disable in `finally`. It retains broad host authority while active; the default SSM control container remains intentional. Essential bootstrap failures can also prevent SSM startup: use safe console evidence and a corrected rebuild. The explicit private `diagnostic: true` recipe removes inbound VPN rules, sets gateway count zero and makes bootstrap nonessential for recovery investigation; it is never an accepted gateway and power commands refuse it.

Memory accounting moves 64 MiB of the existing 666 MiB platform allowance into the ECS daemon task: 602 MiB ECS reserved memory plus a 64 MiB daemon ceiling. The shared gateway task stays at 1,126 MiB. Private daemon tmpfs consumes memory within that limit. Light-load usage does not establish peak capacity or justify downsizing.

## Commands and verification

From `infra/`, with the project's Node 24 environment:

```sh
npm run trial:bottlerocket prepare
npm run trial:bottlerocket qualify
npm run trial:bottlerocket deploy
npm run trial:bottlerocket status
npm run trial:bottlerocket park
npm run trial:bottlerocket unpark
npm run trial:bottlerocket verify
npm run trial:bottlerocket test
npm run trial:bottlerocket exercise
npm run trial:bottlerocket reboot
npm run trial:bottlerocket stop
npm run trial:bottlerocket start
npm run trial:bottlerocket rebuild
npm run trial:bottlerocket destroy
```

`prepare` builds/publishes the support image and creates synthetic parameters without overwriting mismatches; repeat prepares retain the selected OS/app versions. `qualify` requires an existing trial host and compares the matcher with/without NET_RAW using temporary, unreferenced objects and deregistered tasks. A cold first deployment does not require that overlap check. `deploy` always diffs first. `rebuild` removes/recreates compute/networking/EIPs while retaining images and synthetic credentials; `destroy` removes both stacks and those parameters. `diagnose` displays only the secret-free network daemon's stopped-task logs, including during initial stack creation.

Retained-IP `park`/`unpark` passed on September 22: park left exactly the same two EIPs (plus CDK bookkeeping), repeated park was a no-op, and unpark created a new host with the same allocations and synthetic credentials. Runtime confinement, HEALTHY GuardDuty and both real encrypted clients passed. `rebuild` remains a deliberately disposable-IP test; it is distinct from parking. Evidence: `.local/bottlerocket/park-unpark.json`.

Stop scales down the gateway, waits for termination, drains the container instance and waits for its daemon before stopping EC2. Start waits for registration, reactivates the instance, requires one healthy daemon on that exact host, then resumes the gateway. Removal also handles empty drained/stopped registrations. Do not use gateway desired-count zero as proof the host has no running daemon.

`verify` checks secret hashes without exposing values, read-only RAM/modes, engine and daemon confinement, task memory, assigned egress, host/metadata/peer isolation and GuardDuty. `test` runs actual encrypted clients. `exercise` injects independent engine failures, missing introspection, reordered NAT, daemon stall/death and full gateway replacement. Reboot must change the kernel boot ID. Repeat verification/client checks after reboot, stop/start and clean reconstruction.

Before direct probes, inspect the native client and actual routes, disconnect if necessary under the existing authorization, then restore the prior state. Passing synth is not connectivity evidence. Keep `.local/bottlerocket/` and `.local/recovery/bottlerocket-trial-clients/` private; never print credentials or client exports.

## Observed deployment and acceptance

The corrected restricted-daemon deployment passed both encrypted clients with separate EIP masquerading, private RAM/config identity checks, engine/daemon confinement, host/metadata/peer isolation and HEALTHY GuardDuty v1.17.1. Fault tests passed wrong-IP ingress counters, independent engine restarts without replacing the task, metadata-loss quarantine, NAT-order repair, stalled daemon/lease expiry, killed daemon/ECS replacement and whole gateway replacement. Reboot changed the kernel boot ID and passed the same runtime/client checks. Repeated stop/start preserved credentials and passed post-start security and tunnels.

The initial NET_ADMIN-only cold deployment failed at the IP-set matcher before creating the gateway; the corrected comparison demonstrated NET_RAW's necessity. All earlier trial hosts/resources were removed. A stopped-host teardown subsequently completed without orphaned ECS registration or endpoint dependencies, followed by a fresh reconstruction with the same image/credential selection. The final host passed runtime/security checks, healthy GuardDuty and both encrypted protocols with its newly allocated EIPs.

**Coverage timing limitation:** after the earlier stop/start, ListCoverage returned no host record for the entire ten-minute verification gate. Coverage recovered without intervention; a normal verification retry passed before teardown. Approved privileged diagnostics found a continuously running agent since resume, normal startup/probe/dependency checks and no log warnings/errors. The coverage record's update time was roughly 51 minutes after agent startup, but neither proves the first healthy time nor continuous telemetry delivery. Delayed inventory/reporting is a plausible explanation, not an established root cause. The verifier still requires exact-host HEALTHY coverage and fails boundedly; no agent reset, monitoring change or security exception was introduced. [Investigation evidence](../.context/knowledge/host-os-evaluation.md#guardduty-coverage-delay-after-stopstart).

The production integration passes **200 tests / 27 files**, typecheck, fixture linters and fresh synth. Stockholm and Cape Town have now passed promotion using the same qualified platform bytes. Current production identities and native acceptance belong in their launch records; loaded performance and sleep/wake remain separate evaluations.

The final disposable teardown exposed an ordering race: CloudFormation removed EIP associations before ECS had stopped its daemon. Service counts showed zero, but the task still reported desired STOPPED / actual RUNNING and the host agent was disconnected. The dependency graph now explicitly keeps both address bindings until the daemon service is deleted. The already-deleting isolated host was terminated before clearing its stale ECS registration; production was unaffected. A fresh isolated cold deploy, park/repeated park/unpark, runtime confinement, HEALTHY GuardDuty and both encrypted clients passed using the exact production image selection and synthetic credentials. CloudFormation events prove daemon deletion preceded both IP detachments. Final teardown also passed with the same event-order proof and no manual recovery. The final inventory confirms all trial hosts, disks, IPs, VPC resources, synthetic parameters and the experimental repository are absent; both production gateways and their retained platform repositories remain. Evidence: `.local/bottlerocket/{park-unpark,teardown-order-park,teardown-order-destroy,retirement-audit}.json` and `/tmp/ghostline-lifecycle-regression.log`. [Handoff](../.context/handoff.md) records final production state.
