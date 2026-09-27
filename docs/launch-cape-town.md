# Cape Town gateway evidence

Backup target `cape-town`; profile `personal`; account `757999402784`; region `af-south-1`, AZ `af-south-1a`. Endpoint stack `GhostlineCapeTown`, release repositories `GhostlineRelease`, resource prefix `ghostline-cape-town`. It uses the same [gateway recipe](ecs.md) as Stockholm, with independent regional images and credential parameters.

One official ECS-3 Bottlerocket ARM64 `t4g.small`, version `1.66.0-1ad6b4a4`, AMI `ami-08d7677b7fb19b172`, encrypted 2 GiB OS and 30 GiB data disks. Current host `i-03d4e6e915a94d94c`, ENI `eni-09f3256b8de20342b`. `GhostlineRelease` supplies separate bootstrap and network-daemon images alongside the three application images and authoritative OCI release document.

| Protocol | Preserved EIP | Allocation | Private address |
| --- | --- | --- | --- |
| Xray | `16.28.130.178` | `eipalloc-09b530775698d23bb` | `10.79.0.11` |
| AWG | `15.240.94.162` | `eipalloc-0d22c628c5fde384e` | `10.79.0.10` |

## Coordinated platform release — 2026-09-26

Cape Town migrated first through the normal retained-IP park/unpark path after central Ireland qualification. Both original allocations/endpoints and every preexisting `/ghostline/prod/` parameter version/timestamp match the captured baseline. Actual bootstrap, daemon and application digests match the complete local release. Existing profiles require no edits.

Both encrypted REALITY/AWG HTTPS probes pass through the original EIPs with direct Mac en0 routes. Private read-only RAM, absent engine secret environments, configuration hashes, memory and bridge isolation pass; diagnostics/admin are disabled and GuardDuty v1.17.1 is HEALTHY. The official OS remains subject to the explicitly accepted #1059 startup limitation and bounded controlled-boot recovery; it is not a patched OS. [Qualification](bottlerocket-trial.md), [policy](platform.md).

Evidence: `.local/coordinated-release/september26-cape-town-continuity.json`, `.local/deployments/cape-town/ecs/`, and `/private/tmp/ghostline-september26-cape-clients.log`. Stockholm migration and legacy-resource retirement are tracked independently in the handoff.

## Bottlerocket production promotion — 2026-09-22

After Stockholm passed, normal target-scoped park/unpark replaced the old host and VPC resources while retaining both original EIPs. All six server/client parameter versions/timestamps and the three application image selections are unchanged. Private config-hash comparisons and real encrypted REALITY/AWG HTTPS checks passed through the original endpoints. Existing device profiles need no edits.

The new host passes native ARM64, enforcing SELinux, engine/daemon confinement, read-only private RAM, absent engine secret environments, no swap and host/metadata/peer isolation. The task remains limited to 1,126 MiB, with 602 MiB ECS reserve plus 64 MiB for the network daemon. GuardDuty v1.17.1 is HEALTHY. Verification disables temporary diagnostics and checks administrative lockdown before returning.

The first local client attempt failed before creating a tunnel because Docker lacked regional ECR authorization. The maintained test command now authenticates privately and fetches actual deployed digests before using its short probe timeout; both protocols then passed. Final CDK diff is clean, the live platform guard accepts unchanged settings and rejects a changed AMI, and release reconciliation returns `already-running` without redeployment. A subsequent dependency-only correction preserves management IPs until daemon deletion; direct-update readback confirms it without replacing the host, gateway task or daemon task. No new native iPhone or sleep/wake acceptance is claimed.

Platform image: `ghostline/platform/host@sha256:106cae158df489c3168722175cb82f11237049cf8658f18fd0e99ddb391c7b3c`. [Update/lifecycle contract](platform.md). Evidence: `.local/bottlerocket/promotion-cape-town.json`, `production-promotion-audit.json`, `.local/deployments/cape-town/ecs/{verification,guardduty}.json`, `/tmp/ghostline-promote-cape-town.log` and `/tmp/ghostline-cape-town-clients-retry.log`.

## Fresh initializer release — 2026-09-21

Current production is `65dc6a00-595a-4493-9601-cffc2de80a7e`, document `sha256:b591df0898e0a46d255e22203a6a883df27bc033404bfb964dd8c9ba4cf10b3a`. A small initializer improvement limits each renderer's inherited environment to its own protocol bundle. Central qualification passed the synthetic regression, both encrypted protocols and configuration/security checks before publishing from Virginia. Stable upstream versions are unchanged; this does not change credential values or the existing IAM/container boundary.

Native replication triggered one automatic regional deployment; CloudTrail confirms its force-only request. The rollout completed on task revision **4**, with expected image digests and unchanged endpoint/host/ENI/EIP and server-parameter metadata. Repeat reconciliation returns `already-running`. All four regions retain the same current release plus two prior distinct releases, with temporary publication aliases removed. Fresh endpoint diff was clean. Evidence: `.local/releases/initializer-hardening/final-audit.json`, `force-evidence.json` and `reconcile-completed.log`. No regional/native-device browsing tests were repeated. Anthony subsequently confirmed the SNS subscription; commit-prep readback verifies its confirmed ARN. The original message was found in Gmail Spam. No operational test email was sent.

