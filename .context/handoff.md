# Handoff

## Current state — 2026-09-13

- **Stockholm ECS is the primary exit; official XTLS migration is complete.** Cape Town stays running on its validated Ubuntu/Compose runtime as the stable backup and was not targeted. [Commands/architecture](../docs/ecs.md), [regional evidence](../docs/launch-stockholm-ecs.md).
- Target `stockholm-ecs`, endpoint stack `GhostlineEcsTrial`, durable image stack `GhostlineEcsTrialImages`, account `757999402784`, profile `personal`, region `eu-north-1`. Historical target/stack names are intentional; `stockholm` is the retired Ubuntu recipe and credential-source identity.
- Current host `i-0f0dc651c312542c2`, ENI `eni-0c03f6d8ff213a20c`, encrypted 30 GiB gp3 `vol-0aaf612e214bd4b9d`. Xray `51.20.163.146` / `eipalloc-079db1eebf4b5cc78`; AWG `16.16.73.146` / `eipalloc-07627e295d844e8de`. Both services desired/running one, pending zero.
- One stock ECS AL2023 x86_64 t3.small, two bridge services/EIPs, immutable ECR and six regional SecureStrings. No SSH key, NAT gateway, load balancer or autoscaler. Project=ghostline, Environment=prod and System=shared/xray/amneziawg tagging remains consistent; the initializer repository uses System=xray.
- The old Ubuntu Stockholm `GhostlinePoc` stack/host/disk/ENI/EIPs were retired during the 2026-09-12 cutover. Do not treat it as live or re-run its launch commands. [Retirement evidence](../docs/launch-stockholm-ecs.md#primary-cutover-and-mac-profiles--2026-09-12).

## Completed official-image work

- Mirrors the unmodified official XTLS 26.7.28 amd64 image; ECR manifest exactly matches upstream `sha256:d7911c19a283acdc57e171ae0e3bd49ab4c29db14e2ab9274aa97132dd3ca3b9`. Publishes a separate pinned Alpine 3.24.1/jq initializer. AWG image/protocol settings are preserved. [Image design/provenance](../docs/xray-images.md).
- Only the network-disabled, one-shot initializer receives the Xray bundle. It writes an ECS task-scoped Docker local volume on encrypted EBS, directory/file modes 0700/0400 owned by 65532:65532. The non-root engine starts after initializer success and reads that mount read-only. AWG retains its tmpfs startup adapter. RAM-backed rendered Xray configuration is explicitly deferred.
- Server verification uses host Python in the exact engine network namespace, selected Docker metadata and hashes through `/proc`; it needs no shell/tools inside Xray. Fixed the AL2023 Python 3.9 `socket.timeout` distinction and added a regression. Host DNS resolves the diagnostic address; this check alone does not establish container DNS behavior.
- Passed 102 tests, four offline synths and six AWS-free Docker image cases, including exact private handoff/non-root port 443 and five invalid-input failures without credential output or partial files. Final endpoint/image CDK diff: no differences. Final checks passed all 153 local Markdown links and a live-credential-value scan across 98 git-visible files plus the staged diff; whitespace is clean.
- Passed unattended stop/start and retained-IP cold rebuild with stdin closed. All six credential values/versions, EIPs/tags and published images matched baseline. No republish, import, SSH, manual installation or repair occurred. Both server/isolation checks and real encrypted HTTPS/assigned-IP probes passed after each restoration.
- Removed preceding ECS host `i-0ccd265f182b32daf`, its disk `vol-05348498adf9b9730` and ENI `eni-07b6ab15aaa75d982`. Parking left only two tracked EIPs and CDK metadata. Old task storage disappeared with the removed disk; normal delayed task-volume cleanup on a retained host was not separately timed and is not secure erasure.
- Final redacted live audit proved initializer exit zero/no networking/CHOWN-only added capability, initializer-only secret injection and the same private local volume mounted read-only by Xray. Evidence: `.local/diagnostics/xtls-migration-2026-09-13/`.

## Device state and immediate next work

- Anthony confirmed both **existing iPhone profiles work after migration**; no imports or credential changes were needed. Native Mac REALITY passed exact exit `51.20.163.146` and HTTPS 200.
- Automation later lost the Mac app window. Anthony reports a configd crash, prolonged spinning beach ball and hard restart, with previous occurrences; he suspects intermittent sleep while connected to Amnezia. This remains an unverified cause, not an established XTLS regression. After restart direct internet returned to `5.195.76.221`.
- Anthony then explicitly authorized remaining connect/disconnect tests while keeping the Mac awake. Guarded native AWG passed three DNS/HTTPS/exact-exit rounds and nine pings. The local watchdog/cleanup disconnected it and restored direct egress. Final UI: **Stockholm REALITY selected, VPN disconnected**. Both Cape Town profiles remain intact; no persistent client settings changed.
- **Pause to touch base now, then investigate the Mac crash as the next work unit.** Task `01M2D00GJ5HE1591CYW6KSFVV1` in [tasks](tasks.md): inspect crash/configd/panic reports and sleep/wake timeline, establish versions/protocol/connection state, and evaluate alternate clients if evidence implicates Amnezia without a reliable fix. No sleep reproduction, crash-log analysis or client reset has been performed in this work unit. [Relevant client knowledge/recovery limitations](knowledge/amnezia.md).

## Remaining architecture/recovery scope

- RAM-backed rendered config: explicit task `01M2DA6YG0BA1GD47ZCMKBEWRX`; preserve Parameter Store as durable source. Shared host tmpfs files are a candidate, not process-memory persistence or separate container-local tmpfs. Verify mount lifetime, swap and cleanup when implementing it.
- [Packaging/sizing assessment](../docs/ecs.md#packaging-assessment--2026-09-12): retain separate services/containers on the one host/two EIPs. No measured consolidation saving or downsizing result exists. Engines account for 768 MiB of scheduler memory plus the new 64 MiB initializer; actual use is unmeasured. Graviton/Bottlerocket, full release/fresh-address profile handling and optional lifetime/controller scope remain in tasks.
- Anthony explicitly keeps Cape Town unchanged until the primary architecture is settled, then upgrades it separately. Consult its launch record before any later operation; its legacy client-export normalization and regional parameter import are deferred.
- Six parameters remain under `/ghostline/prod/{server,clients/...}`. Generated client exports render live endpoints over preserved source identities; raw parameter profiles may contain historical addresses. [Secrets](../docs/secrets.md), protected exports `.local/recovery/stockholm-ecs-clients/`.
- Anthony explicitly deferred LastPass backup until architecture refinement is complete. Preserve local recovery material and regional parameters; do not request repeated interim vault updates.

## Local execution and commit state

- Follow `AGENTS.local.md`: Node 24.20.0, cache `/tmp/ghostline-npm-cache`, omit only unsupported npm proxy duplicates. AWS/Docker require sandbox escalation. Run disposable clients with the native VPN disconnected. The inspected daemon recovery API is AWG-specific and does not disconnect Xray.
- Anthony explicitly approves decrypting Parameter Store values **only if raw values never enter the context window**. Keep them in local/remote verification processes; emit only selected metadata, hashes or equality results. Diagnostic artifacts exclude plaintext parameter values; protected recovery/profile files remain confidential.
- Use `npm run ecs stockholm-ecs <action>` for ECS; `park` retains tracked EIPs and `destroy` releases them. Images/parameters outlive endpoint removal. Explicit ECS deploy performs preflight and fresh diff/deploy without terminal prompts.
- This implementation started with uncommitted stable-backup, packaging/sizing/image assessment and RAM-follow-up documentation. The complete diff includes those prior edits plus implementation, deployment evidence and the Mac crash follow-up. No staging or commit was performed; preserve the user's index.
