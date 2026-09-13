# Tasks

Task IDs are ULIDs. Keep active items limited to concrete planned or in-progress work.

## Current boundary

Stockholm ECS is the primary and architecture test target. Cape Town stays running on its validated Ubuntu/Compose setup as a stable backup until primary architecture refinement is complete; upgrade it afterward as a separate work unit. No deployment changes are authorized merely by listing the backlog.

## Next work

- id: 01M2D00GJ5HE1591CYW6KSFVV1 — title: Investigate recurring Mac configd crash around VPN sleep/wake — owner: Codex / Anthony — status: next work unit after migration handoff and touch-base — last update: 2026-09-13
  - Anthony reports a configd crash, prolonged spinning beach ball and hard restart; this has happened before. He suspects sleeping while Amnezia is connected, inconsistently. This is an owner-reported hypothesis, not an established cause or an XTLS server regression.
  - The native REALITY HTTPS/expected-exit check passed before the interruption; automation subsequently lost its app window. Anthony confirmed both existing iPhone profiles still work. Later he explicitly authorized remaining connect/disconnect checks while keeping the Mac awake; sleep reproduction is not part of migration closeout.
  - Start with the relevant configd/crash/panic reports, bounded sleep/wake timeline and exact macOS/Amnezia versions. Correlate protocol, connection state and sleep/wake events before reproducing with local recovery. Preserve profiles and avoid another blanket uninstall/reset without evidence.
  - Separate awake connection stability from sleep/wake behavior. If evidence implicates Amnezia and a reliable fix is unavailable, evaluate maintained alternative clients for the existing REALITY/AWG protocols and credentials.
  - Finish the server migration, record evidence and pause to touch base before starting this investigation. Server packaging, RAM storage and Cape Town upgrades do not resolve this client/OS question by themselves.

- id: 01M2BEAXSR80HER69515XBDF6F — title: Evaluate the primary deployment architecture — owner: Codex — status: official XTLS migration deployed and lifecycle validated; host/CPU trials pending — last update: 2026-09-13
  - Initial assessment: one Stockholm EC2 already runs both services/tasks. Keep external TCP 443 for Xray and UDP 443 for AWG, with the existing two EIPs during evaluation. Separate IPs are useful for protocol address separation, not required merely by the shared port number. See docs/ecs.md.
  - Recommendation: retain separate services/containers; a shared task couples releases, while a combined container also needs process supervision, distinct internal port mappings and new per-engine egress classification. No deployment change or packaging performance claim accompanies this assessment.
  - Downsizing follow-up (2026-09-13): measure actual host/engine use and simultaneous/restart peaks before changing packaging. The two engines account for 768 MiB at placement, plus the new 64 MiB initializer; tune soft reservations/hard limits independently of merging. CPU shares are not dedicated cores. No measured consolidation saving or smaller-host acceptance exists yet.
  - Xray migration (2026-09-13): Anthony authorized implementing the unmodified official `ghcr.io/xtls/xray-core` image at deployed 26.7.28 by digest, a one-shot initializer and an ECS task volume on existing encrypted EBS. Deployed; all six credentials/versions, both EIPs/tags and published images survived unattended stop/start and retained-IP cold rebuild. Both real protocol checks and owner iPhone checks pass; full gate 102 tests/four synths and Docker image cases pass. Track Mac stability separately in the next work unit above. RAM-backed rendered configuration is a separate follow-up below.
  - Evaluate AL2023 on Graviton with compatible images and measured CPU/throughput; evaluate Bottlerocket independently, especially support for the chosen host networking. Neither platform change is required for PoC acceptance.
  - Anthony requested starting packaging evaluation. The initial comparison is recorded; a shared-task trial remains optional. Graviton/Bottlerocket evaluation can use the proven separate-container baseline.

