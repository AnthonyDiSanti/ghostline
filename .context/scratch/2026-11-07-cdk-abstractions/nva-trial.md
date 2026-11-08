# Northern Virginia initializer trial

**Superseded November 8:** Anthony authorized full NVA/London publisher retirement and a second install from empty NVA state. The first trial runtime/publisher and residuals are fully retired. A later owner request re-enrolled NVA as a maintained endpoint; the original retention/cleanup plan below is historical. [Current work](../2026-11-08-region-retirement/validation.md).

Owner-approved November 7, 2026. Target `nva-init-trial`, `us-east-1a`, stack `GhostlineInitTrial`, prefix `ghostline-init-trial`; common qualified ECS recipe. The ignored catalog is `.local/cdk-abstractions-2026-11-07/nva-catalog.json`; its private catalog applied only to this now-retired trial. No disposable target was added to the maintained catalog.

## Pre-test baseline and publication scope

NVA held intentional `GhostlineRelease` publication infrastructure and seven `ghostline/prod/` repositories, with no gateway host/EIPs/application parameters. All six members are peers: each can originate a release and replicates directly to every other member. NVA and London have explicit retained-member deletion guards, without unique routing/release authority. Gateways pull their local regional images; NVA is outside their browsing path. At that point the intended cleanup preserved publisher-only infrastructure. November 8 owner authorization superseded that plan and retired both publishers, preserving GuardDuty/shared CloudTrail.

## Initialization

The metadata-only reviewed plan is `.local/region-init/nva-init-trial/1e03b44d-2e86-408f-9da7-b493305f31a3.json`. Automatic review initially rejected contact copying before execution; Anthony then explicitly approved copying Stockholm's existing private alert email and necessary NVA test work. Execute created and equality-verified six independent credentials, copied the contact privately and removed temporary credential staging after persisting the complete metadata receipt. Repeating the exact plan before and after endpoint creation reports already-complete, created 0/preserved 6/contact preserved. No rotation or source recopy occurs. Final source gate passes 475 tests/73 files with typecheck, asset lint and fresh offline synthesis.

## Observed launch and validation

- Host slot A: `i-075ca4fd1a22ddc10`, ENI `eni-076c022c8318c3c37`, official ECS-3 ARM64 Bottlerocket 1.66.0 AMI `ami-0334698af14d8bb05`, `t4g.small`. Two in-use encrypted volumes, 2/30 GiB.
- REALITY `52.70.61.235` (`eipalloc-0dd4db9844a7d11ea`); AWG `52.4.46.220` (`eipalloc-08e2ac29fef224961`). Both bind the original slot A interface.
- Standard release activation, regional preflight and fresh diff/deploy pass. Other five publication members show zero changes and prune zero old artifacts. Original Oregon/Stockholm/Zurich hosts and launch times match before/after snapshots.
- Both disposable real clients pass certificate-validated HTTPS through their expected EIPs from immediate direct en0 route checks. Mac routing stays unchanged during these probes.
- Final standard host audit passes configuration/egress hashes, ARM64/SELinux, private read-only RAM, no engine secret environment, confinement/isolation, no swap and memory/no OOM. Independent final readback confirms diagnostics/admin disabled, control non-superpowered and AWS agent enabled.
- Initial deployment times out on GuardDuty No Agent Reporting despite successful AWS installer association/enabled agent. Fresh coverage subsequently becomes HEALTHY v1.17.3 without operator reinstall/restart. Selected agent service readback is active/running, result success/exit 0; its maintained diagnostic cleanup restores lockdown. The first host verifier's later coverage request loses its socket during the approved native route change; the fresh complete verifier passes afterward. Standard deploy resumption is zero-change and succeeds.
- Final release is ready: `sha256:0aca4d364d55bafd8ac093bc0169cbddceb9dc0f4d80c8f94a2778c903f37c9a`, all six actual image identities match; lifecycle active, no operation, no rollout. Gateway revision 1 has desired/running 1 and pending 0. Alert email subscription remains PendingConfirmation.

## Native profiles

Protected exports are `.local/recovery/nva-init-trial-clients/`, directory 0700/files 0600, twelve standard exports plus the display-named import link. OneXray visibly saves `Ghostline NVA trial REALITY`; its non-tunnel availability retest passes at 178 ms after the gateway starts. No native REALITY connection is inferred.

Amnezia visibly saves `Ghostline NVA trial AWG`. Anthony separately approved brief native connection/restoration: app Connected, 1.1.1.1 route utun8, HTTPS exit exactly `52.4.46.220`; app disconnect restores en0 and leaves OneXray/Proton disconnected. Existing saved profiles remain present. Owner practical/destination/leak/sleep-wake acceptance is separate and still pending.

Evidence: ignored `.local/cdk-abstractions-2026-11-07/` initialization, activation, deploy/resume, client-test, security-final, agent/lockdown and release-final records; standard `.local/deployments/nva-init-trial/ecs/{verification,guardduty}.json`. No credential payload is logged. No source/image/protocol/OS upgrade or Git staging/commit/push occurs.

## Superseded cleanup plan

The original endpoint-only cleanup would have preserved the retained publisher. Anthony subsequently authorized full NVA/London retirement instead; ordinary guarded destroy/purge completed that work, and the fresh second trial was also accepted and retired. The [retirement record](../2026-11-08-region-retirement/validation.md) and [maintained NVA launch](../../../docs/launch-nva.md) own current scope. Do not reuse this retired target or its private catalog for maintained operations.
