# Northern Virginia maintained endpoint

Active additional proximity endpoint from Miami, requested November 8, 2026. Oregon remains primary, Stockholm/Zurich remain active for testing and Cape Town remains parked. NVA stays deployed after validation; the earlier disposable trial's cleanup authorization does not apply to this maintained gateway.

Target `nva`, account `757999402784`, region `us-east-1`, AZ `us-east-1a`, stack `GhostlineNva`, resource prefix `ghostline-nva`. Use the maintained catalog and common [ECS recipe](ecs.md), with no `GHOSTLINE_CATALOG` override or retained-publisher exception.


## Credential delivery adopted — November 18, 2026 (New York)

Current qualified release is `sha256:5e2731f3523b75340b39df164f714f1260dd2301c3aa293fb18ccf74ca741257` on slot B host `i-035e59d348346a321`, ENI `eni-057b9c16d43ff8f80`, official ECS-3 ARM64 Bottlerocket 1.66.0. Native ECS deployment is SUCCESSFUL, rollout complete with zero health failures, one running gateway host and two encrypted attached disks. Original Xray/AWG endpoint allocations and all nine parameter metadata records are unchanged. Standard blue-green source-host/disk/network/temporary-address cleanup is complete; original active automation is restored with no trial/lifecycle/local-operation receipt.

The shared initializer retrieves Xray/AWG/DERP identities directly into RAM through exact shared task-role permissions and private stdin rendering. Native scans find zero tested protocol/task-credential matches across complete/stable Docker metadata, ECS checkpoint, containerd metadata and ECS-log stores. All four engine namespaces block credentials, initializer authority is withdrawn, and fixed missing-credential failure cleanup passes. Full security/configuration, both real encrypted VPN clients, public pinned DERP/STUN and exact-host GuardDuty HEALTHY v1.17.3 pass. Diagnostic/admin disabled and control non-superpowered are verified. Existing identities/profiles need no changes; no rotation or shared protection-policy change occurred. [Fleet proof and limitations](../.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md).

## DERP/STUN migration accepted — November 17, 2026 (New York)

At DERP acceptance, slot A host was `i-05773fa514d0e5141`, ENI `eni-0b9a33703e4a2bdba`, official ECS-3 ARM64 Bottlerocket 1.66.0 AMI `ami-0334698af14d8bb05`; gateway revision 2 runs qualified schema-v5 release `sha256:89ebce02a6f9ca9791fbba9213149573fc0766b9808ea70bef7affef97f052f2`. Native ECS completed SUCCESSFUL at `2026-11-18T00:02:11.965Z` with zero recorded health failures. Standard blue-green handoff, bake and source cleanup returned to one host and the two original EIPs: Xray `32.193.23.120`, AWG `184.196.132.0`.

DERP TCP 443 and STUN UDP 3478 reuse the AWG address with admission restricted to the approved AWS probe exits. Native private-RAM/confinement verification and fresh exact-host GuardDuty HEALTHY v1.17.3 pass. Both disposable encrypted VPN clients pass HTTPS through the original EIPs; pinned public TLS, two-client relay and STUN pass through Oregon, and non-admitted relay/STUN/internal-port access is denied. All nine parameter metadata records, EIP allocations and protection settings are preserved. The controller is restored active with no operation/trial remaining.