- id: 01M2DA6YG0BA1GD47ZCMKBEWRX — title: Restore RAM-backed rendered Xray configuration — owner: Codex — status: queued after the official XTLS image migration — last update: 2026-09-13
  - Anthony explicitly requested retaining this follow-up while accepting encrypted task storage for the cleaner initial integration with the unmodified official image. It is not an acceptance gate for that initial migration.
  - Replace the initial disk-backed rendered configuration with RAM-backed storage shared correctly between the initializer and Xray. Keep Parameter Store as the durable source and preserve private file permissions, read-only engine access and the unmodified XTLS image.
  - Candidate mechanism: a host-owned tmpfs directory bind-mounted into both containers, with mount lifetime independent of the initializer. Separate container-local tmpfs mounts do not share files. Recreate after host restart from Parameter Store; verify swap behavior and per-task cleanup. See docs/xray-images.md; this mechanism is not yet implemented or selected as the final design.
  - Done when configuration survives the initializer-to-engine handoff and restores correctly through task replacement, stop/start and retained-IP cold rebuild, with verified RAM backing and cleanup. This concerns rendered files; it does not imply eliminating ECS secret values from privileged container metadata.

- id: 01M2BEAXSR9FJFM2HS7CENCZFF — title: Validate ECS full release and fresh-address relaunch — owner: Codex — status: queued — last update: 2026-09-12
  - Retained-IP park/rebuild and stop/start already pass. Remaining experiment: release an ECS endpoint's IPs, recreate using preserved ECR/Parameter Store state, regenerate current client endpoints and validate both protocols/native imports. Plan the interruption before executing it.
  - Stable DNS/profile endpoints are a possible later alternative, not an implemented dependency or requirement for this trial.

- id: 01M2BEAXSRKHFFX6QPGH0NE3YH — title: Select on-demand lifetime and launch controls — owner: Anthony / Codex — status: proposal; scope selection pending — last update: 2026-09-12
  - Explicit CLI start/stop/park/redeploy is implemented. Remaining choices: permanent versus idle/fixed expiry, stop versus park/release, and CLI versus phone-accessible launch while the Mac is asleep.
  - If selected, implement authenticated-activity reporting and a small independent controller with durable operation state; define quiet/sleeping-client behavior without recording browsing destinations. No automatic protocol failover. See .context/scratch/2026-09-10-on-demand/proposal.md.

## Owner follow-ups

- LastPass backup is explicitly deferred by Anthony until architecture refinement is finished; interim updates are inconvenient and subject to change. Keep protected local recovery copies and regional parameters. Do not repeatedly prompt for a vault update during refinement.

## Deferred until the primary architecture is settled

- id: 01M2BEAXSRWGSGNQEYCM9FDJ0J — title: Upgrade the Cape Town backup to the selected architecture — owner: Codex — status: deferred by Anthony — last update: 2026-09-12
  - Keep its current host, credentials, EIPs and native profiles intact while refining Stockholm. Normalize Cape Town's legacy Xray device exports and import regional parameters as part of its later migration, preserving device identity.
  - Latest read-only AWS check: host running, system/instance checks OK, both EIPs attached. This was not a new tunnel test.

## Completed

- id: 01M2D00GJ5M47KPHPE31ZJHZAK — title: Migrate Stockholm Xray to the unmodified official XTLS image — owner: Codex — status: deployed; server/lifecycle and iPhone validation complete — last update: 2026-09-13
  - Mirror pinned official 26.7.28 amd64 content to ECR; use an offline one-shot initializer and private encrypted task volume for non-root Xray. Preserve AWG settings, both addresses and all six credential identities. Cape Town was not targeted.
  - Passed local image handoff/failure cases, 102 tests/four synths, server permissions/secret-recipient/IMDS/EIP checks and real encrypted clients. Unattended stop/start and fresh-host rebuild required no credential import, republish, SSH or manual repairs. Final live CDK diff is clean.
  - Anthony confirmed both existing iPhone profiles work. Native Mac REALITY and the later awake-only guarded AWG checks passed; the separately reported configd/sleep problem remains unresolved and is the next work unit. See docs/launch-stockholm-ecs.md for final native checks and exact host identity. RAM-backed rendered configuration and LastPass timing remain explicit follow-ups.

