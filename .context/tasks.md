# Tasks

## Ready to commit — GuardDuty and regional lifecycle, September 20

- Own private telemetry transport and automatic host enrollment in the gateway stack; make normal and interrupted teardown repeatable.
- Reconcile the regional singleton imperatively with AWS defaults at creation and enable-only updates. Discover service/telemetry/features live; accept confirmed gaps without suppressing operational failures. Monitoring persists after teardown.
- Validate cold builds, retained credentials/images, released-IP rebuilds and refreshed profiles in Northern Virginia; validate fresh-detector lifecycles in London and Taipei. Both protocols and HEALTHY runtime coverage passed; all disposable workload artifacts were removed.
- Roll monitoring out to Stockholm/Cape Town and align their optional plans once with fresh AWS defaults. Both protocols and HEALTHY agent v1.17.1 pass, with unchanged host/IP/task/credential identities and no-write repeat reconciliation.
- Probe New Zealand detector capabilities: defaults plus runtime accepted; EC2/Fargate/EKS enrollment options advertised but disabled. No workload coverage test occurred. Full service/runtime absence remains simulated coverage because no accessible commercial candidate was found.

Full gate: 164 tests in 22 files, typecheck, asset linters and both maintained offline synths. [Handoff and evidence](handoff.md), [final contract and test limits](../docs/guardduty.md). No additional deployment or feature work is required before this commit.

## Next work units — recommended order

1. **Coordinate personal-assistant GuardDuty ownership.** Use the [written handoff](../docs/guardduty.md#creation-defaults-and-enable-only-updates) for a separately scoped task. Inspect live detector ownership; deploy/verify Retain before removing any owned declaration, then adopt equivalent live-discovery/enable-only reconciliation. Verify reuse and teardown persistence. No sibling edits/messages have been made.
2. **Measure the shared host under representative load.** Record aggregate throughput, RAM and sustained CPU credits for both protocols, including GuardDuty agent overhead. Check the 1126 MiB task budget and host allowance on t4g.small before downsizing or claiming optimal sizing.
3. **Define and implement on-demand lifetimes.** Select permanent versus idle/fixed expiry, stop/park/release action, and CLI versus phone-accessible launch. Define authenticated activity for quiet/sleeping clients without browsing logs. Build on validated start/stop and rebuild/release commands. [Open decisions](../docs/deployment-lifecycle.md#optional-expiration-follow-up).

These are recommendations, not authorization for additional cloud or sibling-repo changes.

## Separate acceptance and optional evaluations

- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls, release vulnerability coverage and Bottlerocket in separately selected evaluations. Preserve current engine/secret boundaries.
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is selected. Guest access and Windows/Android remain future scope.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 20 commit-prep page check: issue remains open with no linked development PR; latest release remains 5.0.1.5 (August 21), whose Mac package requires macOS 13+. No fixed Mac build identified. Do not upgrade the client merely because this check is due.

## Previously completed

- `15f5748`: one maintained AL2023 ARM64 shared ECS gateway architecture; Cape Town migrated with original IPs/credentials. Obsolete provisioners/targets removed. Common initializer, protocol-private RAM mounts, resource budget and unattended lifecycle validated.
- `db5c372`: official stable image resolution, authenticated public metadata, exact-artifact encrypted compatibility/publication tests and rollout to both regions. September 20 native macOS/iPhone acceptance through both Stockholm protocols is sufficient for that rollout. [Image policy](../docs/images.md), regional launch records and handoff retain the evidence.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves.
