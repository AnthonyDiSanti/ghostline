# Tasks

## Completed — regional architecture cleanup and Cape Town migration, September 18

- One AL2023 ARM64 ECS recipe now serves Stockholm and Cape Town. Removed retired targets, SSH/Compose deployment code, alternate CPU paths and obsolete tests/docs/drafts.
- Cape Town preserves both original EIPs and six credential identities; direct macOS/iOS credential probes, runtime security/memory checks and unattended stop/start pass. Old source stack/host/network/key are removed.
- Stockholm cloud templates, startup bytes and release identities are unchanged; real protocol regression tests pass. Both regional endpoint/image diffs are clean.
- Full local gate: 82 tests, two regional synth configurations, ShellCheck/Hadolint and ARM64 image tests. Implementation and commit-prep corrections are committed as `15f5748`; verification evidence is in the handoff.

## Completed — stable image build and regional rollout, September 19

Anthony selected completing image work before features. Stable resolution is implemented: `npm run images:build` resolves official channels, verifies concrete inputs, tests candidate ARM64 images and records `infra/image-inputs.json` only on success. Anthony subsequently approved using the existing GitHub CLI login for public metadata; the resolver now uses scoped authenticated GETs with anonymous source downloads. The full authenticated build and 125-test verification gate pass. Synthetic REALITY and AWG encrypted data probes pass alongside initializer/security/restart checks. Publication now tests exact existing/new regional artifacts before pushing anything. [Workflow and provenance limits](../docs/images.md).

Anthony subsequently authorized publication and rollout everywhere. Both regional gateways now run task revision 3: official Xray stable 26.3.27 replaces prerelease 26.7.28; AWG daemon/tools remain 3.1.20260828 / 3.1.20260812 in the verified build. Both exact regional image sets pass publication gates; live security/memory checks and real encrypted HTTPS/assigned-EIP tests pass for both protocols in both regions. Running digests match ECR, and all stack outputs plus all six parameter values/versions per region are unchanged. Native-device browsing remains an owner follow-up. Released-IP lifecycle testing and the expiry/controller decision are the next server work options.

## Recurring Mac release check

At major work-unit transitions and To Do reviews, check [Amnezia #2933](https://github.com/amnezia-vpn/amnezia-client/issues/2933), linked fixes and [published releases](https://github.com/amnezia-vpn/amnezia-client/releases) for inclusion in an available macOS build. Record applicable OS prerequisites. Closure/merge alone is insufficient; continue until a released fix passes a coordinated trial. September 19 API/page check: issue still open (five comments, last updated September 9); latest release still 5.0.1.5 (August 21). No fixed Mac build identified. Do not upgrade the client merely because this check is due.

## Follow-ups

- If not already done, reconnect OneXraySE manually: it was disconnected for direct probes; `scutil --nc start` did not reconnect and CUA could not access app windows (`cgWindowNotFound`). Direct internet works. No native profile settings changed.
- Give both regions' existing profiles a quick native macOS/iPhone browsing check after the stable rollout, including Cape Town's pending physical-device migration acceptance. Automated encrypted tests pass; profiles need no edits. Sleep/wake remains separate below.
- Measure representative aggregate throughput/memory and sustained CPU credits before downsizing or claiming an optimal budget. Current task budget is 1126 MiB on t4g.small.
- Complete practical OneXraySE sleep/wake testing on battery/AC with owner coordination; inspect new crash reports. Validate IPv6 blocking on a network with a working direct baseline. No forced sleep or retired socket watchdog.
- Consider explicit core-dump controls, release vulnerability coverage and Bottlerocket after a separately selected evaluation. Preserve current engine/secret boundaries.
- Validate full address-release/redeploy/profile-refresh lifecycle; retained-IP rebuild and stop/start already have Stockholm evidence.
- Select permanent versus idle/fixed expiry, stop/park/release action, and CLI versus phone-accessible launch before building an on-demand controller. Define authenticated quiet/sleeping-client semantics without browsing logs. [Lifecycle](../docs/deployment-lifecycle.md#optional-expiration-follow-up).
- Evaluate a performance-oriented protocol only if useful; no automatic failover, container merger or new listener is currently selected.

## Owner recovery

Anthony deferred LastPass updates until architecture settles. Preserve private local recovery copies and regional parameters; do not repeatedly request intermediate vault saves. Guest access and Windows/Android remain future scope.
