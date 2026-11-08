# Northern Virginia maintained endpoint

Active additional proximity endpoint from Miami, requested November 8, 2026. Oregon remains primary, Stockholm/Zurich remain active for testing and Cape Town remains parked. NVA stays deployed after validation; the earlier disposable trial's cleanup authorization does not apply to this maintained gateway.

Target `nva`, account `757999402784`, region `us-east-1`, AZ `us-east-1a`, stack `GhostlineNva`, resource prefix `ghostline-nva`. Use the maintained catalog and common [ECS recipe](ecs.md), with no `GHOSTLINE_CATALOG` override or retained-publisher exception.

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

Thirteen protected exports/import files live under ignored `.local/recovery/nva-clients/`, directory 0700/files 0600. These are optional local copies, not a new backup requirement. The new alert subscription is **PendingConfirmation**; recipient confirmation is still required before notification delivery is established.

Four other maintained-region snapshots match before/after exactly: stack outputs/status, host IDs/launches, EIP bindings, disks/encryption, credential metadata and selected release. NVA/London GuardDuty settings and adequate shared CloudTrail coverage also match exactly. London remains retired. No security setting was relaxed and no Git staging/commit/push occurred.

Targeted checks pass 58 tests; full Node 24 gate passes 476 tests/73 files, including typecheck, asset syntax/ShellCheck/Hadolint and fresh five-region offline synthesis. Runtime artifacts were reused from central qualification. All three upstream watches were checked at enrollment and closeout; no repaired Mac build, official bootstrap replay/recovery fix or bridge IPv6 support was qualified.

Evidence: ignored `.local/nva-maintained-2026-11-08/`, especially `activate.log`, `endpoint-diff.log`, `deploy.log`, `deploy-resume.log`, `security-verify.log`, `client-test.log`, `release-final.json`, `region-final.json`, before/after continuity/security metadata, `agent-inspection/`, independent identity hashes and `native-*.json`. Standard host evidence remains `.local/deployments/nva/ecs/`.
