# Tasks

## Completed — Coordinated Bottlerocket release, September 26

- Preserve the upstream contribution in Anthony's GitHub fork and [core-kit PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063), linked to #1059. The actual Pull/Unpack regression fails before and passes after the candidate; no patched OS/submodule is deployed.
- Retire AL2023 and qualify the five-image common pipeline on official 1.66.0 with the explicit accepted startup limitation. Validate selective actions, native updater limits, cached-pull failure/recovery, stop/start, private RAM/security, kernel lease expiry and both encrypted protocols.
- Add one durable additional reboot for an acknowledged, timed-out controlled bootstrap action with exact drained-host/lifecycle checks. Refuse unrelated failures and repeated recovery; preserve uncertainty and alert. **Remove this exception after an official repair is qualified and adopted.**
- Migrate Cape Town then Stockholm through retained-IP rebuilds. Preserve every credential parameter version and existing endpoint, verify GuardDuty and both protocols, enable both controllers and prove duplicate reconciliation causes no turnover. All four members retain equal complete release/history; obsolete helper resources/aliases are removed.
- Complete shared audit, any-member full-mesh distribution, whole-stack documents/selective orchestration and resumable regional cleanup from `ac70cb0`. Ireland deploy/destroy/repeat/redeploy and final expanded six-repository destroy/repeat pass; remove all experiment resources and the temporary target. Preserve NVA/London, Standard parameters, expiring telemetry and shared security.
- Fix the observed replication/PutImage duplicate race using exact digest readback. Full Node 24 gate: **324 tests/47 files**, typechecks, fixture linters and fresh synth. Both production endpoint diffs are clean. Personal-assistant documentation handoff cites the real shared-control checkpoint, with no sibling code/cloud change.

[Handoff and evidence limits](handoff.md), [platform](../docs/platform.md), [release contract](../docs/releases.md), [lifecycle](../docs/deployment-lifecycle.md). This checkpoint captures the completed follow-up; September 27 commit-prep repeated the full gate successfully. Upstream repair, native sleep/wake and owner-deferred LastPass closeout remain separate.

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

