# Cape Town gateway evidence

Backup target `cape-town`; profile `personal`; account `757999402784`; region `af-south-1`, AZ `af-south-1a`. Endpoint stack `GhostlineCapeTown`, images `GhostlineCapeTownImages`, resource prefix `ghostline-cape-town`. It uses the same [gateway recipe](ecs.md) as Stockholm, with independent regional images and credential parameters.

## Stable image rollout — 2026-09-19

The current task definition is `ghostline-cape-town-gateway:3`. Xray now runs official stable **26.3.27**, replacing prerelease 26.7.28. AWG daemon **3.1.20260828** and tools **3.1.20260812** retain their upstream versions in the newly verified source build. The initializer is unchanged. [Build and publication policy](images.md).

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

Current host `i-051df0fea044a47a5`, ENI `eni-0c7ebd6fa3f17a3c7`, root disk `vol-057899a82b5ffa196`. Migration completed on task definition `ghostline-cape-town-gateway:2`; the current revision is recorded above. Initial deployment and unattended stop/start both pass runtime verification and real encrypted protocol tests. The old source stack and its host/network are retired.

The running gateway enforces the 1126 MiB shared task budget and 666 MiB ECS scheduling reserve. Both protocol files match their preserved Parameter Store values, live read-only on private tmpfs mounts, and run natively as ARM64 with no engine secret environment or task role. Host swap is disabled; bridge/metadata isolation and each assigned EIP’s egress pass. No task OOM events were observed.

Private migration evidence lives in `.local/diagnostics/cape-town-gateway-2026-09-18/`; server/client values and links remain outside git. LastPass updates are owner-deferred. Current launch evidence replaces historical installation instructions; git history retains earlier approaches.

## Migration validation and inventory — 2026-09-18

- Stop/start preserved host, disk, ENI, both original allocations and all six parameter values/versions. The task changed from `6f47fb437bac4a20a9a487b4ba1a2fe1` to `e5f557aa55d346f9a5615d96bf6aa9e6`; the shared initializer reran and exited zero. Both protocol file hashes remained identical and both engines passed their encrypted HTTPS checks afterward.
- The preserved iOS Xray and AWG credentials separately passed real disposable-client HTTPS tests through their original EIPs. This verifies credentials and server compatibility, not the physical iPhone app. Existing profiles need no endpoint or credential edits.
- A final read-only Parameter Store comparison confirmed six exact values, all SecureString version 1. Cost tags and CloudFormation EIP ownership match the new stack. Endpoint and image-stack diffs are clean.
- Source stack `GhostlinePoc` is `DELETE_COMPLETE`; old instance `i-017247cce7d2bf84f` is terminated. Its disk, ENI, VPC and SSH key are absent. Cape Town has exactly one active Ghostline host, one encrypted root volume, two original EIPs and one running gateway task. No temporary EIPs were allocated.

All three content release tags match Stockholm. Current manifest digests are recorded above. Local builds are not claimed byte-identical across regional publication; [image provenance](images.md) defines the distinction.