- id: 01K4HEGQ000000000000000002 — title: Implement the first connectivity experiment — owner: Codex — status: implementation complete; recovery follow-up separate — last update: 2026-09-12
  - Goal: Scaffold CDK/TypeScript/npm, launch one EC2 instance with one EIP in Frankfurt running Amnezia when requested, and obtain macOS/iOS connection evidence.
  - Done: Implement/test/deploy CDK; verify tags and SSH; install XRay; export recovery/iPhone profiles; verify Mac native exit, HTTPS and reconnect; record Anthony’s 2026-09-07 practical macOS and iOS test passes.
  - Added: Named target commands/preflight, independent Cape Town IaC deployment, manual XRay install, local recovery/device exports, clean diffs and successful native Mac switching between both exits.
  - Trial: Anthony confirmed Cape Town macOS and iOS tests passed on 2026-09-07.
  - Retirement: Delete Frankfurt stack and explicitly release its retained EIP at Anthony’s request; verify no residual volumes/addresses/snapshots/stacks and unchanged Cape Town health. Complete on 2026-09-07.
  - Owner follow-up: Anthony deferred LastPass backup until architecture refinement is complete; see the follow-up above. On 2026-09-09 Anthony reported both Cape Town protocols too slow and requested a nearer primary while preserving Cape Town as backup. Anthony excludes Tel Aviv; region research recommends Frankfurt if age verification is ignored, otherwise a Stockholm trial; Stockholm ECS is now the primary; its Ubuntu predecessor is retired. See `docs/region-selection.md`.
  - Scope: `docs/development.md` and `docs/product.md`; reference-phase task; the runtime migration and cutover are recorded under Completed.

- id: 01M2B1AJWKZP6KDMCJ9Q40YEAS — title: Promote Stockholm ECS and update local profiles — owner: Codex — status: complete — last update: 2026-09-12
  - Anthony authorized cutover after lifecycle validation. Imported preserved-identity ECS Mac profiles, passed native REALITY and guarded AWG exit/HTTPS checks, then removed only obsolete Stockholm app entries. REALITY selected; VPN disconnected; Cape Town profiles unchanged.
  - Deleted old `GhostlinePoc` host/disk/networking and released both old allocations with the scoped helper. Confirmed active ECS resources/images/IPs and six secret versions unchanged, both services healthy, both real protocol tests passing and final diff clean. Full gate: 96 tests/four synths.
  - Keep active target `stockholm-ecs` and historical stack names. Anthony subsequently confirmed the iPhone works through both Stockholm protocols on 2026-09-12, closing the device-profile follow-up. LastPass backup is deferred to the end; Cape Town stays unchanged.

- id: 01K4M00000000000000000001 — title: Deploy Stockholm and add explicit regional lifecycle — owner: Codex — status: superseded by accepted ECS cutover — last update: 2026-09-12
  - Authorized: Independent Stockholm Xray/AWG deployment, preserving Cape Town; reusable stack with retained-IP parking/redeploy and explicit PoC full release.
  - Implemented: Named Stockholm target, active/parked EndpointStack, scoped destroy/release with retry record, fresh per-device Xray generation and VLESS sharing. Full gate 82 tests; disposable Xray/AWG tests pass.
  - Live: Initial deploy and park passed; original EIPs remained tracked and tagged. Redeploy with preserved IPs and both runtime installations passed. Mac Xray, isolated AWG and two guarded native AWG reconnect tests passed. Native AWG renewed its session, passed 30/30 sustained HTTPS/exit checks, with one brief ping/DNS loss; original outage was not reproduced. Automatic recovery restored direct internet and left the Mac disconnected. iOS/owner practical performance had not been recorded at that checkpoint.
  - Retirement: Old Ubuntu host, disk, networking and both EIPs removed on 2026-09-12. Pending Ubuntu-specific owner/iOS follow-ups are superseded, not counted as new device passes. Use `stockholm-ecs` for current work.

