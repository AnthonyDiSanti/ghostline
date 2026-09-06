# Tasks

Task IDs are ULIDs. Keep active items limited to concrete planned or in-progress work.

## Active

- id: 01K4HEGQ000000000000000002 — title: Implement the first connectivity experiment — owner: Codex — status: in progress — last update: 2026-09-07
  - Goal: Scaffold CDK/TypeScript/npm, launch one EC2 instance with one EIP in Frankfurt running Amnezia when requested, and obtain macOS/iOS connection evidence.
  - Done: Implement/test/deploy CDK; verify tags and SSH; install XRay; export recovery/iPhone profiles; verify Mac native exit, HTTPS and reconnect; record Anthony’s 2026-09-07 practical macOS and iOS test passes.
  - Next: Resolve destination identity-verification privacy issue and select a replacement region (see docs/region-selection.md); confirm LastPass saves, video, concurrent use and sleep/network transitions.
  - Scope: `docs/development.md` and `docs/product.md`; no custom runtime, hardening program, runbook framework, or HA prerequisite.

## Paused / Blocked

- LastPass computer-use access was denied. Anthony must save the prepared private key and eventual recovery/device exports in LastPass. iOS practical test passed per Anthony; region/privacy acceptance and remaining usage checks need owner input.

## Completed

- id: 01K4HEGQ000000000000000001 — title: Review reuse and rebuild documentation — owner: Codex — status: complete — last update: 2026-09-07
  - Outcome: Review personal-assistant tooling/IaC; incorporate Anthony's corrections; replace template docs with retrieval-oriented topics and preserve original inputs in the archive.
  - References: `docs/README.md`, `docs/reference-reuse.md`.
- id: 01K4EY40000000000000000000 — title: Review template and v0.3 design — owner: Codex — status: complete — last update: 2026-09-06
  - Outcome: Initial review discussed and superseded where appropriate by 2026-09-07 decisions; scratch draft retired.
