# Headscale — N. Virginia

The single-active coordinator is deployed at **https://ts.bigmantonyd.com** on November 18, 2026. Native storage, trusted TLS, manual enrollment, task restart, host replacement and an actual reboot have passed. Both clients retain their identities/addresses and return online after replacement and reboot. Their containers, nodes and qualification users are removed. The owner approved creation of the initial manual-enrollment user `anthony` (ID 3), which was verified in the live user list. Each device still requires manual approval. This is the coordinator milestone; authenticated regional relay admission and Tailscale exit engines remain subsequent work.

## Observed resources

| Resource | Observed state |
| --- | --- |
| Account / region / AZ | `757999402784` / `us-east-1` / `us-east-1a` |
| Durable stack | `GhostlineHeadscaleState` |
| Replaceable compute stack | `GhostlineHeadscaleRuntime` |
| Host | `i-0895d00e92e15944d`, ARM64 `t4g.small` |
| Host OS | Official ECS-3 Bottlerocket 1.66.0, `ami-0334698af14d8bb05` |
| Service / task | `ghostline-headscale` cluster, `headscale` service, one writer |
| Address / DNS | Retained `54.89.120.113`, Route 53 A record for `ts.bigmantonyd.com` |
| Application state | Retained encrypted 8 GiB gp3 `vol-08d8c24a1b0d2652a`, local ext4 SQLite/WAL, Noise identity and ACME cache |
| Replaceable host disks | Encrypted 2 GiB OS and 20 GiB runtime data; removed with compute |
| Application | Latest stable official Headscale **0.29.7**, copied unchanged into `ghostline/control/headscale` |
| Actual ARM64 manifest | `sha256:8f64e19972c001efa48be48a9d81a2f86c4f239767ee3ffd50de119b01fe96f1` |
| Runtime security | Exact-host GuardDuty HEALTHY, agent v1.17.4; SSM administration, no public SSH |

The observed version/digest is audit evidence. Each new deployment resolves latest upstream stable again. The image and generic storage helper repositories are independent of regional gateway releases. [Operations and release policy](headscale.md#coordinator-operations), [source and license notice](../runtime/NOTICE.md).

## Qualification

- The unchanged official ARM64 image runs rootless with a read-only root, dropped capabilities, no-new-privileges, SELinux/seccomp confinement, private bounded RAM scratch/socket mounts and host swap disabled. Configuration is read-only; only the retained application state is writable. No application task role or injected AWS/private-key environment is present.
- Native verification binds the exact EBS serial/kernel device, filesystem, directory ownership and expected volume marker. Formatting requires verified new-allocation authority. That authority is revoked in persisted Bottlerocket settings and the external public storage receipt before admitting any task. Existing state is never automatically formatted.
- Trusted public HTTPS health and local health pass. Two independent disposable Tailscale clients complete manual approval. The received map has exactly four Ghostline relay regions with matching IPs, certificate pins and DERP/STUN ports; public default maps are absent. Relay source restrictions remain intact, so this does not establish end-to-end relay transport.
- Task replacement preserves the coordinator key and registered client state. Host replacement stops the actual writer, flushes/unmounts the filesystem, retires compute and reattaches the same volume/address. Both enrolled nodes retain their identities/addresses and return online. A real EC2 reboot changes the kernel boot ID while retaining the coordinator key and passing native/GuardDuty checks.
- Actual application-network probes reject host, IMDS and task-credential endpoints, with positive host-metadata and public HTTPS controls. The public TCP control uses an IP: entering only a network namespace retains the diagnostic helper's resolver file.
- Temporary diagnostics/admin are disabled and the control container remains non-superpowered after verification. No agent reinstall/restart, detector reduction, EBS scan exclusion or shared CloudTrail change is part of this deployment.
- Full Node 24 verification passes **536 tests across 86 files**, typecheck, asset syntax/ShellCheck/Hadolint and fresh offline CDK synthesis. Local image qualification includes persistent synthetic state and empty normal lifecycle output. Comparing to main `3cf459b` preserves all 60 regional templates, 20 host recipes and seven image identities. Explicit relay IDs preserve all deployed configuration bytes when the catalog order reverses.

## Private approval rollout

On November 19 UTC, the revised helper replaced coordinator compute through the standard single-writer workflow. Live verification at 03:33 UTC confirmed the same official image digest, encrypted application volume, Noise key and public address. Headscale returned trusted HTTPS health and GuardDuty eventually reported HEALTHY for the new instance. The SSM installer had already reported success while GuardDuty was waiting for telemetry.

A disposable ARM64 Tailscale client used the real SSM approval path and came online. The fresh SSM request window contained one encrypted approval with the matching one-use handle and zero plaintext registration-ID matches. The check returned counts only. An independent readback confirmed the test node and user were removed, `anthony` remained, and the operation lock was clear. The public homepage at `/` intentionally has no visible body and serves the Headscale favicon separately. [Operator workflow](headscale.md#coordinator-operations), [upstream routes](https://github.com/juanfont/headscale/blob/v0.29.7/hscontrol/app.go#L531-L569).

## Privacy and continuity limits

Structured application logging and client log uploads are disabled using supported configuration. SQLite retains necessary enrollment/coordination state on encrypted EBS. This service is not RAM-only, and remaining stderr, HTTP/TLS failure, journal/dump and cloud records still need the [Headscale privacy follow-up](headscale.md#privacy-boundary). Empty tested output is not a universal zero-log guarantee.

At 07:01 UTC, the capped native application log contains **794 bytes/four records**. Count-only on-host classification identifies **three TLS-handshake stderr records with IPv4 patterns**, one unclassified stdout record and zero panic patterns. No raw payloads or addresses leave the host. This is a confirmed remaining client-address error path despite disabled structured logging, not merely a hypothetical sink. The service is not declared privacy-ready. Remove these producers in the focused follow-up without changing the existing security policy to hide them.

Public health succeeds with normal certificate validation. Unauthenticated `/api/v1/node` returns **401**, and public `/metrics` returns **404**. Native readback verifies the deployed configuration hash, one-writer encrypted volume attachment and capped log configuration.

Fresh five-region comparison preserves all **45 regional parameter metadata records**, the ten original allocation/IP identities, regional modes and effective GuardDuty settings. Stockholm concurrently has a separately owned regional-release-controller operation with temporary resources; the fleet is not claimed static. Other regional hosts match the post-main baseline. GuardDuty feature timestamps and lifecycle revision counters are operational metadata, not settings or endpoint identities. Headscale does not own those regional release operations.

One earlier host's GuardDuty installer association reported a prerequisite failure while its enabled official agent later obtained HEALTHY coverage without intervention. Preserve the exact-host service gate; do not replace it with agent-running evidence or infer that the upstream stop/start coverage issue is repaired. The final replacement and reboot passed their gates.

## Operation and follow-ups

Use the maintained [coordinator commands](headscale.md#coordinator-operations). Private receipts are under ignored `.local/deployments/headscale/`; `deployed-inputs.json` reconstructs actual deployed bytes independently of a newer plan. Interrupted operations keep their exclusion and support verification-only resume. Retain the state stack and application volume during compute repair.

Recovery automation is deliberately deferred. Retained EBS is not a backup or cross-AZ recovery guarantee. Review personal-assistant's backup code and useful shared abstractions next, then select consistent backup/restore objectives. Google SSO, service preauth automation, authenticated DERP attachment, exit nodes, IPv6 and home-destination concealment are not claimed by this launch. No native Mac/iPhone or home-router acceptance occurred here.
