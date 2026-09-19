# Handoff

## Stable image build and rollout complete — 2026-09-19

Anthony requested stable build resolution before features. Added AWS-free `npm run images:build`; it resolves official stable Xray/tools releases and the AWG daemon's numeric published-tag channel, checks concrete artifact identities, runs the ARM64 image suite and atomically records successful inputs in `infra/image-inputs.json`. Offline synth/deployment/restarts consume this selection without discovery. AWG's recipe now accepts verified commit/checksum arguments; Xray remains an unmodified official mirror. [Build workflow](../docs/images.md).

Anthony authorized pushing the validated selection everywhere. Stockholm and Cape Town now both run gateway task revision **3**, with Xray **26.3.27** (official stable, replacing prerelease 26.7.28), AWG daemon **3.1.20260828** and tools **3.1.20260812**. AWG's upstream versions and the initializer release are unchanged. Exact regional artifacts passed local REALITY/AWG encrypted application-data checks, initializer rendering/privacy/partial-failure cleanup and AWG restart before publication; pull-back checks confirmed content. Both regional publication paths succeeded without code changes.

Stockholm deployed and passed live validation before Cape Town's rollout. Each now has one running gateway task, no pending tasks and successful initialization. Both encrypted HTTPS/assigned-EIP tests and live configuration, private read-only RAM mounts, absent engine secret environment/swap, native ARM64, bridge/metadata isolation and enforced memory checks pass. No task OOM events occurred. Running tags/digests match ECR; all stack outputs and all six parameter values/versions per region match the pre-rollout baseline. Both endpoint/image diffs are clean. No host, ENI, EIP, credential or native-routing change was needed. [Stockholm release evidence](../docs/launch-stockholm-ecs.md), [Cape Town release evidence](../docs/launch-cape-town.md).

Nonsecret rollout logs, before/after hash audits, publication and runtime verification snapshots are preserved under `.local/diagnostics/stable-rollout-2026-09-19/`. Commands were the normal `ecs <target> publish`, `deploy`, `verify` and `test`; no ad hoc cloud mutation was needed. Existing profiles require no edits. Native macOS/iPhone browsing acceptance remains separate from the automated client probes.

Provenance limits: official Xray OCI digests plus actual platform/version and mirror identity are verified; upstream disables container attestations and builds the ZIP separately. AWG generated source archives have no independent published checksum: GitHub/HTTPS source identity is recorded, then BuildKit verifies the recorded SHA256 on download. Do not describe these as independently signed artifacts. A changed daemon publishing policy or introduction of GitHub release flags requires review.

Local diagnostic lesson: the synthetic HTTP fixture must wait for REALITY's TLS handshake; a two-second `nc` listener timeout exited prematurely. The final standalone shell fixture has no listener timeout and bounded client probes/cleanup own test lifetime. No production runtime workaround was added. Amnezia September 19 recheck: #2933 remains open, latest release 5.0.1.5; no fixed Mac release identified.

Verification after authenticated transport: full gate passes **125 tests in 20 files**, typecheck, 14 shell / 12 Python syntax checks, ShellCheck/Hadolint and both regional offline synths (`/tmp/ghostline-stable-authenticated-full-test.log`). The complete authenticated stable build passes, including actual ARM64 image/security/restart and both encrypted local tunnel checks (`/tmp/ghostline-stable-authenticated-build.log`). It recorded the September 19 18:26 UTC resolution with unchanged versions, source checksums and image digests. Executable code was unchanged during rollout; each publication reran the exact-image suite, followed by the live checks above. Local Markdown paths, whitespace and disposable-container/RAM-volume cleanup checks pass.

The previous resolver retry hit GitHub's anonymous limit and preserved the validated input file. Anthony then explicitly approved authenticated public metadata reads on September 19. `upstream-download.ts` now uses the existing GitHub CLI login for fixed-host GETs to the reviewed release/tag/commit routes, keeps source/workflow downloads anonymous and disables inherited HTTP debug logging/prompts. No token is retrieved or copied into arguments/logs. The previously rejected action is now authorized, and the full authenticated build succeeded; no approval remains pending. Transport regressions cover approved GETs, anonymous source downloads, rejection of unexpected hosts/routes and suppression of inherited HTTP debug logging.

The stable image work and earlier backlog notes were already dirty when authenticated reads were approved. All work remains unstaged/uncommitted; preserve Anthony's index.

## Regional architecture established — 2026-09-18

Stockholm primary (`stockholm-ecs`) and Cape Town backup (`cape-town`) now use the same AL2023 ARM64 t4g.small ECS gateway. One task/service contains separate Xray/AWG engines and the shared initializer, with two EIPs, protocol-private read-only tmpfs mounts and a common 1126 MiB task budget / 666 MiB ECS reserve. Only the initializer receives server parameters; no task role or engine secret environment exists. Native eligible engine restarts preserve the sibling; fresh tasks rerun initialization. [Runtime](../docs/ecs.md), [images](../docs/images.md), [secrets](../docs/secrets.md).

[Stockholm inventory/evidence](../docs/launch-stockholm-ecs.md) remains unchanged by cleanup: active/parked templates, embedded fixture bytes and all three release identities match the pre-cleanup baseline. Both real encrypted protocols pass; live endpoint/image diffs are clean. Previous cold rebuild, forced replacement, stop/start, eligible engine restart and early-crash replacement evidence still applies.

