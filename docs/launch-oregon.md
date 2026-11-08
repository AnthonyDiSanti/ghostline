# Oregon gateway evidence

Selected Miami primary target `oregon`; profile `personal`; account `757999402784`; region `us-west-2`, AZ `us-west-2a`. Endpoint stack `GhostlineOregon`, first host stack `GhostlineOregon-Host-a`, resource prefix `ghostline-oregon`. Uses the common [gateway recipe](ecs.md), with no new runtime images or protocol choices.

## First launch — November 5, 2026 (New York)

Shared stack creation and first activation completed. Host `i-0e07edd529d7a8430` runs official ECS-3 ARM64 Bottlerocket `1.66.0-1ad6b4a4`, regional AMI `ami-014019f8497d4b260`, on `t4g.small`. The gateway service reports one desired/running task, zero pending, task definition `ghostline-oregon-gateway:1`. The first-activation observer verified bootstrap, healthy network daemon and the fresh six-image gateway generation before starting monitoring enrollment.

| Protocol | EIP | Allocation | Slot A private address |
| --- | --- | --- | --- |
| Xray / REALITY | `32.188.31.172` | `eipalloc-075af7b37a9216baf` | `10.79.0.11` |
| AmneziaWG | `54.190.232.225` | `eipalloc-08b80c5161fb8a2a6` | `10.79.0.10` |

Release activation seeded qualified schema-v4 production document `sha256:0aca4d364d55bafd8ac093bc0169cbddceb9dc0f4d80c8f94a2778c903f37c9a` plus its three retained history releases and enrolled Oregon in the five-member replication set. NVA and London remain retained members; existing gateway regions retain their credentials. Six new independent Oregon server/device values were generated, imported as Standard SecureStrings and verified by the normal conflict-refusing importer. Protected Mac/iOS native profiles, URI files and QRs are under ignored `.local/recovery/oregon-clients/`, twelve files with mode 0600 in a 0700 directory. Both devices' exported endpoints match the allocated IPs; no credential values enter this record.

Immediately before real-client checks, macOS reported OneXraySE/ProtonVPN disconnected and both endpoint/test-IP routes used `en0`. Standard `ecs oregon test` passed real encrypted HTTPS through Xray and AWG with the corresponding expected EIPs, leaving laptop routing unchanged. This is disposable-client connectivity evidence, not native phone, application import, sleep/wake, latency or destination-site acceptance.

## Runtime coverage and security verification

GuardDuty was created with accepted AWS defaults plus Runtime Monitoring. The host has `GuardDutyManaged=true`; AWS's `AmazonGuardDuty-ConfigureRuntimeMonitoringSsmPlugin` command returned Success. Read-only Bottlerocket settings show `amazon-guardduty-agent` enabled at official ARM64 version `1.17.3`; admin and Ghostline diagnostics remained disabled and control remained non-superpowered. The exact host's coverage initially stayed `No Agent Reporting` through the standard ten-minute gate, so `ecs oregon deploy` exited unsuccessfully after functional activation and retained its deployment claim for normal resumption.

A fresh read-only coverage check then returned **HEALTHY**, agent `v1.17.3`, updated at `2026-11-06T00:55:37Z`. No operator installation retry, host change, security relaxation or timeout suppression was needed. Selected CloudTrail metadata confirms successful AWS-agent image authentication/download actions with no reported API errors; raw requests/responses and credentials were not emitted. The standard `ecs oregon deploy` resumed with the original receipt and completed successfully without host replacement. Final readback shows the original first host running, release ready, lifecycle `active` with no operation, and the regional detector ENABLED. Stockholm's park also completed, retaining its original IPs and unchanged credential metadata. Oregon's new SNS email subscription awaits recipient confirmation.

A targeted attempt to briefly enable the maintained privileged diagnostic boundary for AWS-agent service-status inspection was initially rejected by automatic approval review because explicit authorization was required. That attempt made no host change. Anthony explicitly approved temporary diagnostics and restoration of lockdown on November 7, and the standard `ecs oregon verify` subsequently passed. The working gateway was not torn down or monitoring disabled on the original coverage timeout.

## Approved host security audit — November 7, 2026

