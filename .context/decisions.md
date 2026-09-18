# Current decisions

Superseded architectures and retired deployment recipes belong in git history. These entries record decisions that still constrain current work.

## 2026-09-18 — One maintained regional architecture

Anthony selected one ECS gateway task/service on AL2023 Graviton ARM64, with separate unchanged Xray/AWG engine images and a shared initializer. Both engines mount protocol-private RAM directories read-only. Only the initializer receives ECS-injected server secrets; no task role exists. Accept privileged Docker/ECS metadata persistence rather than adding a second orchestration system. [Runtime](../docs/ecs.md), [secrets](../docs/secrets.md).

Use a shared whole-MiB memory budget `floor(N-(256+ceil(max(512,0.10*N)))*1.20)` and reserve `N-256-task` from ECS placement. Current t4g.small budget/reserve is 1126/666 MiB. Native eligible engine restarts preserve siblings/configuration; early essential exits replace the task. Representative tuning remains separate from light-load validation.

## 2026-09-18 — Purge obsolete approaches and migrate the backup

Anthony requested removal of dead deployment code, targets and superseded documentation, then explicitly included Cape Town migration. Maintain only the common regional recipe and current evidence. Remove SSH/Compose provisioning, alternate CPU builds, installer-specific import conventions and obsolete tests; do not keep compatibility paths. Preserve existing cloud identities/IPs/credentials and leave git index management to Anthony.

Cape Town migration uses the same stack classes, with existing EIPs adopted under standard logical IDs via reviewed CloudFormation retention/import. One-time migration files stay ignored and are not a reusable legacy provisioner. Migration, security/identity checks and unattended stop/start passed; the old source host/stack were removed. AWS import cannot add outputs, and existing EIP associations must be explicitly detached before active deployment. Final evidence belongs in the launch record.

AGENTS.md now codifies the single-architecture boundary and baseline-equivalence check for cleanup. Current docs/working memory replace competing architecture narratives; source/license attribution and independent client/region research remain.

## 2026-09-18 — Regional AMI provenance

Cape Town preflight demonstrated that AWS's ECS AMI publisher account differs across regions. Require `--owners amazon` and API `ImageOwnerAlias=amazon`, plus available state, ARM64, AL2023 ECS family and expected root device. Do not hardcode Stockholm's numeric owner account globally. Regional AMIs remain explicit catalog inputs.

## 2026-09-17 — Official stable protocol releases

Anthony wants the latest official stable release for new builds, accepts compatibility debugging and excludes prereleases. Verify each download; immutable ECR artifacts record what was deployed. Stable-channel automation is still a follow-up, not a claim about the fixed current publisher. AWG's daemon channel differs from its tools' GitHub Releases. [Image policy](../docs/images.md#release-policy).

## 2026-09-13 — Mac client and recovery boundary

Anthony selected OneXraySE for REALITY while keeping AWG in Amnezia, after repeated configd/watchdog crashes. Full-device routing/encrypted DNS and connect/disconnect tests were approved and passed for both exits. Repeated sleep/wake remains pending. Do not patch/fork Amnezia locally; check upstream #2933 and applicable Mac releases between major work units. The raw daemon-socket watchdog is unsafe to reuse. [Client evidence](../docs/mac-client-stability.md).

## Continuing owner constraints

Manual protocol selection; one host/two EIPs per region; no HA or rollback prerequisite. Preserve consolidated `Project`, `Environment`, resource-owned `System` tags from personal-assistant. Parameter Store owns regional application secrets; LastPass remains Anthony-mediated and closeout is deferred until architecture settles. Authorized decryption stays inside processes and never enters tool/model output. No routine browsing/destination logs.
