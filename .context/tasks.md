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

Full gate: 185 tests/25 files plus typecheck, assets and synth. [Workflow](../docs/releases.md), [rollout evidence](handoff.md#completed-release-distribution--september-21-2026). Personal-assistant notification adoption is recorded below its GuardDuty task.

## Next work units — recommended order

1. **Turn lifecycle research into an implementation plan.** September 20 [research](knowledge/on-demand-lifecycle.md) recommends periodic authenticated-presence snapshots, a durable lease and an external scheduled controller. Exact-version Xray session stats and AWG authenticated RX/handshake signals are promising but require a disposable integration check; neither proves a silent client VPN-toggle state. An ECS observer with platform-managed reporting can preserve absent task IAM; placement/transport and telemetry-loss policy remain open. No implementation or cloud change has begun. This is the next recommended Ghostline feature. Define permanent, idle and fixed-expiry behavior; select stop/park/release consequences and CLI versus phone-accessible control. Specify what authenticated activity means for quiet/sleeping clients, without browsing logs, and how missing telemetry or overlapping operations behave. Build on validated start/stop and rebuild/release commands; no further image or GuardDuty work is a prerequisite. [Open decisions](../docs/deployment-lifecycle.md#optional-expiration-follow-up).
2. **Measure performance when useful.** Record aggregate throughput, RAM and sustained CPU credits for both protocols, including GuardDuty overhead, when investigating capacity or changing size. The cost review recommends retaining t4g.small: micro saves only $6.28/month in Stockholm or $14.24 across both at list price, can lose trial benefits, and fails our unchanged memory formula. Measurement is not a required downsizing project or a gate before lifetime features. [Cost evidence](handoff.md#downsizing-review--september-20).

These are recommendations, not authorization to implement a controller or make additional cloud changes.

## Cross-project follow-up

The personal-assistant documentation transfer is complete: `context/scratch/01M2ZYMHTFEGN0BZ40T9N92RNW/ghostline-infrastructure-handoff.md` is linked from its handoff/tasks, with reusable findings in `context/knowledge/infra-ops.md`. Its pending task owns live ownership inspection, retain-first migration and Fargate-specific enable-only reconciliation. Anthony authorized the documentation transfer on September 20; implementation remains separate and is not a Ghostline feature gate.

Notification-package adoption is also queued as `01M30ZMCBFT63RWHKXXC0RDTZ5`, immediately below that GuardDuty task, with a separate scratch transfer note. No personal-assistant implementation or cloud migration was performed.

## Separate acceptance and optional evaluations

- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls, release vulnerability coverage and Bottlerocket in separately selected evaluations. Preserve current engine/secret boundaries.
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is selected. Guest access and Windows/Android remain future scope.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 21 work-unit check: issue remains open with no linked development PR; latest stable remains 5.0.1.5 (August 21). Prereleases 5.0.2.0/5.0.2.1 list generic stability changes but do not establish inclusion of this fix. macOS packages require 13+. No fixed Mac build identified or installed. Do not upgrade the client merely because this check is due.

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.
