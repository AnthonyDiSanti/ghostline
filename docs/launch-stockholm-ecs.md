# Stockholm gateway evidence

Primary target `stockholm-ecs`; profile `personal`; account `757999402784`; region `eu-north-1`, AZ `eu-north-1a`. Endpoint stack `GhostlineEcsTrial`, images `GhostlineEcsTrialImages`, resource prefix `ghostline-ecs-stockholm`. These are stable cloud identities for the common [gateway recipe](ecs.md).

One ECS-optimized AL2023 ARM64 `t4g.small`, AMI `ami-06a77ee974da159b5`, encrypted 30 GiB gp3. ECS agent 1.106.2, Docker 25.0.16. Current host `i-0e591a05b9eac9221`, ENI `eni-04f7468459396df35`, disk `vol-04400b40a19db4f2b`.

| Protocol | EIP | Allocation | Private address |
| --- | --- | --- | --- |
| Xray | `51.20.163.146` | `eipalloc-079db1eebf4b5cc78` | `10.79.0.11` |
| AWG | `16.16.73.146` | `eipalloc-07627e295d844e8de` | `10.79.0.10` |

Original client identities and existing primary profiles remain valid. Anthony accepted both iOS ARM64 protocols on September 15; the current recovery evidence below uses real automated clients. Mac REALITY uses OneXraySE, AWG uses Amnezia. Repeated sleep/wake remains separate in [client stability](mac-client-stability.md).

## GuardDuty rollout — 2026-09-20

Later the same day, Anthony authorized alignment with freshly observed AWS defaults from London. Enabled S3 protection, EKS audit logs, EBS malware protection, RDS protection and Lambda protection; foundational protection and Runtime Monitoring stayed enabled. AI plans and fleet-wide agent management remain off, matching the observed defaults. No feature was disabled. Host/disk/IP/task and all six parameter versions/timestamps remain unchanged. Evidence: `.local/diagnostics/london-lifecycle-2026-09-20/`; [policy](guardduty.md).

The normal deployment created regional detector `b50ec1bd775944d0b304467602bba9c7` with foundational protection and Runtime Monitoring enabled. Optional plans and fleet-wide agent management started off; the host's inclusion tag automatically installed agent **v1.17.1**, and exact-host coverage became **HEALTHY**. Installer success preceded coverage by several minutes; service diagnostics reported active/running with no failure. No manual installation or reboot was needed.

`GhostlineEcsTrial` owns available endpoint `vpce-04e52c0730b7572aa` and its security group inside dedicated VPC `vpc-090e08936b99e19e2`. Private DNS, the account-restricted endpoint policy and HTTPS ingress from the host SG are configured by the common stack. Regional protection has no application CloudFormation owner and persists through teardown. [Contract](guardduty.md).

Both real encrypted REALITY/AWG HTTPS probes pass through their original EIPs after rollout, with OneXray disconnected and direct en0 routes checked immediately beforehand. This is automated client evidence, not a new sleep/wake test. Regional deployment, coverage and metadata audit artifacts are under `.local/diagnostics/guardduty-rollout-2026-09-20/` and `.local/deployments/stockholm-ecs/ecs/guardduty.json`.

The final endpoint/image diff is clean. Metadata-only comparison confirms unchanged host, disk, ENI, EIPs, task revision and all six SecureString versions/modification timestamps. No Parameter Store values were retrieved for this audit; existing private client exports supplied the tunnel checks.

## Stable image rollout — 2026-09-19

The current task definition is `ghostline-ecs-stockholm-gateway:3`. Xray now runs official stable **26.3.27**, replacing prerelease 26.7.28 under the selected stable-only policy. AWG daemon **3.1.20260828** and tools **3.1.20260812** retain their upstream versions; the new recipe resolves and verifies their source inputs. The initializer release is unchanged. [Build and publication policy](images.md).

| Artifact | Release tag | Regional manifest digest |
| --- | --- | --- |
| Xray | `sha-2ea9b5b6f68e06647e990d1da7b77d64e2527f819c23258f0f94351a837cbc7e` | `sha256:79f798b6a130132414c45773bc039e9e51b9694f2dd5ddf99083353ece168f48` |
| AWG | `sha-1339ec17dad7cc59b18803242eaea973c28272286e8341dd66566779c01c891a` | `sha256:517118d3a299210635a4a384fa224de39a21d4b48849facfd0304a8878031b2c` |
| Initializer | `sha-61a1a395b892e21c25eb6179942ef639d325d45395f6c2f624da440a4e95ea94` | `sha256:cba49d2f4752a5bee81182c2245d87d09c5af32c1d4c1ed806a628a377cab5e2` |

Publication passed exact-artifact local encrypted tunnel and initializer/security checks before pushing. The reviewed CDK change replaced only engine image references and the task revision. After deployment, both real encrypted HTTPS/assigned-EIP tests and live configuration, private read-only tmpfs, environment, isolation and enforced-memory checks pass. No task OOM events were observed. Physical-device browsing and sleep/wake remain separate acceptance checks; profiles require no edits.

