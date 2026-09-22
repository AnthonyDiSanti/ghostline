# Tasks

## Completed — GuardDuty and regional lifecycle, September 20

- Own private telemetry transport and automatic host enrollment in the gateway stack; make normal and interrupted teardown repeatable.
- Reconcile the regional singleton imperatively with AWS defaults at creation and enable-only updates. Discover service/telemetry/features live; accept confirmed gaps without suppressing operational failures. Monitoring persists after teardown.
- Validate cold builds, retained credentials/images, released-IP rebuilds and refreshed profiles in Northern Virginia; validate fresh-detector lifecycles in London and Taipei. Both protocols and HEALTHY runtime coverage passed; all disposable workload artifacts were removed.
- Roll monitoring out to Stockholm/Cape Town and align their optional plans once with fresh AWS defaults. Both protocols and HEALTHY agent v1.17.1 pass, with unchanged host/IP/task/credential identities and no-write repeat reconciliation.
- Probe New Zealand detector capabilities: defaults plus runtime accepted; EC2/Fargate/EKS enrollment options advertised but disabled. No workload coverage test occurred. Full service/runtime absence remains simulated coverage because no accessible commercial candidate was found.

Full gate: 164 tests in 22 files, typecheck, asset linters and both maintained offline synths. [Handoff and evidence](handoff.md), [final contract and test limits](../docs/guardduty.md). Committed as `2f84ad1`; no further deployment is needed for this work unit.

## Completed — Global image distribution, September 21

- Deploy self-contained NVA/London publishers with direct regional replication, explicit activation seeding and shared subscriber membership.
- Keep CDK task definitions static, validate complete local OCI release sets, reconcile hourly/events, and use native ECS rollback with explicit failed-attempt retry.
- Retain app-level production plus three prior distinct image/document sets through exact keep aliases; no regional extra pins or MRU cascade.
- Verify real DR and primary publications complete on Stockholm/Cape Town without task revisions, duplicate turnover or protocol requalification; preserve endpoint/credential identities.
- Exercise the normal fresh-build publication path with initializer secret-inheritance hardening. Central protocol/regression qualification and both automatic regional deployments pass; CloudTrail shows exactly one force-only request per region, task revision 4 and endpoint/credential identities unchanged, and repeat reconciliation is a no-op.
- Remove six obsolete repositories/two image stacks and all temporary replication keep tags after guarded checks.
- Deploy standalone SNS notifications and required private regional CloudTrail transport. Anthony confirmed both SNS subscription emails; commit-prep readback verifies one confirmed email subscription per gateway topic. Operational alert receipt remains unobserved; no test email was sent.

