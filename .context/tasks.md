# Tasks

## In progress — isolated AL2023 bridge evaluation

Anthony selected a derivative of the official ECS-optimized AL2023 ARM64 AMI after the [first disposable trial](scratch/2026-09-24-al2023-bridge/plan.md) **rejected shell-user-data gate installation**. The September 25 derivative trial passed fresh first boot, Docker-restoration ordering, per-boot finite bootstrap **container**, 2 MiB private RAM, empty forwarding quarantine, failed-image fail-closed/recovery, and EC2 stop/start on an isolated Ireland host. The synthetic sentinel's HTTPS connection timed out while the host's direct path returned HTTP 301. All trial hosts/stacks and the synthetic AMI/snapshot were removed. Production remains unchanged. This is a host-gate checkpoint only, not qualification of the real five-image gateway.

Next: adapt the actual bootstrap artifact and host backend to AL2023, build a reproducible derivative AMI with provenance/update policy, and run the full daemon/gateway, secret/RAM, routing, GuardDuty, release, and lifecycle checks in a disposable region. Qualify centrally before any retained-EIP production cutover. Keep the isolated trial harness out of production deployment commands, then remove trial-only fixtures/targets when the serving path is selected. Do not leave both host adapters as maintained alternatives.

Checkpoint verification: the temporary `lifecycle-test` entry remains in the deployment catalog while the separate paused Ireland diagnostic host is live. It causes the maintained-endpoint-only test to fail. Restore that invariant without losing an authorized cleanup path to the diagnostic host before a release commit; do not merely relax the assertion.

## In progress — coordinated release/lifecycle implementation

Anthony authorized the [coordinated plan](scratch/2026-09-22-coordinated-release/plan.md), superseding the standalone ECR ordering. Shared account CloudTrail migration, enable-only security preservation, lifecycle exclusion, full-mesh replication and the first complete Ireland destroy/repeat/rebuild are verified live. Rebuilt Ireland runtime/credentials/private RAM/egress/GuardDuty pass. Both production task and endpoint identities are unchanged.

Park production promotion while awaiting an official Bottlerocket repair for Ireland's bootstrap snapshot failure. The concise [upstream issue #1059](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059) links an [apply-ready source patch](https://gist.github.com/AnthonyDiSanti/3a31dd18a14dff65c21b2153fb550a30); monitor maintainer response, any request for a PR/reproducer, core-kit changes and official ECS-3 ARM64 releases at major work-unit transitions. The original boot's precise GC timing remains untraced. App-only, daemon-only and combined actions passed, but the failed bootstrap action remains paused and native qualification is withheld. Do not run the prepared production promotion or silently retry Ireland. A fix in an official release must pass native A→B replay, repeated boot/recovery and full central qualification before migration. Then finish stop/start and encrypted acceptance, promote staged history, migrate production with retained IPs, retire old helper/document resources and complete expanded disposable cleanup. Remove candidate resources and the temporary Ireland catalog; rerun the full gate (September 25 checkpoint: 305 passed plus the temporary-catalog assertion failure). [Audit](scratch/2026-09-22-coordinated-release/bootstrap-pattern-audit.md), [handoff](handoff.md). Continue independent work on the currently qualified production architecture; no NVA/London retirement, production destruction, blue-green or idle controller in this coordinated unit.

The Ireland disposable host and two EIPs remain live and billable for initial maintainer triage. At the next work-unit transition, capture any requested host evidence and decide promptly whether to destroy/rebuild later rather than leave a trial running throughout the upstream wait. Next independent unit: evaluate blue-green host replacement and EIP handoff against the qualified current deployment, without adding a standing spare or changing serving endpoints. Implementation waits for its own selection and release-readiness checks; on-demand lifetime design remains after that evaluation.

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

1. **Complete the coordinated release work now in progress.** [Implementation plan](scratch/2026-09-22-ecr-replication-cluster/plan.md). Make every enrolled regional registry an eligible publication source, replicating directly to all other members, with source selection per command and no redeployment. Replace primary/DR roles with reusable `EcrReplicationCluster` membership; seed production plus three prior image/document sets from an existing member before enabling outgoing replication. Preserve static local task references, app-level retention and regional gates; use one publication at a time and reject known-stale origins. Keep NVA/London enrolled and intact. The coordinated plan includes bootstrap/daemon/metadata distribution and complete regional destroy; earlier publisher-retirement language is superseded.
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

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 23 work-unit recheck: issue remains open with no linked development PR. GitHub labels [5.0.3.0](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.3.0) latest stable; its September 18 notes add TProxy and generic stability improvements, not an identified deadlock fix. macOS packages require 13+. No fixed Mac build identified or installed. Do not upgrade the client merely because this check is due.

September 24 milestone check: #2933 remains open with no issue update since September 9; GitHub still identifies 5.0.3.0 as latest stable. No locally validated fix.

September 25 derivative-AMI checkpoint: #2933 remains open; GitHub still marks 5.0.3.0 latest. No identified or locally validated macOS fix.

## Recurring Bottlerocket release check

At the same major work-unit transitions and To Do reviews, check [core-kit #1059](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059) for maintainer feedback, linked fixes or a request for a PR/reproducer. Check [official Bottlerocket releases](https://github.com/bottlerocket-os/bottlerocket/releases) for a build containing the reviewed fix and available for `aws-ecs-3` ARM64. Record the date, issue/fix status and release result here. Continue until that official build passes isolated A→B bootstrap replay, repeated boot/recovery and central qualification; issue closure, merge or a newer OS alone does not unblock promotion. September 23 check: #1059 is open with no comments; GitHub's latest stable release is [v1.65.0](https://github.com/bottlerocket-os/bottlerocket/releases/tag/v1.65.0), published September 9, with no verified repair. Ireland's paused action and the production migration hold remain in place.

September 24 milestone check: #1059 remains open with no comments or issue update since September 23; GitHub still identifies v1.65.0 as latest stable. No official fix or native qualification; keep the promotion hold.

September 25 derivative-AMI checkpoint: #1059 remains open with no linked development PR or maintainer response. GitHub lists v1.66.0 as a prerelease and still marks v1.65.0 latest stable; neither is a verified fix. Keep the Bottlerocket promotion hold and the official-fix watch.

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.
