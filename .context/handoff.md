# Handoff

## Current state — 2026-09-12

- The Stockholm ECS bridge and unattended retained-IP lifecycle checkpoints pass. Anthony confirmed both protocols and IP masquerading; the follow-up agent run verified running-host park/rebuild, stop/start and stopped-host park/rebuild with closed stdin and no manual repairs. [Commands/architecture](../docs/ecs.md), [live evidence](../docs/launch-stockholm-ecs.md).
- Final trial host `i-0ccd265f182b32daf`, ENI `eni-07b6ab15aaa75d982`, encrypted 30 GiB disk `vol-05348498adf9b9730`. Both services are desired/running one, pending zero. Xray `51.20.163.146` / `eipalloc-079db1eebf4b5cc78`; AWG `16.16.73.146` / `eipalloc-07627e295d844e8de`. Profile `personal`, account `757999402784`, region `eu-north-1`, stack `GhostlineEcsTrial`.
- One stock ECS AL2023 x86_64 t3.small host, two bridge tasks/EIPs, immutable ECR images, SSM administration and regional Parameter Store credentials. No SSH key, NAT gateway, load balancer or autoscaler. Cost tags remain `Project=ghostline`, `Environment=prod`, with resource-owned `System`.
- Both park cycles removed the old host, disk, ENI and cluster. Both original allocations/tags, six SecureString values/versions and ECR image digests survived unchanged. Automatic restoration passed configuration hashes, isolation, expected EIP egress and real encrypted HTTPS through both protocols after each rebuild and restart. No import, publish, SSH or manual installation was needed.
- The earlier deletion-order/deregistration fixes are now live-validated for running and stopped hosts. A new CLI correction makes only explicit ECS deploy/publish noninteractive after the fresh diff; legacy/global CDK approval behavior and IAM/network controls are unchanged.
- Full local gate: focused command/lifecycle regressions, typecheck, four offline synths and 96 tests pass. Final live CDK diff is clean for endpoint and image stacks. Documentation links, git-visible recovery-value scan and whitespace checks also pass. Evidence logs/nonsecret snapshots/credential hashes are under `.local/diagnostics/stockholm-ecs-lifecycle-2026-09-12/`.
- Mac direct-internet checks passed before and after the run; final HTTPS exit `5.195.76.221`. Disposable clients were removed. Native profiles retain the same endpoint and credential identities; this turn did not alter the Amnezia app or claim new device-specific DNS/IPv6, concurrency or performance results.

## Next work and preserved exits

- The lifecycle prerequisite for Stockholm cutover is satisfied. Cutover/retirement still needs its own instruction; preserve the older Stockholm `GhostlinePoc` host `i-033493f9d064f8b00`, Xray `16.170.38.152`, AWG/admin `13.50.178.121`. Its stack/resources remained identical and host running in all comparisons. [Older Stockholm launch](../docs/launch-stockholm.md).
- Anthony explicitly excluded Cape Town from this lifecycle work. No Cape Town resource changes or targeted inventory checks were performed. It remains the recorded slower backup; consult its [launch record](../docs/launch-cape-town.md) before future work.
- Graviton/Bottlerocket, combined IP/container evaluation, full address-release/profile-refresh trials, and automatic expiry/controller/UI remain separate. [On-demand proposal](scratch/2026-09-10-on-demand/proposal.md). Cape Town client-export normalization/Parameter Store import is deferred, outside this turn.
- Six Stockholm server/device parameters are durable under `/ghostline/prod/{server,clients/...}`. Native profiles/links/QR files remain protected under `.local/recovery/stockholm-ecs-clients/`. [Secret paths](../docs/secrets.md). Anthony intermediates LastPass; vault saves remain unconfirmed. Do not remove local recovery material.

## Local execution and commit state

- Follow `AGENTS.local.md`: Node 24.20.0, cache `/tmp/ghostline-npm-cache`, omit only unsupported npm proxy duplicates. AWS/Docker require sandbox escalation. Run disposable protocol tests with the native VPN disconnected. The AWG daemon recovery API does not control Xray; consult [Amnezia notes](knowledge/amnezia.md) before native automation.
- Use `npm run ecs stockholm-ecs <action>` for ECS; legacy `runtime` commands reject ECS targets. `park` retains tracked EIPs; `destroy` releases a disposable endpoint. Images and regional credentials survive endpoint removal. Explicit ECS deploy performs preflight, checks server parameters/images, then diff/deploy without a terminal prompt.
- This follow-up began from clean commit `41a957d`. Dirty changes cover scoped noninteractive ECS commands, regression coverage and lifecycle evidence/context. No staging or commit was performed; preserve the user's index.
