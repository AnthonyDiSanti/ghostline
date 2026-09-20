# Handoff

## Current state — September 20, 2026

Ready for commit: the GuardDuty and regional lifecycle work is complete. Commit prep covers all uncommitted implementation, tests and documentation since `db5c372`; leave the index to Anthony. No additional deployment is needed for this work unit. The next separate task is personal-assistant coordination, followed by sizing and on-demand lifetime decisions.

Stockholm (`stockholm-ecs`) remains primary; Cape Town (`cape-town`) remains backup. Both run the common AL2023 ARM64 t4g.small architecture: one host, two EIPs and one ECS task containing Xray, AWG and a shared initializer. Task revision 3 uses Xray stable 26.3.27, AWG daemon 3.1.20260828 and tools 3.1.20260812. Only the initializer receives server secrets; engines mount separate read-only RAM directories with no task role. The task budget / ECS reserve remains 1126 / 666 MiB. [Stockholm inventory](../docs/launch-stockholm-ecs.md), [Cape Town inventory](../docs/launch-cape-town.md).

Both gateways have HEALTHY GuardDuty agent v1.17.1 coverage and AWS defaults plus required Runtime Monitoring. Rollout preserved hosts, disks, interfaces, IPs, task revisions and all six parameter versions per region. Both real encrypted protocols passed through their assigned EIPs in both regions. Anthony accepted native macOS/iPhone browsing through both Stockholm protocols on September 20; automated Cape Town checks do not imply new native-device acceptance.

## Delivered in this commit

- Own GuardDuty telemetry endpoint/SG in each dedicated gateway VPC, with host creation/deletion ordering. Preserve AWS's private DNS/IPv4/account boundary and tighten HTTPS ingress to the host SG. No default VPC, peering, shared detector stack or teardown poller is used.
- Enroll the tagged host automatically using the approved minimal SSM installer permissions; the host still has no Parameter Store read authority.
- Discover regional service/AZ telemetry availability live. Accept confirmed service/runtime gaps while preserving enabled protection; permission/network errors, malformed metadata, contradictory discovery and supported-agent failures remain errors. Keep offline tests explicit and AWS-free.
- Reuse or create the regional detector imperatively. Accept AWS defaults at creation, enable only missing available requirements thereafter, preserve legacy EKS-only protection, and never disable/delete monitoring on teardown. Require exact-host HEALTHY coverage only when runtime is available and compatible. [Final GuardDuty contract](../docs/guardduty.md).
- Resume interrupted stack deletion without stale ECS outputs and inspect server parameter metadata without decrypting credentials during deploy preflight.

## Live evidence and remaining limits

| Exercise | Observed result | Final state |
| --- | --- | --- |
| Northern Virginia | Three cold builds passed both encrypted protocols; two normal teardowns passed after IaC took ownership of telemetry. Final host automatically installed HEALTHY agent v1.17.1. Retained credentials/images survived rebuilds; refreshed profiles changed only endpoints. | Test compute/network/IPs/images/parameters removed; existing monitoring retained. |
| Stockholm / Cape Town | Normal rollout, both protocols, runtime security/memory checks and HEALTHY coverage passed. Fresh London defaults were applied once using each region's live feature list; repeat reconciliation refused writes and passed. | Both production gateways unchanged apart from intended monitoring transport/permissions/settings. |
| London | Fresh detector accepted AWS defaults plus runtime. Both encrypted protocols, runtime checks, automatic HEALTHY coverage, repeat deploy and normal teardown passed. | All test artifacts removed; regional detector retained. |
| Taipei | Fresh deployment and both protocols passed with HEALTHY agent v1.17.1; normal teardown passed. RDS was absent from regional defaults, but Ghostline does not use RDS. | All test artifacts/catalog entry removed; region and detector retained. |
| New Zealand | Detector-only probe accepted AWS defaults plus runtime; fresh, write-refusing repeat reconciliation was unchanged. API advertises disabled EC2/Fargate/EKS agent-management options. | Detector retained; no host, endpoint or task deployed and no agent coverage test. |

All 34 commercial regions visible to this account advertise GuardDuty. No accessible region demonstrated complete service absence or missing EC2 runtime; these paths have explicit simulated regression coverage. China requires a separate partition/account. New Zealand's secondhand Fargate-unavailability report remains unproven: an advertised disabled option is not a tested workload. RDS and AI_ANALYST were absent from its response, not tested through rejected enablement. [New Zealand inventory](../docs/guardduty.md#new-zealand-capability-probe--september-20).

