# Tasks

Task IDs are ULIDs. Keep active items limited to concrete planned or in-progress work.

## Active

- id: 01K4M00000000000000000001 — title: Deploy Stockholm and add explicit regional lifecycle — owner: Codex — status: awaiting iOS and owner practical validation — last update: 2026-09-09
  - Authorized: Independent Stockholm Xray/AWG deployment, preserving Cape Town; reusable stack with retained-IP parking/redeploy and explicit PoC full release.
  - Implemented: Named Stockholm target, active/parked EndpointStack, scoped destroy/release with retry record, fresh per-device Xray generation and VLESS sharing. Full gate 82 tests; disposable Xray/AWG tests pass.
  - Live: Initial deploy and park passed; original EIPs remained tracked and tagged. Redeploy with preserved IPs and both runtime installations passed. Mac Xray, isolated AWG and two guarded native AWG reconnect tests passed. Native AWG renewed its session, passed 30/30 sustained HTTPS/exit checks, with one brief ping/DNS loss; original outage was not reproduced. Automatic recovery restored direct internet and left the Mac disconnected. iOS/owner practical performance remain pending.

- id: 01K4HEGQ000000000000000002 — title: Implement the first connectivity experiment — owner: Codex — status: awaiting owner recovery confirmation — last update: 2026-09-07
  - Goal: Scaffold CDK/TypeScript/npm, launch one EC2 instance with one EIP in Frankfurt running Amnezia when requested, and obtain macOS/iOS connection evidence.
  - Done: Implement/test/deploy CDK; verify tags and SSH; install XRay; export recovery/iPhone profiles; verify Mac native exit, HTTPS and reconnect; record Anthony’s 2026-09-07 practical macOS and iOS test passes.
  - Added: Named target commands/preflight, independent Cape Town IaC deployment, manual XRay install, local recovery/device exports, clean diffs and successful native Mac switching between both exits.
  - Trial: Anthony confirmed Cape Town macOS and iOS tests passed on 2026-09-07.
  - Retirement: Delete Frankfurt stack and explicitly release its retained EIP at Anthony’s request; verify no residual volumes/addresses/snapshots/stacks and unchanged Cape Town health. Complete on 2026-09-07.
  - Next: Confirm LastPass saves. On 2026-09-09 Anthony reported both Cape Town protocols too slow and requested a nearer primary while preserving Cape Town as backup. Anthony excludes Tel Aviv; region research recommends Frankfurt if age verification is ignored, otherwise a Stockholm trial; Stockholm deployment is now authorized and tracked above. See `docs/region-selection.md`.
  - Scope: `docs/development.md` and `docs/product.md`; reference-phase task; the separately authorized runtime migration is tracked above.

## Paused / Blocked

- Anthony intermediates all LastPass activity. Cape Town keys and recovery/device exports are prepared locally; encrypted recovery saves remain unconfirmed. Frankfurt copies remain historical material after retirement. The Xray checkpoint was committed and continuation authorized. Both final AWG device checks passed; no runtime work is blocked.

## Completed

- id: 01M24CJYD6Z8Q29SMM6BH20RNC — title: Validate the Stockholm ECS bridge trial and regional secrets — owner: Codex — status: complete — last update: 2026-09-12
  - Implemented one AL2023 x86_64 ECS host, separate bridge tasks/EIPs, immutable ECR releases, six regional SecureStrings, SSM administration and scoped start/stop/removal.
  - Passed: 2026-09-10 configuration/IMDS/EIP checks, real protocol HTTPS before and after stop/start, fresh-host credential restoration with retained IPs and clean live CDK diff. Initial park needed empty-cluster cleanup; dependency and stopped-host deregistration fixes have regression coverage.
  - Acceptance: Anthony confirmed connectivity through both protocols and IP masquerading on 2026-09-12, then requested commit prep. Devices and other privacy subtests were not enumerated. See docs/launch-stockholm-ecs.md.
  - Separate follow-ups: explicit cutover/old-host retirement, Cape Town export normalization/import, Graviton/Bottlerocket and combined IP/container evaluation. Automatic expiration/controller remains deferred.

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