## Global release migration — 2026-09-21

Task revision **4** now uses static local `ghostline/prod/{xray,awg,gateway-config}:keep-production` references, explicit version consistency and native ECS circuit-breaker rollback. `GhostlineRelease` owns repositories/history/automation independently of the endpoint. The old per-target image stack and its three repositories were removed after consumer/export/ownership checks. [Release contract](releases.md).

The same two previously qualified image sets were published from London and Virginia. Both automatic deployments completed, retained task revision 4 and produced no duplicate deployment on reconciliation. At migration completion, global production was `d045bc56-a6ac-4192-9bfa-b7f8501bd0b6`, document `sha256:3951dc8b90b20639fbc116749786f788773182c23faec46be706fc73dcf49f06`; MRU1 retains the other accepted set. Protocol versions remain Xray 26.3.27, AWG daemon 3.1.20260828/tools 3.1.20260812.

Final audit confirms stable expected running digests, identical stack outputs/host/ENI/EIPs and unchanged server parameter metadata. Existing client profiles need no change. No engine build, tunnel or native-device qualification was repeated. Endpoint CDK diff is clean. Regional event/hourly gates and logging audit trail are active; SNS email confirmation was subsequently verified during commit prep. Evidence: `.local/releases/migration/final-audit.json`, publication/reconciliation logs and `cleanup.json`.

## GuardDuty rollout — 2026-09-20

Later the same day, Anthony authorized alignment with freshly observed AWS defaults from London. Enabled S3 protection, EKS audit logs, EBS malware protection, RDS protection and Lambda protection; foundational protection and Runtime Monitoring stayed enabled. AI Protection and fleet-wide agent management remain off, matching observed defaults; the live regional response does not expose AI Analyst. No feature was disabled. Host/disk/IP/task and all six parameter versions/timestamps remain unchanged. Evidence: `.local/diagnostics/london-lifecycle-2026-09-20/`; [policy](guardduty.md).

Regional detector `094c09ce8d854e7cb7e0eaad0b0b876c` enables foundational protection and Runtime Monitoring. Optional plans/fleet-wide agent management started off; the host inclusion tag automatically installed agent **v1.17.1**, and exact-host coverage became **HEALTHY**. Installer success preceded coverage by several minutes. No manual installation or reboot was needed.

`GhostlineCapeTown` owns available private-DNS endpoint `vpce-081c4552f6a8c9348` and its security group in dedicated VPC `vpc-05f04553befa389fe`. The common stack restricts endpoint access to this account and HTTPS ingress to the host SG. Regional protection has no application CloudFormation owner and persists through teardown. [Contract](guardduty.md).

The first detector request rejected unavailable `AI_ANALYST`, even though its requested initial value was disabled. The ordinary deployment retry succeeded with no additional infrastructure diff. Creation was subsequently simplified to accept AWS defaults for future regions, removing the regional flag matrix. Cape Town's existing settings are preserved. Both endpoint/image diffs were clean at rollout; repeat reconciliation performs no writes and reconfirms healthy coverage.

Both real REALITY/AWG HTTPS probes pass through the original EIPs after automatic installation, with native VPN disconnected and direct en0 routes checked immediately beforehand. Metadata-only comparison confirms unchanged host, disk, ENI, EIPs, task revision and all six SecureString versions/modification timestamps. Existing private exports supplied client tests; this rollout retrieved no Parameter Store values. Evidence is under `.local/diagnostics/guardduty-rollout-2026-09-20/` and `.local/deployments/cape-town/ecs/guardduty.json`. Existing profiles require no edits; no new native iOS or sleep/wake acceptance is inferred.

## Stable image rollout — 2026-09-19

The September 19 task definition was `ghostline-cape-town-gateway:3`. Xray now runs official stable **26.3.27**, replacing prerelease 26.7.28. AWG daemon **3.1.20260828** and tools **3.1.20260812** retain their upstream versions in the newly verified source build. The initializer is unchanged. [Build and publication policy](images.md).

| Artifact | Release tag | Regional manifest digest |
| --- | --- | --- |
| Xray | `sha-2ea9b5b6f68e06647e990d1da7b77d64e2527f819c23258f0f94351a837cbc7e` | `sha256:79f798b6a130132414c45773bc039e9e51b9694f2dd5ddf99083353ece168f48` |
| AWG | `sha-1339ec17dad7cc59b18803242eaea973c28272286e8341dd66566779c01c891a` | `sha256:2ed3c8d36f2f8d00640783331a1520639ab6cdcf06bdbdd950655c63570d44ef` |
| Initializer | `sha-61a1a395b892e21c25eb6179942ef639d325d45395f6c2f624da440a4e95ea94` | `sha256:ef60c0c75cca83a1894a6cf8f33b239bbc20fcb6c8ac2760746d09e3329df886` |

