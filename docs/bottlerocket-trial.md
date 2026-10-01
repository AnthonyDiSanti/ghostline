# Central native qualification

Use a disposable regional instance of the **common** `EcsEndpointStack` to qualify platform changes. There is no alternative Bottlerocket provisioner or coupled helper image. Keep its EIPs/credentials distinct from production, and isolate its publication membership when test promotions must not propagate. Read the [handoff](../.context/handoff.md) before resuming an unfinished live experiment.

## Qualification sequence

1. Run `images:build` and the full local gate. All five artifacts use the same source-input hashing, exact image capture and OCI publication functions. Bootstrap/daemon package checks alone do not prove native host behavior.
2. Publish the exact candidate bytes into isolated repositories using the common transfer path. Instantiate the common stack with explicit candidate image inputs when the platform is not yet qualified for the production aliases. Do not alter production selectors to bootstrap an experiment.
3. Verify actual OS/architecture, mandatory per-boot RAM setup and empty forwarding quarantine, restricted daemon cold readiness with no engines, then initializer SUCCESS and both engines. Preserve the protocol-private RAM and secret boundaries.
4. Exercise identity/address churn, daemon death/lease expiry, repeated boot, ordered stop/start and retained-IP park/unpark. Run fault fixtures only against their explicitly guarded disposable identities. Confirm forwarding closes when leases expire and recovers through ECS daemon replacement; disable temporary diagnostics afterward. Verify actual task digests, boot IDs, endpoints and configuration hashes.
5. Qualify native blue-green success and failure behavior: cold green readiness, both EIP moves, partial handoff, task/host failure, native rollback, explicit failed-green cleanup and unchanged-release no-op. Prove full destroy/repeat-destroy/redeploy with retained credentials and independent resource audits. [Evidence](../.context/scratch/2026-09-28-blue-green/gateway-trial.md).
6. For an OS change, test the official regional AMI through repeated native bootstrap and recovery, including real image-pull/cache failure behavior. Keep signature/TUF verification. In-place updater experiments are historical evidence; production OS delivery uses a fresh green host. An affected boot failure requires diagnosis, not the retired extra-reboot controller behavior.
7. Run runtime/GuardDuty and encrypted client checks centrally. Close qualification with `npm run platform <target> qualify /absolute/path/to/qualified.json`. This command checks source inputs, runs runtime security verification and binds current boot/platform identities to the selected OS. **It records the completed experiment; it does not perform every lifecycle/fault test above.**
8. Publish that qualified complete release. Regional delivery validates descriptors and uses the common blue-green path without repeating protocol qualification. Remove disposable infrastructure through normal destroy and independently verify retained classes.

The native proof is `infra/platform-qualification.json`. Affected accepted OS versions carry #1059 in `os.knownLimitations`; publication preserves this evidence until an official repair passes qualification. The former automatic recovery exception is already retired with blue-green. Reuse native evidence only when exact platform runtime digests and source-input identities match; new executable platform bytes require fresh native qualification. Identical runtime children with new provenance indexes do not.

## Security invariants

Bootstrap is a finite essential native container on every boot. It validates disabled swap/capacity, creates the 2 MiB RAM mount with native SELinux labels, restrictive options and protocol-private modes, and establishes an empty forwarding guard. It neither fetches application secrets nor runs ongoing reconciliation. Its identity observation is best-effort.

The separate ECS DAEMON task uses host networking with only NET_ADMIN and NET_RAW added after dropping ALL, read-only root, no-new-privileges, seccomp and enforcing SELinux. It has no host mounts, Docker API/socket, host PID, devices, task IAM or server secrets. Its private tmpfs is bounded. It validates introspection identities against kernel port mappings and grants renewable five-second forwarding leases. Death or discovery errors withdraw/expire forwarding; a cold daemon can be healthy with zero engines.

The shared app task remains bridge-networked. Only the network-disabled initializer receives ECS-injected server parameters. Engines mount separate RAM directories read-only; AWG's network authority remains inside its container namespace. Memory on t4g.small is 1,126 MiB app task, 64 MiB daemon and 602 MiB ECS reserve. Light-load validation does not establish peak capacity.

Diagnostics reuse the bootstrap artifact only through the separately invoked, normally disabled host container. Verification finally disables it and reads back diagnostic/admin lockdown. Never automatically enable diagnostics for publication/recovery.

## Observed evidence and limits

The earlier production Bottlerocket work established enforcing SELinux, integrity lockdown, read-only EROFS, Secure Boot, engine seccomp/no-new-privileges, no swap and encrypted OS/data disks. A separate live dm-verity attestation was not obtained. [Upstream security guidance](https://github.com/bottlerocket-os/bottlerocket/blob/develop/SECURITY_GUIDANCE.md).

September 22 Ireland evidence established separate bootstrap/daemon artifacts, native latest-AMI launch resolution, exact mutable-alias daemon-only and bootstrap-only actions, repeated bootstrap execution with fresh boot identity, and signed 1.64→1.65 OS updating. Existing configuration hashes, independent EIP egress, private RAM, confinement and HEALTHY GuardDuty v1.17.1 passed after updating. The cache-fault trial proved no bootstrap fallback after an ECR 403 despite cached content; external permission restoration and reboot recovered. See [platform policy](platform.md) and live handoff for the later deployed-controller/cold-recipe migration status.

CloudFormation must retain both EIP associations until the gateway **and** daemon have actually stopped, preserving agent connectivity. A previous isolated teardown exposed that race; the common dependency graph and actual-stop checks address it. Current-network native client acceptance is recorded separately in [client stability](mac-client-stability.md) and [benchmarks](benchmarks.md); it is not inferred from infrastructure tests.

## September 26 native qualification

The common Ireland stack qualified the split artifacts on official ECS-3 ARM64 **1.66.0**. The producer-generated [native proof](../infra/platform-qualification.json) binds exact source inputs/runtime manifests and records the accepted #1059 availability limitation. This does not claim the OS defect is repaired.

- Actual regional Lambda orchestration passed app-only, daemon-only, bootstrap-only and combined releases, with expected task/boot identity changes and no EC2 replacement.
- A failed controlled bootstrap pull recovered after the real 15-minute deadline with exactly one extra reboot. Repeated reconciliation produced no additional reboot; exhaustion/uncertain acknowledgements are covered by behavioral tests.
- Signed native downgrade, reboot before activation and cancellation passed. Native `latest` offered no newer candidate from 1.65; a separate retained-IP cold rebuild restored official 1.66. Exact mid-write interruption and native 1.65→1.66 upgrade were not demonstrated.
- Stop/start, private read-only RAM, secret/environment separation, memory enforcement, SELinux/container confinement, diagnostic lockdown and HEALTHY GuardDuty v1.17.1 passed. Both real encrypted HTTPS clients passed with direct Mac en0 routes.
- A verified cached bootstrap still failed before ECS when its ECR pull was denied. Removing the scoped test policy and explicitly rebooting restored the same host. Metadata tolerance is not an offline-image guarantee.
- Freezing the daemon past its five-second kernel lease blocked both engines; unfreezing restored traffic. ECS replaced a subsequently killed daemon without gateway or host turnover.

Nonsecret journals and protected diagnostics remain under ignored `.local/coordinated-release/`; the handoff records production migration and disposable cleanup separately. Native iOS and sleep/wake/load acceptance are not inferred from these tests.
