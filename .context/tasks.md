# Tasks

Cape Town is parked by owner request (September 27); retain its IPs/credentials and release support. Unpark explicitly when backup connectivity is needed. Stockholm remains the active primary. [Launch record](../docs/launch-cape-town.md#parked--2026-09-27).

## Completed — Coordinated Bottlerocket release, September 26

- Preserve the upstream contribution in Anthony's GitHub fork and [core-kit PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063), linked to #1059. The actual Pull/Unpack regression fails before and passes after the candidate; no patched OS/submodule is deployed.
- Retire AL2023 and qualify the five-image common pipeline on official 1.66.0 with the explicit accepted startup limitation. Validate selective actions, native updater limits, cached-pull failure/recovery, stop/start, private RAM/security, kernel lease expiry and both encrypted protocols.
- Add one durable additional reboot for an acknowledged, timed-out controlled bootstrap action with exact drained-host/lifecycle checks. Refuse unrelated failures and repeated recovery; preserve uncertainty and alert. **Retired with the September 28 blue-green controller; the upstream defect remains open.**
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

## Completed — Native blue-green deployment, October 1

Qualified native headless ECS hooks, direct EIP handoff, five-minute bake, failure rollback, held-green cleanup, stop/start, park/unpark and complete destroy/redeploy in Ireland. Migrated Stockholm with original endpoints/credentials, retired both source generations and verified no-op reconciliation; Cape Town remains parked. The final production security verifier passed with diagnostics disabled afterward and HEALTHY GuardDuty. Fresh commit-prep gate: 396 tests/67 files, typecheck, fixture checks and offline synthesis. [Evidence](handoff.md), [current contract](../docs/releases.md).

## Next work units — owner-selected order

1. **Turn lifecycle research into an implementation plan.** September 20 [research](knowledge/on-demand-lifecycle.md) recommends periodic authenticated-presence snapshots, a durable lease and an external scheduled controller. Exact-version Xray session stats and AWG authenticated RX/handshake signals are promising but require a disposable integration check; neither proves a silent client VPN-toggle state. An ECS observer with platform-managed reporting can preserve absent task IAM; placement/transport and telemetry-loss policy remain open. No implementation or cloud change has begun. This follows OS and deployment evaluation. Define permanent, idle and fixed-expiry behavior; select stop/park/release consequences and CLI versus phone-accessible control. Specify what authenticated activity means for quiet/sleeping clients, without browsing logs, and how missing telemetry or overlapping operations behave. Build on validated start/stop and rebuild/release commands; no further image or GuardDuty work is a prerequisite. [Open decisions](../docs/deployment-lifecycle.md#optional-expiration-follow-up).

Restricted-daemon implementation and isolated lifecycle checks are complete. Read-only ECS introspection plus validated kernel NAT bindings replace Docker inspection; bootstrap owns RAM/minimal early guard, and one daemon owns network initialization/repair. Exact qualification established NET_ADMIN + NET_RAW for the IP-set matcher, without host mounts/PIDs/devices/control sockets or SELinux relaxation. Approved diagnostic access was disabled afterward. No monitoring setting was disabled or coverage gate weakened. [Permission budget](knowledge/host-os-evaluation.md#daemon-permission-budget). Stockholm is active on blue-green; Cape Town remains parked. October 1: the explicitly approved Stockholm production verifier passed, including diagnostic/admin lockdown and HEALTHY GuardDuty; blue-green closeout is complete.

## Completed — Current-network performance and privacy, September 28

Anthony closes this work unit with the available results: serviceable video, OneXraySE sleep/wake, IPv4/DNS privacy and native Chrome WebRTC pass. The current LAN appears to settle near 20 Mbps after a brief faster burst and has no working IPv6; further cap diagnosis or an IPv6-capable test network is not an outstanding acceptance requirement. This closes the task without claiming proven shaping causality or IPv6 leak protection. [Evidence](../docs/benchmarks.md#owner-feedback--2026-09-28).

Benchmark tooling and cleanup are complete; [round two](scratch/2026-09-27-regional-benchmark/round-two.md) and the [Stockholm/Frankfurt comparison](scratch/2026-09-27-regional-benchmark/head-to-head.md) established no regional winner under variable controls. Preserve those results and thresholds. Revisit benchmarking/privacy naturally from a new location alongside classic WireGuard or IPv6 qualification, rather than repeating this network's tests now.

## Cross-project follow-up

The personal-assistant documentation transfer is complete: `context/scratch/01M2ZYMHTFEGN0BZ40T9N92RNW/ghostline-infrastructure-handoff.md` is linked from its handoff/tasks, with reusable findings in `context/knowledge/infra-ops.md`. Its pending task owns live ownership inspection, retain-first migration and Fargate-specific enable-only reconciliation. Anthony authorized the documentation transfer on September 20; implementation remains separate and is not a Ghostline feature gate.

Notification-package adoption is also queued as `01M30ZMCBFT63RWHKXXC0RDTZ5`, immediately below that GuardDuty task, with a separate scratch transfer note. No personal-assistant implementation or cloud migration was performed.

## Separate acceptance and optional evaluations

- **Centralized cloud build scheduling remains future work.** Blue-green automates delivery of already-qualified releases; it does not yet discover, build and qualify upstream security updates on a schedule. Reuse the common stable-resolution and central qualification pipeline when adding that publisher.

- **IPv6 implementation deferred pending upstream support.** Anthony selects an official Bottlerocket path and preserves the shared bridge task/no IPv6 retention. September 28 owner-approved proposal submitted as [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954); body readback matches the [reviewed draft](knowledge/bottlerocket-ipv6-upstream.md). Check at major milestones and await maintainer feedback on API/repository responsibilities before implementation. No custom OS is selected. Track official inclusion and qualify before deployment.

- **Classic WireGuard deferred until Miami.** Anthony cannot use it on the current UAE connection; do not start its implementation/testing work unit until he is back in Miami. Owner intends a separate EIP with UDP 443. Extend the bridge daemon/discovery to distinguish multiple same-transport engines using per-engine host bindings plus destination-IP-aware forwarding; preserve per-engine egress, network-disabled initialization and shared task budgeting. [Feasible mapping proposal](../docs/ecs.md#bridge-networking); no implementation or qualification yet.

- Keep the shared initializer after the September 27 review. Two instances could narrow injected secrets/writable mounts, but the current brief restricted execution offers limited additional benefit for the added wiring. Revisit for untrusted inputs, differing privileges or dependencies; no split implementation is planned. [Tradeoffs](knowledge/event-driven-releases.md#initializer-separation-review--september-27-proposal-only).

- **Owner acceptance complete, September 28:** serviceable video, OneXraySE sleep/wake stability and IPv4/DNS privacy. Do not keep requesting these checks; reopen only for a new failure or relevant change. Exact device/protocol/power-state coverage was not supplied. Native Chrome/OneXraySE Stockholm WebRTC passed a direct/connected comparison on September 28: VPN-only public candidates and mDNS host names. Current-network privacy work is complete by owner decision; IPv6 blocking remains unproven because this Wi-Fi had no global IPv6 or working literal IPv6 HTTPS. Revisit with a future location/protocol work unit, not as an open acceptance item. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls and release vulnerability coverage in separately selected evaluations. Preserve current engine/secret boundaries.
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is selected. Guest access and Windows/Android remain future scope.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. Do not upgrade merely because the check is due.

October 1 milestone recheck: #2933 remains open, last updated September 9. GitHub marks September 18 release [5.0.3.0](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.3.0) latest stable; its notes do not identify this deadlock fix. No fixed Mac build has been identified or locally validated.

## Recurring Bottlerocket release check

At the same milestones, check [core-kit #1059](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059), [our PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063) and [official releases](https://github.com/bottlerocket-os/bottlerocket/releases). Record maintainer feedback, merge status and an available ECS-3 ARM64 build containing the reviewed fix. A newer OS or closed issue is not repair evidence. The in-place recovery exception is already retired with blue-green. Keep the limitation until an official build passes isolated bootstrap replay/repeated boot/recovery and is adopted; failed green boots require diagnosis.

October 1 milestone recheck: #1059 remains open and PR #1063 is open at `6a4c053`, September 28 ancestry was zero behind/two ahead of `develop` (`209347b`), so that housekeeping needed no rebase/push. October 1 metadata shows no PR comments; ancestry and reviews were not rechecked in this verification-only closeout. It retains an actual failing-before/passing-after `pullImage` integration regression and passing Go/race tests. GitHub marks v1.66.0 latest; its release predates our report and is not a verified repair. Anthony replaced the original official-fix hold with accepted startup availability risk after completed central qualification and production adoption; blue-green now replaces the earlier bounded-reboot controller. No custom OS or submodule is selected.

## Recurring IPv6 proposal and release check

At the same major work-unit transitions and To Do reviews, check [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954), linked implementation PRs and official releases. Record date, maintainer feedback, requested changes, implementation/merge state and release inclusion; surface any next action for our contribution. Follow through from proposal discussion to an official ECS release with Docker bridge IPv6 support, then isolated Ghostline lifecycle/isolation qualification. Issue closure or merge alone does not unblock deployment. No automatic upgrade or production change follows a watch check.

October 1 milestone check: owner-approved proposal remains OPEN with zero comments; submitted body was verified against the approved draft. Await maintainer feedback on API shape and repository responsibilities; implementation has not started. [Proposal and research](knowledge/bottlerocket-ipv6-upstream.md).

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.

September 28 11:48 UTC blue-green qualification milestone: all three upstream watches rechecked unchanged; #2933 open/latest 5.0.3.0, #1059 and #1063 open/unmerged/latest official 1.66.0, #4954 open/no comments. No upgrade or upstream write followed.
