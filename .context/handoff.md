# Handoff

## Current state — one regional architecture, 2026-09-18

Stockholm primary (`stockholm-ecs`) and Cape Town backup (`cape-town`) now use the same AL2023 ARM64 t4g.small ECS gateway. One task/service contains separate Xray/AWG engines and the shared initializer, with two EIPs, protocol-private read-only tmpfs mounts and a common 1126 MiB task budget / 666 MiB ECS reserve. Only the initializer receives server parameters; no task role or engine secret environment exists. Native eligible engine restarts preserve the sibling; fresh tasks rerun initialization. [Runtime](../docs/ecs.md), [images](../docs/images.md), [secrets](../docs/secrets.md).

[Stockholm inventory/evidence](../docs/launch-stockholm-ecs.md) remains unchanged by cleanup: active/parked templates, embedded fixture bytes and all three release identities match the pre-cleanup baseline. Both real encrypted protocols pass; live endpoint/image diffs are clean. Previous cold rebuild, forced replacement, stop/start, eligible engine restart and early-crash replacement evidence still applies.

[Cape Town inventory/evidence](../docs/launch-cape-town.md): host `i-051df0fea044a47a5`, ENI `eni-0c7ebd6fa3f17a3c7`, disk `vol-057899a82b5ffa196`, task definition `ghostline-cape-town-gateway:2`. Original Xray `16.28.130.178` and AWG `15.240.94.162` plus all six device/server identities are preserved. Only one active host/disk and the original two EIPs remain. Old `GhostlinePoc` stack is deleted, old host terminated, disk/ENI/VPC/SSH key absent.

## Migration and verification

- Both Cape Town protocols pass actual encrypted HTTPS before and after unattended stop/start. Host/disk/IPs and six SecureString version-1 values are unchanged; a fresh task/init restores identical server hashes, private RAM/RO mounts, absent swap/secret environment, native ARM64, bridge/metadata isolation and enforced memory limits. No task OOM events observed.
- Preserved iOS identities separately pass both disposable tunnel tests. Native phone acceptance is not inferred; existing profiles require no edits. Source stack retirement completed only after replacement validation. Both regional endpoint/image diffs are clean.
- AWS's regional AMI publisher account differs in Cape Town; preflight now verifies `--owners amazon` plus Amazon alias/family/architecture. EIP migration uses Retain/import under standard IDs. CloudFormation import cannot add outputs; EIPAssociation creation refuses existing associations, requiring explicit detachment at cutover. These are one-time adoption facts, not alternate deployment code. [Lifecycle](../docs/deployment-lifecycle.md).
- Full gate: 82 tests in 18 files; two regional configurations with endpoint/image stacks each; syntax for 13 shell and 12 Python files; ShellCheck and two Dockerfiles through Hadolint. ARM64 image suite passes exact private rendering, partial-failure cleanup, RO handoff, absent engine secret env and AWG restart. Logs `/tmp/ghostline-cleanup-final-test.log`, `/tmp/ghostline-cleanup-images.log`, `/tmp/ghostline-cape-lifecycle.log`, `/tmp/ghostline-cape-ios-test.log`.
- Final local Markdown links/anchors and whitespace pass; high-confidence credential-pattern scan finds none in maintained files. Private migration evidence: `.local/diagnostics/cape-town-gateway-2026-09-18/`. Protected portable credentials: `.local/recovery/cape-town-ecs/`; current links/QRs: `.local/recovery/cape-town-clients/`.

## Cleanup and next work

Removed retired targets, SSH/Compose provisioners, alternative CPU image paths, installer-specific imports and obsolete tests/docs/drafts. Explicit portable credential import replaces references to retired source targets. Current docs/AGENTS.md describe only the common recipe; independent client/region research and source/license provenance remain.

Official-stable release automation remains selected but unimplemented; engine inputs are unchanged. Representative throughput/memory/CPU-credit sizing, released-IP redeploy/profile refresh, expiry policy/controller and coordinated native sleep/wake/IPv6 checks remain in [tasks](tasks.md). LastPass closeout is owner-deferred. No HA, rollback framework or automatic protocol switching is implied.

September 18 GitHub API recheck: Amnezia #2933 remains open (updated September 9, five comments), latest stable 5.0.1.5 (August 21); no fixed Mac build identified. No client upgrade, sleep test or profile change occurred.

## Local and commit state

Native OneXraySE was found connected during probes. Nested tests failed; direct probes passed after authorized disconnect. `scutil --nc start` did not reconnect it, and CUA returned `cgWindowNotFound` for app access. **At migration closeout the Mac VPN remained disconnected with working direct internet; Anthony was asked to reconnect OneXraySE manually.** Commit prep does not change or recheck native connection state. All disposable containers are removed. Do not treat native reconnect failure as server failure.

Use Node 24.20.0 and the npm proxy overrides in AGENTS.local.md. Parameter decryption stays inside processes; emit only metadata/hashes/equality. A redundant import-based equality check was rejected by automatic review because import can write; a separate GetParameters-only comparison succeeded with all six exact values and no writes.

All earlier Graviton/RAM, fixture/linter and shared-gateway work remains uncommitted alongside cleanup and Cape Town migration. Anthony has staged the full work unit. Preserve that user-owned snapshot; any commit-prep corrections remain unstaged for review. Propose one commit covering the entire dirty state; the agent has not staged, unstaged or committed.

Commit-prep review (September 18): inspected all 126 staged entries, with no pre-existing unstaged or untracked work. Removed extra EOF blank lines from four new TypeScript/test files and corrected the handoff/task wording about user staging and last-observed VPN state. These six working-tree corrections remain unstaged; the user's index is preserved. Targeted checks passed 14 tests; fresh `npm test` passed all 82 tests plus typecheck, asset lint and both regional synth configurations (`/tmp/ghostline-commit-prep-2026-09-18.log`). Working-tree whitespace, all 28 Markdown files' local links/anchors and high-confidence credential-pattern checks pass. Three image release identities still match the already tested/deployed artifacts; reviewed prior image, tunnel, lifecycle and clean-diff evidence without repeating cloud or native-client operations. No functional commit blocker found; recorded native-device/client follow-ups remain separate.
