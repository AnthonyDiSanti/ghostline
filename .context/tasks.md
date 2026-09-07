# Tasks

Task IDs are ULIDs. Keep active items limited to concrete planned or in-progress work.

## Active

- id: 01K4HEGQ000000000000000002 — title: Implement the first connectivity experiment — owner: Codex — status: awaiting owner recovery confirmation — last update: 2026-09-07
  - Goal: Scaffold CDK/TypeScript/npm, launch one EC2 instance with one EIP in Frankfurt running Amnezia when requested, and obtain macOS/iOS connection evidence.
  - Done: Implement/test/deploy CDK; verify tags and SSH; install XRay; export recovery/iPhone profiles; verify Mac native exit, HTTPS and reconnect; record Anthony’s 2026-09-07 practical macOS and iOS test passes.
  - Added: Named target commands/preflight, independent Cape Town IaC deployment, manual XRay install, local recovery/device exports, clean diffs and successful native Mac switching between both exits.
  - Trial: Anthony confirmed Cape Town macOS and iOS tests passed on 2026-09-07.
  - Retirement: Delete Frankfurt stack and explicitly release its retained EIP at Anthony’s request; verify no residual volumes/addresses/snapshots/stacks and unchanged Cape Town health. Complete on 2026-09-07.
  - Next: Confirm LastPass saves; record any further usage or sleep/network-transition observations without expanding PoC gates. Frankfurt was retired at Anthony’s request; keep Cape Town live.
  - Scope: `docs/development.md` and `docs/product.md`; reference-phase task; the separately authorized runtime migration is tracked above.

## Paused / Blocked

- Anthony intermediates all LastPass activity. Cape Town keys and recovery/device exports are prepared locally; encrypted recovery saves remain unconfirmed. Frankfurt copies remain historical material after retirement. The Xray checkpoint was committed and continuation authorized. Both final AWG device checks passed; no runtime work is blocked.

## Completed

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