No disposable hosts, disks, VPCs, telemetry endpoints, EIPs, image repositories or regional test parameters remain from Northern Virginia/London/Taipei. Monitoring intentionally remains enabled and can incur charges from other regional activity. The deployment catalog contains only Stockholm/Cape Town.

## Verification and evidence locations

The maintained executable code passed **164 tests in 22 files**, typecheck, fixture syntax/ShellCheck/Hadolint and both maintained offline synth configurations. Log: `.local/diagnostics/guardduty-capabilities-2026-09-20/final-test.log`. The capability change preserved both production active/parked endpoint/image templates exactly; fresh live diffs were clean, and write-refusing production reconciliation retained healthy agents and unchanged settings. These checks are separate from the real tunnel/lifecycle evidence above.

Commit prep reran the complete gate successfully: `/tmp/ghostline-commit-prep-2026-09-20.log` (164 tests). The initial sandboxed attempt reached Hadolint but could not access Docker; the authorized retry passed. Existing explicit AMI/AZ portability warnings remain intentional catalog choices. All 137 local Markdown paths and 25 anchors resolve; whitespace checks pass and no high-confidence credential patterns were found in 36 dirty files. The index fingerprint is unchanged; nothing was staged or committed.

Ignored evidence directories under `.local/diagnostics/`:

- `north-virginia-lifecycle-2026-09-20/`: cold builds, automatic installer, retained identity, release and final cleanup.
- `guardduty-rollout-2026-09-20/`: production rollout and metadata/protocol checks.
- `london-lifecycle-2026-09-20/`: fresh defaults, lifecycle, production alignment and cleanup.
- `guardduty-capabilities-2026-09-20/`: full gate, equivalent templates, clean diffs and no-write production checks.
- `taipei-lifecycle-2026-09-20/`: partial-defaults deployment, encrypted probes, coverage and guarded cleanup.
- `new-zealand-guardduty-2026-09-20/`: prerequisite metadata, absent-detector baseline and enabled-feature/no-write repeat evidence.

Private recovery material remains ignored under `.local/recovery/`; do not print it. Taipei cleanup initially hit an automatic-review block; exact regional ARN/name/version/import-time guards established test-only ownership and cleanup succeeded. No approval remains pending. One-off diagnostic scripts are historical evidence, not maintained deployment entry points.

The common architecture/Cape Town migration and stable image work were committed as `15f5748` and `db5c372`. Their durable evidence remains in the launch records, [images](../docs/images.md) and [lifecycle](../docs/deployment-lifecycle.md); ignored diagnostics are `cape-town-gateway-2026-09-18/` and `stable-rollout-2026-09-19/`. No image rebuild or release-input update is part of this commit prep.

## Next work and local constraints

1. Open a separate personal-assistant task using the [GuardDuty handoff](../docs/guardduty.md#creation-defaults-and-enable-only-updates). Its source declares a detector, but live ownership is unverified. Inspect ownership, deploy/verify Retain before removing a live declaration, then adopt equivalent enable-only reconciliation. No sibling-repo edits/messages have occurred.
2. Measure representative aggregate throughput, RAM and CPU credits, including the GuardDuty agent, before changing instance size or the memory formula.
3. Select permanent/idle/fixed lifetimes, stop/park/release semantics and CLI/phone entry point before implementing the on-demand controller. Existing start/stop and rebuild/release paths are validated. [Ordered backlog](tasks.md).

Coordinate native sleep/wake and IPv6 testing separately; LastPass closeout remains owner-deferred. No HA, automatic protocol failover or new protocol is selected. September 20 commit-prep page check: Amnezia #2933 remains open without a linked development PR; latest release is still 5.0.1.5. No fixed Mac build identified. [Recurring check](tasks.md#recurring-mac-release-check).

All VPN connect/disconnect actions are authorized for current/future tests. Check actual OS routes immediately before direct probes and restore afterward. OneXray can show Connected while OS routing is disconnected; `scutil --nc start` can return success without connecting. Last verified restoration used the app button: OS/app Connected, route utun7, Stockholm egress 51.20.163.146. This is historical evidence, not a current-state guarantee. Commit prep makes no native-client/cloud changes. Use Node 24 and the local npm overrides in AGENTS.local.md.