- id: 01M2ARMEF2BXRFSDCGCEWBAE8W — title: Validate unattended Stockholm ECS lifecycle before cutover — owner: Codex — status: complete — last update: 2026-09-12
  - Passed running-host park/rebuild, stop/start and stopped-host park/rebuild with stdin closed and no manual cleanup, credential import, image publication or runtime installation. Both protocols passed real HTTPS/assigned-IP checks after each restoration.
  - Preserved both allocations/tags, all six credential values/versions, image digests and the older Stockholm stack/resources. Verified removed hosts/disks/ENIs/clusters. Cape Town was out of scope.
  - Corrected ECS-only deployment prompts for unattended rebuilds; full gate 96 tests/four offline synths and final live CDK diff pass. Final host and evidence: docs/launch-stockholm-ecs.md.
  - Follow-up: Stockholm cutover/old-host retirement completed; see the primary cutover section in the launch record. Automatic expiry and ECS full address-release/profile-refresh trials remain separate.

- id: 01M24CJYD6Z8Q29SMM6BH20RNC — title: Validate the Stockholm ECS bridge trial and regional secrets — owner: Codex — status: complete — last update: 2026-09-12
  - Implemented one AL2023 x86_64 ECS host, separate bridge tasks/EIPs, immutable ECR releases, six regional SecureStrings, SSM administration and scoped start/stop/removal.
  - Passed: 2026-09-10 configuration/IMDS/EIP checks, real protocol HTTPS before and after stop/start, fresh-host credential restoration with retained IPs and clean live CDK diff. Initial park needed empty-cluster cleanup; dependency and stopped-host deregistration fixes have regression coverage.
  - Acceptance: Anthony confirmed connectivity through both protocols and IP masquerading on 2026-09-12, then requested commit prep. Devices and other privacy subtests were not enumerated. See docs/launch-stockholm-ecs.md.
  - Separate follow-ups: Cape Town export normalization/import, Graviton/Bottlerocket and combined IP/container evaluation. Stockholm cutover/old-host retirement is complete. Automatic expiration/controller remains deferred.

- id: 01K4HF000000000000000003 — title: Migrate runtime ownership and add a shared-host AWG alternative — owner: Codex — status: complete — last update: 2026-09-07
  - Done: Implement protected configuration import, pinned container builds, separate Compose/SNAT, migration-stage CDK and tests. Deploy replacement host and move original EIP allocation. Preserve both Xray clients; verify byte equality and actual original-IP egress. Repeat installation retained the same running container.
  - AWG: Install on the managed host, generate independent real device profiles and local QR/link files; pass server config/SNAT/egress, reinstall and reboot checks. Mac AWG exit/HTTPS pass.
  - Checkpoint: Reboot/config/egress/native Mac checks passed; Anthony validated the unchanged macOS/iOS profiles on 2026-09-07.
  - Done: Retire reference host/disk and temporary migration scaffolding. Fix Mac archive metadata sidecars; verify owned-runtime export matches all six original files. Final full gate: 66 tests.
  - Final validation: Anthony confirmed the iPhone AWG/practical/manual-switch and Mac post-reboot AWG tests passed on 2026-09-07. DNS/IPv6 evidence limits remain documented; no further work blocks this unit.
  - Constraint: Final state is one host, two EIPs and manual client selection. No automatic failover, rollback framework, ECR/ECS or Parameter Store plumbing. See `docs/runtime.md`.

- id: 01K4HEGQ000000000000000001 — title: Review reuse and rebuild documentation — owner: Codex — status: complete — last update: 2026-09-07
  - Outcome: Review personal-assistant tooling/IaC; incorporate Anthony's corrections; replace template docs with retrieval-oriented topics and preserve original inputs in the archive.
  - References: `docs/README.md`, `docs/reference-reuse.md`.
- id: 01K4EY40000000000000000000 — title: Review template and v0.3 design — owner: Codex — status: complete — last update: 2026-09-06
  - Outcome: Initial review discussed and superseded where appropriate by 2026-09-07 decisions; scratch draft retired.
