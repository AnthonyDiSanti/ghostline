# Tasks

## Completed — regional architecture cleanup and Cape Town migration, September 18

- One AL2023 ARM64 ECS recipe now serves Stockholm and Cape Town. Removed retired targets, SSH/Compose deployment code, alternate CPU paths and obsolete tests/docs/drafts.
- Cape Town preserves both original EIPs and six credential identities; direct macOS/iOS credential probes, runtime security/memory checks and unattended stop/start pass. Old source stack/host/network/key are removed.
- Stockholm cloud templates, startup bytes and release identities are unchanged; real protocol regression tests pass. Both regional endpoint/image diffs are clean.
- Full local gate: 82 tests, two regional synth configurations, ShellCheck/Hadolint and ARM64 image tests. Working tree/index review and evidence are in the handoff; no commit was made.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 18 API recheck: issue open (last updated September 9, five comments), latest stable 5.0.1.5 published August 21; no fixed Mac build identified. Do not upgrade the client merely because this check is due.

## Follow-ups

- If not already done, reconnect OneXraySE manually: it was disconnected for direct probes; `scutil --nc start` did not reconnect and CUA could not access app windows (`cgWindowNotFound`). Direct internet works. No native profile settings changed.
- Give Cape Town's existing profiles a quick native iPhone check after migration. Both iOS credential pairs already pass disposable encrypted-client tests; physical-device acceptance remains distinct.
- Implement official-stable release resolution, artifact verification and recorded build provenance for both engines; current fixed inputs remain. [Policy](../docs/images.md#release-policy).
- Measure representative aggregate throughput/memory and sustained CPU credits before downsizing or claiming an optimal budget. Current task budget is 1126 MiB on t4g.small.
- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls, release vulnerability coverage and Bottlerocket after a separately selected evaluation. Preserve current engine/secret boundaries.
- Validate full address-release/redeploy/profile-refresh lifecycle; retained-IP rebuild and stop/start already have Stockholm evidence.
- Select permanent versus idle/fixed expiry, stop/park/release action, and CLI versus phone-accessible launch before building an on-demand controller. Define authenticated quiet/sleeping-client semantics without browsing logs. [Lifecycle](../docs/deployment-lifecycle.md#optional-expiration-follow-up).
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is currently selected.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves. Guest access and Windows/Android remain future scope.