[Cape Town inventory/evidence](../docs/launch-cape-town.md): host `i-051df0fea044a47a5`, ENI `eni-0c7ebd6fa3f17a3c7`, disk `vol-057899a82b5ffa196`; current task definition `ghostline-cape-town-gateway:3`. Original Xray `16.28.130.178` and AWG `15.240.94.162` plus all six device/server identities are preserved. Only one active host/disk and the original two EIPs remain. Old `GhostlinePoc` stack is deleted, old host terminated, disk/ENI/VPC/SSH key absent.

## Migration and verification

- Both Cape Town protocols pass actual encrypted HTTPS before and after unattended stop/start. Host/disk/IPs and six SecureString version-1 values are unchanged; a fresh task/init restores identical server hashes, private RAM/RO mounts, absent swap/secret environment, native ARM64, bridge/metadata isolation and enforced memory limits. No task OOM events observed.
- Preserved iOS identities separately pass both disposable tunnel tests. Native phone acceptance is not inferred; existing profiles require no edits. Source stack retirement completed only after replacement validation. Both regional endpoint/image diffs are clean.
- AWS's regional AMI publisher account differs in Cape Town; preflight now verifies `--owners amazon` plus Amazon alias/family/architecture. EIP migration uses Retain/import under standard IDs. CloudFormation import cannot add outputs; EIPAssociation creation refuses existing associations, requiring explicit detachment at cutover. These are one-time adoption facts, not alternate deployment code. [Lifecycle](../docs/deployment-lifecycle.md).
- Full gate: 82 tests in 18 files; two regional configurations with endpoint/image stacks each; syntax for 13 shell and 12 Python files; ShellCheck and two Dockerfiles through Hadolint. ARM64 image suite passes exact private rendering, partial-failure cleanup, RO handoff, absent engine secret env and AWG restart. Logs `/tmp/ghostline-cleanup-final-test.log`, `/tmp/ghostline-cleanup-images.log`, `/tmp/ghostline-cape-lifecycle.log`, `/tmp/ghostline-cape-ios-test.log`.
- Final local Markdown links/anchors and whitespace pass; high-confidence credential-pattern scan finds none in maintained files. Private migration evidence: `.local/diagnostics/cape-town-gateway-2026-09-18/`. Protected portable credentials: `.local/recovery/cape-town-ecs/`; current links/QRs: `.local/recovery/cape-town-clients/`.

## Cleanup and next work

Removed retired targets, SSH/Compose provisioners, alternative CPU image paths, installer-specific imports and obsolete tests/docs/drafts. Explicit portable credential import replaces references to retired source targets. Current docs/AGENTS.md describe only the common recipe; independent client/region research and source/license provenance remain.

Stable-release build automation and both regional rollouts are complete as described above. Native browsing acceptance, representative throughput/memory/CPU-credit sizing, released-IP redeploy/profile refresh, expiry policy/controller and coordinated native sleep/wake/IPv6 checks remain in [tasks](tasks.md). LastPass closeout is owner-deferred. No HA, rollback framework or automatic protocol switching is implied.

September 18 GitHub API recheck: Amnezia #2933 remains open (updated September 9, five comments), latest stable 5.0.1.5 (August 21); no fixed Mac build identified. No client upgrade, sleep test or profile change occurred.

## Local and commit state

Native OneXraySE was found connected during probes. Nested tests failed; direct probes passed after authorized disconnect. `scutil --nc start` did not reconnect it, and CUA returned `cgWindowNotFound` for app access. **At migration closeout the Mac VPN remained disconnected with working direct internet; Anthony was asked to reconnect OneXraySE manually.** Commit prep does not change or recheck native connection state. All disposable containers are removed. Do not treat native reconnect failure as server failure.

September 19 rollout: read-only `scutil --nc list` found OneXraySE and ProtonVPN disconnected before testing. No native client settings or connection state were changed; disposable probes preserved laptop routing.

Use Node 24.20.0 and the npm proxy overrides in AGENTS.local.md. Parameter decryption stays inside processes; emit only metadata/hashes/equality. A redundant import-based equality check was rejected by automatic review because import can write; a separate GetParameters-only comparison succeeded with all six exact values and no writes.

The Graviton/RAM, fixture/linter, shared-gateway, cleanup and Cape Town migration work, including commit-prep corrections, is committed as `15f5748` (`Unify regional VPN gateways on Graviton ECS`). The working tree was clean at the following backlog review; this review only updates task/handoff notes.

Pre-commit verification passed 14 targeted tests and the full 82-test gate with typecheck, asset lint and both regional synth configurations (`/tmp/ghostline-commit-prep-2026-09-18.log`). Working-tree whitespace, 28 Markdown files’ local links/anchors and high-confidence credential-pattern checks passed. All three release identities matched the previously tested/deployed artifacts; no cloud or native-client operations were repeated for commit prep.

September 18 backlog review: recommended official-stable image resolution/verification/provenance as the next implementation unit, followed by released-IP rebuild/profile refresh and on-demand lifetime/controller decisions. This is a recommendation, not authorization to begin deployment work. Rechecked upstream pages: Amnezia #2933 remains open with no linked development PR, and latest release remains 5.0.1.5; no fixed Mac build identified. Client acceptance, sizing and owner-deferred recovery tasks remain in the task list.