Committed as `f02e590`. Full gate: 185 tests/25 files plus typecheck, assets and synth. [Workflow](../docs/releases.md), [rollout evidence](handoff.md#completed-release-distribution--september-21-2026). Personal-assistant notification adoption is recorded below its GuardDuty task.

## Completed — Bottlerocket production adoption, September 22

- Validate retained-IP park/repeated park/unpark on the isolated gateway, then rebuild Stockholm and Cape Town with original EIPs, credentials and application releases.
- Adopt the common official Bottlerocket ARM64 platform, finite essential bootstrap, restricted ECS network daemon and durable qualified platform-image publication; remove the AL2023 provisioner.
- Pass runtime confinement/private RAM/isolation checks, both real encrypted protocols, HEALTHY GuardDuty, clean endpoint diffs and no-op release reconciliation in both regions. Diagnostic/admin access is disabled afterward.
- Fix unattended park approval handling, JSON/YAML template comparison, fresh-region client-image authentication and service-before-IP teardown dependencies. Verify dependency-only direct updates preserve running production tasks. Full gate passes 200 tests/27 files plus typecheck, asset checks and synth.
- Replace experimental product-phase labels and specifications with the functioning-product contract. Public-source release preparation is separate. All disposable resources are removed; [handoff](handoff.md) records the final inventory and repeated lifecycle evidence.

## Next work units — owner-selected order

1. **Implement the ECR replication cluster immediately after Bottlerocket.** [Implementation plan](scratch/2026-09-22-ecr-replication-cluster/plan.md). Make every enrolled regional registry an eligible publication source, replicating directly to all other members, with source selection per command and no redeployment. Replace primary/DR roles with reusable `EcrReplicationCluster` membership; seed production plus three prior image/document sets from an existing member before enabling outgoing replication. Preserve static local task references, app-level retention and regional gates; use one publication at a time and reject known-stale origins. Explicitly audit/retire redundant publisher-only resources after migration. Plan recorded only; implementation follows Bottlerocket.
2. **Explore blue-green deployment after OS selection and the ECR cluster work.** Evaluate temporary second-host overlap, green validation, stable two-EIP cutover and finite retirement of blue. Separate host replacement from ECS task releases; account for EIP/ENI ownership, non-atomic moves and connection-state loss. No permanent spare, load balancer or controller is selected yet.
3. **Turn lifecycle research into an implementation plan.** September 20 [research](knowledge/on-demand-lifecycle.md) recommends periodic authenticated-presence snapshots, a durable lease and an external scheduled controller. Exact-version Xray session stats and AWG authenticated RX/handshake signals are promising but require a disposable integration check; neither proves a silent client VPN-toggle state. An ECS observer with platform-managed reporting can preserve absent task IAM; placement/transport and telemetry-loss policy remain open. No implementation or cloud change has begun. This follows OS and deployment evaluation. Define permanent, idle and fixed-expiry behavior; select stop/park/release consequences and CLI versus phone-accessible control. Specify what authenticated activity means for quiet/sleeping clients, without browsing logs, and how missing telemetry or overlapping operations behave. Build on validated start/stop and rebuild/release commands; no further image or GuardDuty work is a prerequisite. [Open decisions](../docs/deployment-lifecycle.md#optional-expiration-follow-up).
4. **Measure performance when useful.** Record aggregate throughput, RAM and sustained CPU credits for both protocols, including GuardDuty overhead, when investigating capacity or changing size. The cost review recommends retaining t4g.small: micro saves only $6.28/month in Stockholm or $14.24 across both at list price, can lose trial benefits, and fails our unchanged memory formula. Measurement is not a required downsizing project or a gate before lifetime features. [Cost evidence](handoff.md#downsizing-review--september-20).

Restricted-daemon implementation and isolated lifecycle checks are complete. Read-only ECS introspection plus validated kernel NAT bindings replace Docker inspection; bootstrap owns RAM/minimal early guard, and one daemon owns network initialization/repair. Exact qualification established NET_ADMIN + NET_RAW for the IP-set matcher, without host mounts/PIDs/devices/control sockets or SELinux relaxation. Approved diagnostic access was disabled afterward. No monitoring setting was disabled or coverage gate weakened. [Permission budget](knowledge/host-os-evaluation.md#daemon-permission-budget). Both production regions now pass Bottlerocket runtime/client/GuardDuty validation; blue-green implementation and idle-lifetime orchestration remain later work.

## Cross-project follow-up

The personal-assistant documentation transfer is complete: `context/scratch/01M2ZYMHTFEGN0BZ40T9N92RNW/ghostline-infrastructure-handoff.md` is linked from its handoff/tasks, with reusable findings in `context/knowledge/infra-ops.md`. Its pending task owns live ownership inspection, retain-first migration and Fargate-specific enable-only reconciliation. Anthony authorized the documentation transfer on September 20; implementation remains separate and is not a Ghostline feature gate.

Notification-package adoption is also queued as `01M30ZMCBFT63RWHKXXC0RDTZ5`, immediately below that GuardDuty task, with a separate scratch transfer note. No personal-assistant implementation or cloud migration was performed.

## Separate acceptance and optional evaluations

- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls and release vulnerability coverage in separately selected evaluations. Preserve current engine/secret boundaries.
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is selected. Guest access and Windows/Android remain future scope.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 22 work-unit recheck: issue remains open with no linked development PR. GitHub now labels [5.0.3.0](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.3.0) latest stable (`prerelease: false`, confirmed through releases/latest), superseding the previous prerelease observation. Its September 18 notes add TProxy and generic stability improvements; they do not establish inclusion of the deadlock fix. macOS packages require 13+. No fixed Mac build identified or installed. Do not upgrade the client merely because this check is due.

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.