Committed as `f02e590`. Full gate: 185 tests/25 files plus typecheck, assets and synth. [Workflow](../docs/releases.md), [rollout evidence](knowledge/event-driven-releases.md#live-rollout-verification--september-21). Personal-assistant notification adoption is recorded below its GuardDuty task.

## Completed — Bottlerocket production adoption, September 22

- Validate retained-IP park/repeated park/unpark on the isolated gateway, then rebuild Stockholm and Cape Town with original EIPs, credentials and application releases.
- Adopt the common official Bottlerocket ARM64 platform, finite essential bootstrap, restricted ECS network daemon and durable qualified platform-image publication; remove the AL2023 provisioner.
- Pass runtime confinement/private RAM/isolation checks, both real encrypted protocols, HEALTHY GuardDuty, clean endpoint diffs and no-op release reconciliation in both regions. Diagnostic/admin access is disabled afterward.
- Fix unattended park approval handling, JSON/YAML template comparison, fresh-region client-image authentication and service-before-IP teardown dependencies. Verify dependency-only direct updates preserve running production tasks. Full gate passes 200 tests/27 files plus typecheck, asset checks and synth.
- Replace experimental product-phase labels and specifications with the functioning-product contract. Public-source release preparation is separate. All disposable resources are removed; [handoff](handoff.md) records the final inventory and repeated lifecycle evidence.

## Next work units — owner-selected order

1. **Explore blue-green deployment after the completed OS/release work.** Evaluate temporary second-host overlap, green validation, stable two-EIP cutover and finite retirement of blue. Separate host replacement from ECS task releases; account for EIP/ENI ownership, non-atomic moves and connection-state loss. No permanent spare, load balancer or controller is selected yet.
2. **Turn lifecycle research into an implementation plan.** September 20 [research](knowledge/on-demand-lifecycle.md) recommends periodic authenticated-presence snapshots, a durable lease and an external scheduled controller. Exact-version Xray session stats and AWG authenticated RX/handshake signals are promising but require a disposable integration check; neither proves a silent client VPN-toggle state. An ECS observer with platform-managed reporting can preserve absent task IAM; placement/transport and telemetry-loss policy remain open. No implementation or cloud change has begun. This follows OS and deployment evaluation. Define permanent, idle and fixed-expiry behavior; select stop/park/release consequences and CLI versus phone-accessible control. Specify what authenticated activity means for quiet/sleeping clients, without browsing logs, and how missing telemetry or overlapping operations behave. Build on validated start/stop and rebuild/release commands; no further image or GuardDuty work is a prerequisite. [Open decisions](../docs/deployment-lifecycle.md#optional-expiration-follow-up).
3. **Measure performance when useful.** Record aggregate throughput, RAM and sustained CPU credits for both protocols, including GuardDuty overhead, when investigating capacity or changing size. The cost review recommends retaining t4g.small: micro saves only $6.28/month in Stockholm or $14.24 across both at list price, can lose trial benefits, and fails our unchanged memory formula. Measurement is not a required downsizing project or a gate before lifetime features. [Cost evidence](handoff.md#downsizing-review--september-20).

Restricted-daemon implementation and isolated lifecycle checks are complete. Read-only ECS introspection plus validated kernel NAT bindings replace Docker inspection; bootstrap owns RAM/minimal early guard, and one daemon owns network initialization/repair. Exact qualification established NET_ADMIN + NET_RAW for the IP-set matcher, without host mounts/PIDs/devices/control sockets or SELinux relaxation. Approved diagnostic access was disabled afterward. No monitoring setting was disabled or coverage gate weakened. [Permission budget](knowledge/host-os-evaluation.md#daemon-permission-budget). Both production regions now pass Bottlerocket runtime/client/GuardDuty validation; blue-green implementation and idle-lifetime orchestration remain later work.

## Cross-project follow-up

The personal-assistant documentation transfer is complete: `context/scratch/01M2ZYMHTFEGN0BZ40T9N92RNW/ghostline-infrastructure-handoff.md` is linked from its handoff/tasks, with reusable findings in `context/knowledge/infra-ops.md`. Its pending task owns live ownership inspection, retain-first migration and Fargate-specific enable-only reconciliation. Anthony authorized the documentation transfer on September 20; implementation remains separate and is not a Ghostline feature gate.

Notification-package adoption is also queued as `01M30ZMCBFT63RWHKXXC0RDTZ5`, immediately below that GuardDuty task, with a separate scratch transfer note. No personal-assistant implementation or cloud migration was performed.

## Separate acceptance and optional evaluations

- Keep the shared initializer after the September 27 review. Two instances could narrow injected secrets/writable mounts, but the current brief restricted execution offers limited additional benefit for the added wiring. Revisit for untrusted inputs, differing privileges or dependencies; no split implementation is planned. [Tradeoffs](knowledge/event-driven-releases.md#initializer-separation-review--september-27-proposal-only).

- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls and release vulnerability coverage in separately selected evaluations. Preserve current engine/secret boundaries.
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is selected. Guest access and Windows/Android remain future scope.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. Do not upgrade merely because the check is due.

September 27 commit-prep recheck: #2933 remains open, last updated September 9. GitHub marks September 18 release [5.0.3.0](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.3.0) latest stable; its notes do not identify this deadlock fix. No fixed Mac build has been identified or locally validated.

## Recurring Bottlerocket release check

At the same milestones, check [core-kit #1059](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059), [our PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063) and [official releases](https://github.com/bottlerocket-os/bottlerocket/releases). Record maintainer feedback, merge status and an available ECS-3 ARM64 build containing the reviewed fix. A newer OS or closed issue is not repair evidence. After the official build passes isolated bootstrap replay/repeated boot/recovery and is adopted, remove temporary automatic boot recovery; subsequent boot failures require diagnosis.

September 27 commit-prep recheck: PR #1063 is open at `6a4c053`, with an actual failing-before/passing-after `pullImage` integration regression and passing Go/race tests. GitHub marks v1.66.0 latest; its release predates our report and is not a verified repair. Anthony replaced the original official-fix hold with accepted startup availability risk plus bounded recovery, after completed central qualification and production adoption. No custom OS or submodule is selected.

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.
