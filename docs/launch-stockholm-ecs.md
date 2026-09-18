# Stockholm gateway evidence

Primary target `stockholm-ecs`; profile `personal`; account `757999402784`; region `eu-north-1`, AZ `eu-north-1a`. Endpoint stack `GhostlineEcsTrial`, images `GhostlineEcsTrialImages`, resource prefix `ghostline-ecs-stockholm`. These are stable cloud identities for the common [gateway recipe](ecs.md).

One ECS-optimized AL2023 ARM64 `t4g.small`, AMI `ami-06a77ee974da159b5`, encrypted 30 GiB gp3. ECS agent 1.106.2, Docker 25.0.16. Current host `i-0e591a05b9eac9221`, ENI `eni-04f7468459396df35`, disk `vol-04400b40a19db4f2b`.

| Protocol | EIP | Allocation | Private address |
| --- | --- | --- | --- |
| Xray | `51.20.163.146` | `eipalloc-079db1eebf4b5cc78` | `10.79.0.11` |
| AWG | `16.16.73.146` | `eipalloc-07627e295d844e8de` | `10.79.0.10` |

Original client identities and existing primary profiles remain valid. Anthony accepted both iOS ARM64 protocols on September 15; the current recovery evidence below uses real automated clients. Mac REALITY uses OneXraySE, AWG uses Amnezia. Repeated sleep/wake remains separate in [client stability](mac-client-stability.md).

## Shared gateway task — 2026-09-18

Anthony approved consolidating the regional runtime while retaining the existing separate engine images. The primary now uses service/family `ghostline-ecs-stockholm-gateway`: one essential Xray container, one essential AWG container, and one nonessential initializer. Both engines wait for initialization success. Each has a native 60-second restart eligibility policy; the initializer has none. One 2 MiB host tmpfs exposes only the appropriate protocol directory read-only to each engine. The task's enforced budget is 1,126 MiB, with 666 MiB reserved from ECS scheduling and no separate engine memory ceilings.

Only the initializer receives the two server parameters; no task IAM role or engine secret environment exists. The shared initializer tag is `sha-61a1a395b892e21c25eb6179942ef639d325d45395f6c2f624da440a4e95ea94`, digest `sha256:cba49d2f4752a5bee81182c2245d87d09c5af32c1d4c1ed806a628a377cab5e2`. Xray release `sha-7a85259e169537e2bf38995425b5a297e2e72451f07da38c7fdee433ed331e52`, digest `sha256:96e356574d4de2e4c6f9dea2ff79a9e4dc439558df73a38eefd8192553c9f367`; AWG release `sha-85df0db151107552ff01243b7831ecf5f168336e7ad5870d9a8f92a490c564c0`, digest `sha256:73d62dfeff88e9b7d95cd9c7e625c024d2343855bd11aac10152184c659823d0`. Shared resources use System=shared; engine/EIP tags remain protocol-specific.

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
