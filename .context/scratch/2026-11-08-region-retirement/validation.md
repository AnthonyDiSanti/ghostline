# Publisher retirement and fresh NVA validation

Historical trial record: Anthony subsequently requests a maintained NVA endpoint. Consult [the maintained launch](../../../docs/launch-nva.md); do not run regional purge against re-enrolled NVA.

November 8, 2026. Anthony authorized full NVA/London publisher retirement and removal of the first NVA trial/credentials, followed by a fresh NVA install. Preserve GuardDuty/shared CloudTrail and four maintained exits. Owner validation and the agreed post-validation retirement completed; the two initially pending AWS deletion records also disappeared, as recorded below. No publisher is retained.

## Retirement and source

Both standard destroys reached complete/pending empty. London residual inventory is zero across parameters, logs, queues and task definitions. NVA purge removed seven parameters, four log groups, one queue and two task definitions; AWS's asynchronous task deletion subsequently completed. No old runtime, image, credential or task record was reused. Optional local exports remain protected, outside the regional purge contract.

Maintained publication is Stockholm/Cape Town/Oregon/Zurich, with no retained origins. Defaults now use only supplied gateway peers and no implicit publisher pair. Regression tests retain explicit membership/deletion protection while allowing retired NVA/London to be used for tests. Final full gate: 475 tests/73 files, typecheck, asset checks and fresh offline synth. All four existing-region CDK release diffs are zero-change, and their before/after stack/host/launch/EIP/disk/credential/release snapshots match. Independent GuardDuty/CloudTrail configuration also matches before/final exactly.

## Fresh install

Private catalog: `.local/retire-publishers-2026-11-08/fresh-catalog.json`. Target `nva-fresh-trial`, stack `GhostlineFreshTrial`, prefix `ghostline-nva-fresh`. That absolute `GHOSTLINE_CATALOG` applied only to this now-retired trial; the maintained deployable catalog has no temporary target. The private active mesh includes NVA as an unretained fifth peer.

Read-only initialization found no endpoint, host or parameters. Execution created/equality-verified six independent identities and copied the already-approved Stockholm alert contact. All 12 checked identity fields differ from the retired trial. A completed-plan retry after deployment preserves all six/contact with no rotation or source recopy. New registry/history was seeded directly from Stockholm, without either retired publisher.

Actual host `i-0e754a743ff8eca11`, ENI `eni-05e07eb2109554c50`, `t4g.small`, official ECS-3 ARM64 Bottlerocket 1.66.0 AMI `ami-0334698af14d8bb05`. REALITY `100.62.225.244`; AWG `52.6.2.198`. Release `sha256:0aca4d364d55bafd8ac093bc0169cbddceb9dc0f4d80c8f94a2778c903f37c9a` is ready; all six actual images match, lifecycle active without operation/rollout, gateway desired/running 1 and pending 0.

First deploy completed functional activation but its GuardDuty gate timed out on an AWS installer/prerequisite association error. Fresh exact-host coverage later became HEALTHY v1.17.3 without operator reinstall/restart. Standard resumption passed without changing the host. The last SSM association still records Failed; its cause is not established, and this is not evidence that the association succeeded. Runtime coverage and final host audit pass.

Final verifier passes configuration/egress hashes, ARM64/SELinux, private read-only RAM, no engine secret environments, confinement/isolation, no swap and memory/no OOM, with administrative lockdown restored. Both disposable real encrypted clients pass certificate-validated HTTPS through the exact expected EIPs from immediate direct en0/native-disconnected checks. No new native physical-client privacy/sleep-wake acceptance is inferred.

## Local profiles

Exports: `.local/recovery/nva-fresh-trial-clients/`, directory 0700/files 0600; twelve standard exports plus `nva-fresh-reality.txt`. OneXray visibly saves `Ghostline NVA fresh REALITY`, availability 260 ms. After automatic review initially blocked removal, Anthony explicitly approved OneXray entry deletion; only the retired `Ghostline NVA trial REALITY` was removed, preserving three maintained regional nodes.

