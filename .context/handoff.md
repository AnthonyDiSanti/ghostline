# Handoff

## Current state — 2026-09-12

- **Stockholm ECS is the primary exit; cutover is complete.** Anthony accepted both protocols/IP masquerading, requested unattended lifecycle validation, then explicitly authorized cutover and local profile correction. [Commands/architecture](../docs/ecs.md), [live evidence](../docs/launch-stockholm-ecs.md).
- Active target `stockholm-ecs`, stack `GhostlineEcsTrial`, durable image stack `GhostlineEcsTrialImages`, account `757999402784`, profile `personal`, region `eu-north-1`. Historical target/stack names are intentional; `stockholm` remains the retired Ubuntu recipe and `credentialSource` identity, not the active exit.
- Host `i-0ccd265f182b32daf`, ENI `eni-07b6ab15aaa75d982`, encrypted 30 GiB disk `vol-05348498adf9b9730`. Xray `51.20.163.146` / `eipalloc-079db1eebf4b5cc78`; AWG `16.16.73.146` / `eipalloc-07627e295d844e8de`. Both services desired/running one, pending zero.
- One stock ECS AL2023 x86_64 t3.small, two bridge tasks/EIPs, immutable ECR images, SSM administration and six regional SecureStrings. No SSH key, NAT gateway, load balancer or autoscaler. Existing Project/Environment/System cost tags are unchanged.
- `destroy stockholm` completed unattended. Old `GhostlinePoc` is DELETE_COMPLETE; host `i-033493f9d064f8b00` terminated; disk `vol-00624392e421f4f1a`, ENI `eni-037352399599d6cc9` and both allocations (`16.170.38.152`, `13.50.178.121`) are gone. Release record: `.local/deployments/stockholm/last-release.json`.
- Cutover audit matched active ECS resource/output identities, EIP associations/tags, image digests and six SecureString versions against baseline. The final audit read secret metadata only. Post-retirement runtime configuration/isolation/egress and disposable real protocol HTTPS checks pass. Endpoint/image CDK diff is clean; full gate typecheck, four offline synths and 96 tests pass. All 140 local Markdown links and the local recovery-value scan across 93 git-visible files pass; whitespace is clean.
- Earlier unattended lifecycle evidence covers running-host park/rebuild, stop/start and stopped-host park/rebuild with closed stdin, unchanged credentials/images/IPs and no manual repairs. [Recorded sequences](../docs/launch-stockholm-ecs.md#unattended-lifecycle-validation--2026-09-12).

## Client state and remaining work

- Native Mac profiles now contain `Ghostline Stockholm REALITY` → `51.20.163.146` and `Ghostline Stockholm AWG` → `16.16.73.146`; the obsolete Stockholm entries were removed after importing and testing replacements with the same device credentials. Both Cape Town entries remain intact.
- Native Mac REALITY passed exact exit and HTTPS 200. Guarded AWG passed three rounds of DNS/HTTPS/exact exit and nine pings, then disconnected through the verified daemon cleanup. Final selected profile is Stockholm REALITY, VPN disconnected, direct internet restored (`5.195.76.221`). No persistent privacy/logging settings changed.
- Current phone imports are `.local/recovery/stockholm-ecs-clients/ios-{xray,awg}.vpn` and `ios-{xray,awg}-qr.png`. Any iOS profile still using the retired addresses needs these exports. No phone profile changes or new iOS/IPv6/performance claims were made this turn; prior owner ECS acceptance did not enumerate devices.
- Cape Town remains the slower backup. No Cape Town AWS operations were targeted. Its migration/export normalization stays separate; consult its [launch record](../docs/launch-cape-town.md) before future work.
- Graviton/Bottlerocket, combined IP/container evaluation, ECS full address-release/profile-refresh trials and automatic expiry/controller/UI remain separate. [On-demand proposal](scratch/2026-09-10-on-demand/proposal.md).
- Six parameters remain under `/ghostline/prod/{server,clients/...}`. Generated client exports render live endpoints over preserved source identities; raw parameter profiles may contain historical addresses. [Secret paths](../docs/secrets.md). Anthony intermediates LastPass; saves remain unconfirmed. Preserve local recovery material.

## Local execution and commit state

- Follow `AGENTS.local.md`: Node 24.20.0, cache `/tmp/ghostline-npm-cache`, omit only unsupported npm proxy duplicates. AWS/Docker require sandbox escalation. Run disposable clients with the native VPN disconnected. The AWG daemon recovery API does not control Xray; consult [Amnezia notes](knowledge/amnezia.md) before native automation.
- Use `npm run ecs stockholm-ecs <action>` for ECS. `park` retains tracked EIPs; `destroy` releases a disposable endpoint. Images/parameters survive endpoint removal. Explicit ECS deploy performs preflight, checks server parameters/images, then diff/deploy without a terminal prompt.
- Cutover diagnostics and protected preference backups: `.local/diagnostics/stockholm-cutover-2026-09-12/`. This folder contains confidential local recovery artifacts; do not print or commit it. Earlier lifecycle evidence remains in `.local/diagnostics/stockholm-ecs-lifecycle-2026-09-12/`.
- This turn began clean at `a4eaadf`. Tracked edits document the operational cutover, current client state and active/legacy workflow boundaries; no application or infrastructure code changed. No staging or commit was performed; preserve the user's index.
