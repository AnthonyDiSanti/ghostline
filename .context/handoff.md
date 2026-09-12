# Handoff

## Current state — 2026-09-12

- Anthony confirmed both protocols work, then confirmed IP masquerading and requested commit prep. The independent `stockholm-ecs` / `GhostlineEcsTrial` checkpoint is accepted. Device-specific DNS/IPv6, concurrency and performance results were not enumerated. Cutover and retirement of the existing exits remain separate instructions. [Architecture/commands](../docs/ecs.md), [launch evidence](../docs/launch-stockholm-ecs.md).
- Implemented stock ECS AL2023 x86_64, one t3.small/30 GiB host, separate bridge tasks and EIPs, immutable ECR releases, regional Parameter Store injection and SSM administration. No SSH key, NAT gateway, load balancer or autoscaler. Shared cost dimensions remain `Project=ghostline`, `Environment=prod`, with resource-owned `System`.
- Last observed AWS state is from 2026-09-10: trial Xray `51.20.163.146` / `eipalloc-079db1eebf4b5cc78`; AWG `16.16.73.146` / `eipalloc-07627e295d844e8de`. Rebuilt host `i-0da0f70b19c4a51d1`, ENI `eni-0ed168296680f7636`, encrypted disk `vol-06ac4f02736c7b70d`. Initial trial host is retired. Profile `personal`, account `757999402784`, region `eu-north-1`.
- Six Stockholm server/device credentials are round-trip verified Standard SecureStrings under `/ghostline/prod/{server,clients/...}`. Native trial profiles/links/QR files are protected under `.local/recovery/stockholm-ecs-clients/`. Identities were preserved; no local recovery files were removed and no LastPass action was performed. [Secret paths](../docs/secrets.md).

## Validation and lifecycle evidence

- On 2026-09-10 both real protocol HTTPS checks passed using disposable Docker clients with the native VPN disconnected. Initial AWG probes nested through Xray failed against both new and old endpoints; direct retests passed without server tuning. Use a direct path for these comparisons.
- Retained-IP rebuild restored both tasks from ECR/SSM with matching server configuration hashes and assigned-EIP egress. Stop drained both services and stopped the exact host; start restored the same host/disk/ENI, both services and passing configuration/IMDS/egress/real HTTPS checks. Final live CDK diff was clean on 2026-09-10.
- The first park required cleanup of an empty leftover cluster after a host/cluster deletion race. Added EC2→cluster deletion ordering and stopped/disconnected empty-host deregistration with regression coverage. Rebuild then passed; a second complete park cycle after the fix has not been recorded.
- The 2026-09-10 agent session restored the original native Stockholm Xray connection and verified exit `16.170.38.152`. No watchdog remained. This is historical client state, not a current connection claim. Amnezia's AWG daemon recovery API does not report/control the active Xray path; consult [Amnezia knowledge](knowledge/amnezia.md) before client automation.
- Commit prep on 2026-09-12 reran focused ECS checks (12 tests) and the full Node 24 gate: typecheck, four fresh offline target synths and 95 tests passed. Local Markdown targets, direct dependency/lockfile consistency, whitespace and the git-visible credential scan passed. The index matches both starting snapshots. No cloud or client changes were made during commit prep. The current dirty work unit includes the earlier on-demand discussion docs and subsequent ECS implementation; no staging or commit is requested.

## Preserved exits and follow-ups

- Existing Ubuntu Stockholm `GhostlinePoc`: host `i-033493f9d064f8b00`, Xray `16.170.38.152`, AWG/admin `13.50.178.121`. Earlier native Mac checks passed; its owner/iOS details remain unrecorded. [Stockholm launch](../docs/launch-stockholm.md).
- Cape Town `af-south-1` / `GhostlinePoc`: host `i-017247cce7d2bf84f`, Xray `16.28.130.178`, AWG/admin `15.240.94.162`. Owner macOS/iOS tests passed earlier, but both protocols were reported too slow; preserve this backup. [Cape Town launch](../docs/launch-cape-town.md). Frankfurt is retired; its catalog entry is a recipe only.
- Both older exits remain preserved; the independent ECS trial temporarily adds a third host. Explicit cutover/old-host retirement is the next decision, not an unfinished acceptance gate for this commit.
- Cape Town Parameter Store import needs legacy client-export normalization. Evaluate Graviton and Bottlerocket, then combined IP/container tradeoffs separately. Automatic expiry/controller/UI remain deferred in the [on-demand proposal](scratch/2026-09-10-on-demand/proposal.md); the [earlier ECS discussion](scratch/2026-09-10-on-demand/ecs-ec2.md) is historical where superseded.
- Anthony intermediates LastPass; vault saves remain unconfirmed. Preserve the Stockholm SSH key and runtime/device files listed in [Stockholm recovery](../docs/launch-stockholm.md), plus unchanged Cape Town material. SSM application secrets do not replace personal recovery custody.

## Local execution

- Follow `AGENTS.local.md`: local Node 24.20.0, cache `/tmp/ghostline-npm-cache`, omit only unsupported npm proxy duplicates. AWS/SSH/Docker need sandbox escalation. Keep native VPN disconnected for direct-path Docker protocol tests and do not widen the configured operator CIDR.
- Use `npm run ecs stockholm-ecs <action>` for the ECS trial; legacy `runtime` commands deliberately reject ECS targets. `park` retains tracked EIPs; `destroy` releases a disposable endpoint. ECR images and regional credentials survive endpoint removal.
- Last committed work is `bf32839` (observed 2026-09-10). The tree was clean before the discussion/ECS work. Preserve the user's git index and propose a message for the full dirty tree.