Evidence: `.local/derp-implementation-2026-11-17/nva-{deploy,verify,clients,public}-seven.log`, `nva-denial-seven.json`, `final-continuity.json` and `final-live-audit.json`. [Common evidence limits and native Mac route checks](derp-poc.md#qualification-and-acceptance) apply; native Headscale/Tailscale clients and uninterrupted sessions are later qualification.

## Initialization and release preparation

The prior trial's infrastructure, images, credentials, logs and queue were removed before this launch. Two old `ghostline-nva-fresh` task definitions were still non-runnable in AWS deletion progress at entry; final scoped readback across all three statuses now finds zero old-family records. Distinct maintained names and independently generated credentials avoid reuse. This is not first-time account security or region opt-in initialization.

Reviewed initializer plan `95008d44-cebb-48e9-8664-294150807ef0` found no endpoint, host or current parameters, then created/equality-verified six fresh identities and copied Stockholm's alert contact using existing NVA approval. Twelve checked identity fields differ from the retired fresh trial. Completed-plan retry after deployment reports already-complete, preserves all six/contact and performs no rotation or recopy. Parameter Store owns current identities; protected temporary staging was removed.

Standard release activation seeded qualified production plus three prior releases directly from Stockholm, reconciled the five-member full mesh and enabled NVA's controller. Four existing release-stack diffs were zero-change and pruned zero artifacts. NVA's initial cleanup deferred until stable runtime observations existed. No new protocol/image/OS selection was published; selected schema-v4 six-image document remains `sha256:0aca4d364d55bafd8ac093bc0169cbddceb9dc0f4d80c8f94a2778c903f37c9a`.

Post-activation preflight verified `t4g.small` offering and official ECS-3 ARM64 Bottlerocket 1.66.0. The reviewed diff created only `GhostlineNva`. Standard deployment created shared networking first, then host slot A and gateway revision 1. An earlier premature preflight saw missing repositories, and a premature export saw an updating stack; both were retried only after their prerequisite stage completed. Neither timing error is reported as a passing check.

## Observed runtime and security

Host `i-0d404aca56acb51dd`, ENI `eni-09fce9d207c5b2bc7`, launched `2026-11-08T14:35:00Z` on official AMI `ami-0334698af14d8bb05`, `t4g.small`, ARM64 Bottlerocket 1.66.0. Actual encrypted disks are 2 GiB OS and 30 GiB data. Gateway desired/running 1, pending 0, deployment completed. Final release is ready; all six actual image identities match, lifecycle active (version 7), without an operation or pending rollout.

| Protocol | Endpoint | Allocation | Slot A private address |
| --- | --- | --- | --- |
| Xray / REALITY | `32.193.23.120:443` | `eipalloc-03ef520375dc18f0f` | `10.79.0.11` |
| AmneziaWG | `184.196.132.0:443` | `eipalloc-06a0576596fe9698e` | `10.79.0.10` |

The initial ten-minute GuardDuty gate timed out after SSM reported an architecture/prerequisite association error. Selected inspection found the official host agent enabled/superpowered at v1.17.3, with an earlier successful installer command followed by a failed association execution. Actual exact-host coverage subsequently became HEALTHY v1.17.3 without an operator reinstall/restart, host replacement or monitoring toggle. Standard unchanged deployment resumption completed successfully on the same host. The association error's root cause remains undiagnosed; healthy coverage does not establish that the failed command succeeded. [Bottlerocket-specific AWS guidance](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-assess-coverage-bottlerocket-ecs-ec2.html).

Full host verification passes configuration hashes, protocol-specific egress, ARM64/SELinux, read-only protocol-private RAM, absent engine secret environments, confinement/bridge isolation, no swap and memory/no OOM. Limits are 1,126 MiB task, 602 MiB ECS reserve plus 64 MiB daemon. Temporary diagnostics were disabled and administrative lockdown verified before the coverage wait.

## Local clients and continuity

Both isolated real encrypted clients pass certificate-validated HTTPS through their assigned EIPs, without changing laptop routing. Immediately preceding app/OS checks showed disconnected native clients and direct `en0` routes to the test IP and both endpoints.

OneXray visibly saves **Ghostline NVA REALITY**; Amnezia visibly saves **Ghostline NVA AWG**. Native imports succeeded through the file picker's Where folder hierarchy, selecting the exact maintained file URL and Open; no owner file-picker intervention was needed. Existing profiles remain intact. Both actual native connections independently passed certificate-validated HTTPS with the correct protocol EIP and `utun8` traffic routing. Each disconnect restored the original direct `en0` route and public egress. Final app state is disconnected in both clients; OneXray's pre-test automatic selection is restored with four candidates and All via VPN, while Amnezia has NVA selected. No additional destination, throughput, leak, IPv6, iOS or sleep/wake qualification is inferred.

Thirteen protected exports/import files live under ignored `.local/recovery/nva-clients/`, directory 0700/files 0600. These are optional local copies, not a new backup requirement. The alert subscription remained **PendingConfirmation** after the owner reported NVA confirmation. A November 8 scoped reconciliation verified its unchanged deployed topic/contact identity and requested a fresh confirmation for the current subscription. The November 8 readback showed exactly one pending email subscriber; the November 15 confirmation below supersedes that checkpoint. No application-alert delivery test is claimed.

Four other maintained-region snapshots match before/after exactly: stack outputs/status, host IDs/launches, EIP bindings, disks/encryption, credential metadata and selected release. NVA/London GuardDuty settings and adequate shared CloudTrail coverage also match exactly. London remains retired. No security setting was relaxed and no Git staging/commit/push occurred.

Targeted checks pass 58 tests; full Node 24 gate passes 476 tests/73 files, including typecheck, asset syntax/ShellCheck/Hadolint and fresh five-region offline synthesis. Runtime artifacts were reused from central qualification. All three upstream watches were checked at enrollment and closeout; no repaired Mac build, official bootstrap replay/recovery fix or bridge IPv6 support was qualified.

Evidence: ignored `.local/nva-maintained-2026-11-08/`, especially `activate.log`, `endpoint-diff.log`, `deploy.log`, `deploy-resume.log`, `security-verify.log`, `client-test.log`, `release-final.json`, `region-final.json`, before/after continuity/security metadata, `agent-inspection/`, independent identity hashes and `native-*.json`. Standard host evidence remains `.local/deployments/nva/ecs/`.

## Confirmation renewal — November 15

The owner requested new confirmation emails after the prior requests timed out. Fresh readback found no email subscriber on this region's current alert topic. Scoped reconciliation verified the unchanged deployed subscription identity and saved contact, requested a fresh confirmation and verified exactly one pending email subscription. The owner subsequently confirmed the renewed message. Independent November 15 SNS readback verifies exactly one confirmed email subscriber and zero pending subscriptions, matching all five maintained regions. No application-alert delivery test or VPN/template change occurred. Metadata-only receipts are ignored `.local/alert-repair-2026-11-15/{plan,result,confirmed}.json`.


## Quiet logging release — November 17, 2026

Native ECS blue-green completed on slot `b`, host `i-0118416c97626b88d`, ENI `eni-0c91402868e2806a4`, AMI `ami-0334698af14d8bb05`, actual Bottlerocket `1.66.0`, boot `026647fd-f4b0-4910-89d8-78c2717e6386`. The source host is terminated and exactly one owned host runs. Both encrypted protocol HTTPS checks, full runtime/security verification and bounded count-only log checks pass. Diagnostic/admin lockdown is restored; GuardDuty remains HEALTHY v1.17.3. Original endpoint allocation/IP fingerprints and all credential/contact parameter versions/timestamps are preserved. No new physical-device acceptance is claimed.

Release `sha256:a9ee9cfbc8a10b008e5e456d15f7713289def2184bd71e77de77f68c00d04cd7`, promotion `c660910d-017e-4dc6-83a3-be5b1eb84ca4`. [Cross-region evidence](../.context/scratch/2026-11-17-zero-logs-release/README.md). Known application access/query output is suppressed; two initializer bundle values remain in persistent Docker metadata.