The service has one running task, no pending tasks and successful shared initialization; its image digests match ECR. All stack outputs and all six parameter values/versions match the pre-rollout baseline, including the host, ENI and both original EIPs. Endpoint and image-stack diffs are clean. Nonsecret evidence is under `.local/diagnostics/stable-rollout-2026-09-19/`.

September 20: Anthony confirmed native macOS and iPhone checks pass through Stockholm over both protocols and accepted this as sufficient device validation for the image rollout. This does not claim a new coordinated sleep/wake or IPv6 test.

## Shared gateway task — 2026-09-18

Anthony approved consolidating the regional runtime while retaining the existing separate engine images. The primary now uses service/family `ghostline-ecs-stockholm-gateway`: one essential Xray container, one essential AWG container, and one nonessential initializer. Both engines wait for initialization success. Each has a native 60-second restart eligibility policy; the initializer has none. One 2 MiB host tmpfs exposes only the appropriate protocol directory read-only to each engine. The task's enforced budget is 1,126 MiB, with 666 MiB reserved from ECS scheduling and no separate engine memory ceilings.

Only the initializer receives the two server parameters; no task IAM role or engine secret environment exists. Shared resources use System=shared; engine/EIP tags remain protocol-specific. Current image identities are recorded above.

IAM shutdown ordering retains host authority through termination and execution authority through service deletion. A full park completed unattended in about 133 CDK-reported seconds; its rebuild took about 263 seconds. No credential import, manual installation or engine republishing was needed. Stop waits for actual task termination before stopping EC2.

| Validation | Observed result |
| --- | --- |
| Cold restoration | Both real encrypted clients pass; server hashes, private RO tmpfs, absent swap/engine secret environment, bridge isolation, assigned EIPs and the actual parent cgroup memory limit pass |
| Mature AWG crash | Same container/task recovered in 2.57 seconds; Xray and initializer unchanged; all five real Xray HTTPS probes succeeded |
| Mature Xray crash | Same container/task recovered in 2.46 seconds; AWG and initializer unchanged; all four real AWG HTTPS probes succeeded |
| Early repeated AWG crash | Whole task replaced; both engine identities changed and fresh shared initialization exited zero |
| Ordinary forced deployment | Fresh task and successful initializer; exact unchanged engine releases, server security/config checks and both real HTTPS tunnels pass |
| Host stop/start | Same host/disk/IPs return; a fresh task reruns initialization, restores private RAM configuration and passes both real encrypted HTTPS tunnels plus memory/security checks |

With both encrypted clients present, 15 rounds through both protocols succeeded. The sampled task used about 14.1 MiB and had a 15.7 MiB lifetime peak; host available memory was about 1,372 MiB. No task limit/OOM events or host OOM kills occurred. PSI averages were zero at observation, with small nonzero cumulative stall totals (about 33 ms some / 28 ms full). These are light browsing-like requests, not throughput, CPU-credit or device-capacity benchmarks. Cache charging differs from earlier samples; no consolidation memory saving or optimal size is inferred.

Private, nonsecret diagnostics are under `.local/diagnostics/gateway-2026-09-18/`. The deployment passed its full local gate and actual image tests, including partial-failure cleanup and AWG in-place restart. Current cleanup verification is recorded in the handoff. Existing profiles remain valid; this gateway deployment did not change native client profiles or exercise sleep/wake. Protocol health probes for a running-but-broken engine remain absent.

Final audit: host `i-0e591a05b9eac9221`, encrypted 30 GiB gp3 `vol-04400b40a19db4f2b`, ENI `eni-04f7468459396df35`; task definition `ghostline-ecs-stockholm-gateway:2`, one desired/running gateway task and no pending task. Only the final tagged primary host/root volume remains. The original EIPs/allocation IDs and all six parameter hashes/versions match the pre-change baseline. Cost tags match Project=ghostline, Environment=prod and the existing System dimensions. Both endpoint and image stack diffs are clean.

ECS reports 1,180 MiB schedulable memory after the 666 MiB reserve and 54 MiB remaining after placing the 1,126 MiB task. Those are placement counters, not physical free memory. The final stopped/started task is fresh and both protocol files still match Parameter Store exactly. All disposable clients were cleaned up. No new native iOS or sleep/wake acceptance is claimed.

## Architecture cleanup regression — 2026-09-18

Removal of obsolete recipes leaves Stockholm’s active/parked synthesized templates (including user-data bytes) and all three release identities exactly equal to a pre-cleanup baseline. No Stockholm cloud deployment was required. Both real encrypted protocol probes pass from the direct local connection. Initial probes while OneXraySE was connected failed for both regions; disconnecting the enclosing native tunnel restored direct-path success. Run disposable tests without nesting a native VPN.