The exact regional artifacts passed local encrypted tunnel and initializer/security checks before publication. Deployment followed Stockholm's successful live checks and changed only engine image references and the task revision. Both real encrypted HTTPS/assigned-EIP tests and runtime configuration, private read-only tmpfs, environment, isolation and memory checks pass. The service has one running task, no pending tasks and successful shared initialization; the running image digests match ECR. Endpoint and image-stack diffs are clean.

Before/after comparison confirms all stack outputs and all six SecureString values/versions are unchanged, including the original host, ENI and EIPs. No task OOM events occurred. Nonsecret evidence is under `.local/diagnostics/stable-rollout-2026-09-19/`. Existing profiles require no edits; native device browsing and sleep/wake are separate acceptance checks.

## Migration — 2026-09-18

Anthony explicitly included Cape Town in the architecture cleanup. The selected host is ECS-optimized AL2023 ARM64 `t4g.small`, AMI `ami-0898c17379c2509bd`, encrypted 30 GiB gp3, ECS agent 1.106.2 and Docker 25.0.16. AWS's publisher account differs from Stockholm; preflight verifies the Amazon owner alias and image family/architecture.

| Protocol | Preserved EIP | Allocation | Gateway private address |
| --- | --- | --- | --- |
| Xray | `16.28.130.178` | `eipalloc-09b530775698d23bb` | `10.79.0.11` |
| AWG | `15.240.94.162` | `eipalloc-0d22c628c5fde384e` | `10.79.0.10` |

Existing macOS/iOS identities were normalized into the portable six-file import directory under protected `.local/recovery/cape-town-ecs/`. Xray UUID/REALITY keys and AWG keys/PSKs/obfuscation match the preserved server configurations. All six regional SecureStrings were created and round-trip verified without exposing values. Original endpoints and protocol identities remain unchanged; this is not credential rotation.

Both original protocols passed real encrypted HTTPS/assigned-exit checks from disposable clients before cutover. Earlier nested probes while OneXraySE was connected timed out; direct probes succeeded after native disconnect. No native mobile acceptance of the new runtime is claimed from these tests.

The two EIPs were retained, detached from the source stack's ownership and imported under standard `xrayAddress` / `awgAddress` logical IDs. The first active deployment correctly refused existing old associations. CloudFormation rolled it back; explicitly detaching those associations allows the unmodified common template to own the new bindings. Import cannot add outputs; the active deployment adds the standard outputs. No compatibility mode or migration provisioner remains in maintained code. [Migration contract](deployment-lifecycle.md#replacement-and-validation).

The September 18 host was `i-051df0fea044a47a5`, ENI `eni-0c7ebd6fa3f17a3c7`, root disk `vol-057899a82b5ffa196`. Migration completed on task definition `ghostline-cape-town-gateway:2`; the current revision is recorded above. Initial deployment and unattended stop/start both pass runtime verification and real encrypted protocol tests. The old source stack and its host/network are retired.

The running gateway enforces the 1126 MiB shared task budget and 666 MiB ECS scheduling reserve. Both protocol files match their preserved Parameter Store values, live read-only on private tmpfs mounts, and run natively as ARM64 with no engine secret environment or task role. Host swap is disabled; bridge/metadata isolation and each assigned EIP’s egress pass. No task OOM events were observed.

Private migration evidence lives in `.local/diagnostics/cape-town-gateway-2026-09-18/`; server/client values and links remain outside git. LastPass updates are owner-deferred. Current launch evidence replaces historical installation instructions; git history retains earlier approaches.

## Migration validation and inventory — 2026-09-18

- Stop/start preserved host, disk, ENI, both original allocations and all six parameter values/versions. The task changed from `6f47fb437bac4a20a9a487b4ba1a2fe1` to `e5f557aa55d346f9a5615d96bf6aa9e6`; the shared initializer reran and exited zero. Both protocol file hashes remained identical and both engines passed their encrypted HTTPS checks afterward.
- The preserved iOS Xray and AWG credentials separately passed real disposable-client HTTPS tests through their original EIPs. This verifies credentials and server compatibility, not the physical iPhone app. Existing profiles need no endpoint or credential edits.
- A final read-only Parameter Store comparison confirmed six exact values, all SecureString version 1. Cost tags and CloudFormation EIP ownership match the new stack. Endpoint and image-stack diffs are clean.
- The original source stack is `DELETE_COMPLETE`; old instance `i-017247cce7d2bf84f` is terminated. Its disk, ENI, VPC and SSH key are absent. Cape Town has exactly one active Ghostline host, one encrypted root volume, two original EIPs and one running gateway task. No temporary EIPs were allocated.

All three content release tags match Stockholm. Current manifest digests are recorded above. Local builds are not claimed byte-identical across regional publication; [image provenance](images.md) defines the distinction.