The standard verifier passed native ARM64, enforcing SELinux, protocol configuration hashes matching Parameter Store, each engine's assigned EIP egress, protocol-private read-only tmpfs, absent engine secret environments, daemon/engine confinement and host/bridge/peer isolation. Swap is disabled; the task enforces 1,126 MiB, with 602 MiB ECS reserve plus 64 MiB daemon, and no task OOM events were observed. GuardDuty remains HEALTHY on the original host `i-0e07edd529d7a8430`, agent `v1.17.3`.

The verifier's `finally` cleanup disabled Ghostline diagnostics and checked admin disabled plus non-superpowered control before credential comparison and coverage checks. A separate read-only host-container query at `2026-11-07T10:06:29Z` independently confirmed diagnostics/admin disabled, control enabled/non-superpowered and the official GuardDuty host agent enabled. No deployment, reboot, credential change or device reconfiguration occurred. This closes the deployment's host-audit item; native-device acceptance and the separate zero-log/privacy work remain distinct.

Evidence: ignored `.local/oregon-security-verify-2026-11-07.log`, `.local/oregon-lockdown-2026-11-07.json` and `.local/deployments/oregon/ecs/{verification,guardduty}.json`. No runtime/infra code changed during this audit; the existing 447-test full local gate was not rerun. Documentation/link and dirty-state checks cover the closeout edits.

## Native Mac import attempt — November 7, 2026

The protected phone QR/profile files were rechecked and linked to the owner. Oregon was absent from OneXraySE's saved server list; Stockholm, Cape Town and the retired Ireland trial remained. Servers → Add server → Import file repeatedly left the modal unchanged, consistent with the earlier October importer stall. Native coordinate input failed with `noWindowsAvailable`; no Oregon entry was created.

AmneziaVPN's native file picker successfully loaded `macos-awg.conf` into its New connection confirmation. The only final action offered was Connect. Before that action, OneXraySE/ProtonVPN reported disconnected and the test-IP route used direct `en0`. Automatic approval review rejected Connect because it changes routing, and separately rejected launching TextEdit as a credential clipboard handoff for OneXray because of exposure/persistence risk. Neither rejected action executed. Existing profiles and cloud resources were preserved. No profile content or QR image was emitted in tool output.

Anthony subsequently reported OneXray became unusable and required force quitting; no diagnostic evidence establishes the cause. At his request, manual import steps were supplied and the existing `macos-xray.vpn` file path was copied to his clipboard with equality verification. No credential content was copied. Owner-led import completion and both native Mac profiles remain unconfirmed; do not resume the failed OneXray automation or infer a successful native connection.

## Saved Mac profiles confirmed — November 8

During the maintained NVA setup, OneXray visibly listed `Ghostline Oregon REALITY` and Amnezia listed `Ghostline Oregon AWG` at the expected `54.190.232.225` endpoint. This closes the earlier saved-profile presence gap. Existing Oregon entries were preserved while NVA was added. No native Oregon connection or fresh Oregon device/privacy/sleep-wake test was performed in that workflow; the November 7 failed automation above remains historical attempt evidence.

## Initialization correction and local gates

The first deployment attempt was refused before endpoint creation because initial release-infrastructure setup defaulted a new lifecycle to `active`; a queued image event then held a failed release claim while the endpoint stack did not exist. New-region lifecycle initialization now stays inactive (`parked`) until successful explicit deployment completes it as `active`, preserving existing regions' modes. A focused regression covers release setup, denied background activation and later deliberate activation. A one-time recovery verified account, absent endpoint/slot stacks, zero hosts and absent activation/rollout/runtime journals, then used the normal version-checked completion primitive to restore inactive intent. The standard deployment then performed first activation; no exclusion or security bypass was introduced.

Focused lifecycle/activation checks passed 27 tests. Full Node 24 `npm test` passed typecheck, asset syntax/ShellCheck/Hadolint, fresh three-region offline synthesis and 447 tests in 71 files. Publication reused the already qualified image selection without rebuilding. Upstream Amnezia #2933, core-kit #1059/PR #1063 and Bottlerocket #4954 remained open at the November 5 watch; no official bootstrap repair or IPv6 qualification is claimed.

Nonsecret evidence: ignored `.local/oregon-{activate,diff,deploy,deploy-resume,client-test,initialization-tests,final-status}.log`, `.local/oregon-initialization-recovery.json`, `.local/oregon-rollout-final.json` and `.local/deployments/oregon/`. AWS events fall on November 6 UTC while this work occurs November 5 in New York.