Amnezia's missing window and native file-picker confirmation blocked automation. Anthony completed the import manually, left it named `Server 1`, connected and validated it, then disconnected. He also reports validating the fresh OneXray connection. These are owner-reported practical results; no additional leak/sleep-wake qualification is inferred. The retired AWG profile has not been deleted and no deletion consent is inferred from the OneXray approval.

## Next and evidence

Owner acceptance is complete. Standard `destroy nva-fresh-trial` reached complete with pending empty. It removed the exact fresh host, two disks/two EIPs, four stacks/seven repositories and NVA mesh membership. Reviewed purge removed all seven trial parameters, four logs and one queue. Fresh post-purge inventory reports only two task-definition records in `DELETE_IN_PROGRESS`: `ghostline-nva-fresh-gateway:1` and `ghostline-nva-fresh-network:1`. These are non-runnable asynchronous AWS deletion records, not a complete empty-region result. At that checkpoint, the next step was a later metadata readback. The final scoped check below completed it; region-scoped purge is now inappropriate because maintained NVA is active. London final residual inventory is empty.

All four maintained-region snapshots match before/after exactly, including hosts/launches, addresses/bindings, volumes/encryption, credential metadata, stack status/outputs and selected release. Post-purge GuardDuty feature/enrollment configuration and adequate shared CloudTrail coverage in NVA/London match before exactly. Local NVA profiles/exports remain outside cloud cleanup and are now retired; no local profile deletion/rename or routing action occurred this turn. The deleted NVA notification stack no longer needs email confirmation. No source/runtime/image/OS upgrade, monitoring reduction, Git stage/commit/push or LastPass access occurred.

Final cleanup evidence adds `fresh-destroy.log`, `fresh-purge-reviewed.json`, `fresh-purge-execute.log`, `fresh-post-purge-plan.json`, `london-final-empty-plan.log`, `continuity-cleanup-before.json`/`continuity-cleanup-after.json` and `security-cleanup-before.json`/`security-cleanup-after.json` under the ignored evidence directory. The exact cleanup journal is `.local/deployments/nva-fresh-trial/regional-cleanup.json`.

The source gate remains 475 tests/73 files; no executable source changed during owner acceptance/cleanup. Final documentation verification resolves 561 local Markdown links, with clean diff whitespace and zero credential-payload pattern matches in all pending additions/untracked files. All three upstream issue/PR watches and latest releases were rechecked at this transition: no qualified repair or IPv6 support change. User index remains untouched.

Evidence is ignored `.local/retire-publishers-2026-11-08/`, including reviewed destroy/purge inventories, security/continuity before/final snapshots, independent identity comparison, activation, deploy/resume, final host/security, client-test and release-state results. Standard host evidence is `.local/deployments/nva-fresh-trial/ecs/`.

[AWS task-definition deletion guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-definition-state.html) explains the observed asynchronous deletion records: non-runnable records can persist for up to one hour after stopped tasks or 24 hours after deleted deployments/task sets. Use it to distinguish pending metadata from live resources; do not claim completed removal while records remain.

## Latest cleanup readback

2026-11-08 14:08 UTC: fresh standard purge plan still reports zero parameters/logs/queues and exactly two `DELETE_IN_PROGRESS` task definitions. Active application-resource absence passed the plan guards. AWS metadata deletion has not completed; no repeat delete was issued. Evidence: `.local/retire-publishers-2026-11-08/nva-cleanup-recheck.{log,json}`.

## Historical cleanup finalization after maintained re-enrollment

Final scoped reads during the maintained NVA launch find zero `ghostline-nva-fresh` task definitions in ACTIVE, INACTIVE and DELETE_IN_PROGRESS. The disposable trial's metadata cleanup is complete. NVA now has a new maintained gateway, so do not use region-scoped purge as a follow-up. See `.local/nva-maintained-2026-11-08/region-final.json` and the [new launch](../../../docs/launch-nva.md).
