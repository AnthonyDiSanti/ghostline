# Current decisions

Superseded architectures and retired deployment recipes belong in git history. These entries record decisions that still constrain current work.

## 2026-09-19 — Roll the validated stable selection to both regions

Anthony authorized publishing and deploying the selected images everywhere. Publish/test each exact regional set, then deploy Stockholm and pass live runtime/tunnel checks before updating Cape Town. Both now run task revision 3 with official stable Xray 26.3.27 and unchanged AWG upstream versions in the new verified build. Preserve the hosts, EIPs and all six credential values/versions per region; before/after comparison confirms this. No initializer recipe, native client configuration or routing changes were required. Physical-device acceptance remains separate from automated encrypted probes. See both regional launch records.

## 2026-09-19 — Resolve, validate and record stable image selections

Anthony prioritizes image completion before feature work and authorized stable build resolution. Implement a distinct AWS-free `images:build` command that resolves once and promotes `infra/image-inputs.json` only after real local image/tunnel checks. Publishing to another region, deploying and restarting reuse that selection. The file records a successful resolution, not a policy to remain on manually selected versions. Publication validates exact immutable ECR bytes where present and exact new image IDs otherwise. No regional rollout is implied by local success.

Xray/tools use official latest releases with explicit stable flags. AWG daemon currently has no GitHub Releases: interpret its strict numeric source tags plus official versioned Docker publication/workflow as its release channel; fail if that policy changes. Record source/image identities and digest verification without claiming unavailable signatures/attestations. Xray stable was older than the previously deployed prerelease; the authorized rollout above applies the selected stable policy. Base/toolchain updates stay explicit recipe changes. [Policy and source evidence](../docs/images.md).

After the anonymous API quota was exhausted, Anthony explicitly approved using the existing GitHub CLI login for read-only public release metadata. The build now makes fixed-host GETs only to the reviewed upstream release/tag/commit routes; credentials stay inside `gh`, HTTP debug logging/prompts are disabled and source downloads remain anonymous. Authentication failure stops the build; no silent anonymous fallback or permission expansion is implied.

AGENTS.md now names the implemented command, recorded selection and acceptance boundary instead of the superseded fixed-input publisher. Synthetic probe shell logic remains a linted fixture. Temporary test failures were fixture issues, resolved without changing protocol configuration or deployed engines.

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

Anthony wants the latest official stable release for new builds, accepts compatibility debugging and excludes prereleases. Verify each download; immutable ECR artifacts record what was deployed. September 19 implements this policy with recorded successful build selections; AWG's daemon channel differs from its tools' GitHub Releases. [Image policy](../docs/images.md#release-policy).

## 2026-09-13 — Mac client and recovery boundary

Anthony selected OneXraySE for REALITY while keeping AWG in Amnezia, after repeated configd/watchdog crashes. Full-device routing/encrypted DNS and connect/disconnect tests were approved and passed for both exits. Repeated sleep/wake remains pending. Do not patch/fork Amnezia locally; check upstream #2933 and applicable Mac releases between major work units. The raw daemon-socket watchdog is unsafe to reuse. [Client evidence](../docs/mac-client-stability.md).

## Continuing owner constraints

Manual protocol selection; one host/two EIPs per region; no HA or rollback prerequisite. Preserve consolidated `Project`, `Environment`, resource-owned `System` tags from personal-assistant. Parameter Store owns regional application secrets; LastPass remains Anthony-mediated and closeout is deferred until architecture settles. Authorized decryption stays inside processes and never enters tool/model output. No routine browsing/destination logs.
