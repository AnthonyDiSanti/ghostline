# Handoff

## Current state

- Ghostline is documentation-only; no npm package, CDK source, deployed endpoint, or connectivity evidence.
- Anthony reconfirmed the deployment scope: one EC2 instance and one EIP in Frankfurt, with only basic networking.
- Product/reference review and documentation rebuild completed 2026-09-07. Read `docs/README.md` for current topics.
- Anthony narrowed the PoC: trust Amnezia defaults, tolerate its management model, record only launch activities, and defer hardening/runbooks/HA. Long-term intent is our own deterministic container deployment based on a working reference.
- macOS/iOS first; Windows/Android later. Prefer client-side IPv6 blocking. LastPass for personal/admin material; Parameter Store for application secrets.
- Reference repository `../personal-assistant` reviewed read-only. Reuse TypeScript/npm/CDK testing patterns, not its HA ECS/ALB topology. Concrete source map and possible shared components are in `docs/reference-reuse.md`.
- Original upstream documents preserved unchanged under `docs/archive/`; the first-review scratch draft was retired because its recommendations were superseded or incorporated.
- Git has no commits. The complete initial repository is uncommitted; no index changes made.

## Next steps

1. Incorporate any reply about AWS CLI profile and existing VPN/Private Relay use. These are launch inputs, not blocking product questions.
2. On implementation work, scaffold the small `infra/` package and offline checks, then one endpoint stack per `docs/development.md`.
3. Prepare a concrete deployment diff and perform the Amnezia experiment when launch is requested. No AWS actions were taken by the review/documentation task.

## Verification

- Inspected reference configuration, app/network wiring, construct candidates, npm/test harness, and selected working-memory notes; no source-repository tests were run.
- PASS (initial commit prep): all 20 candidate files inspected; 48 local/reference links resolve; archived inputs match their original SHA-256 hashes; ignore rules retain source/lockfiles while excluding generated/secret artifacts.
- PASS: scope consistency, JSON, whitespace, conflict-marker, and limited credential-marker checks. All work is untracked, so file-content checks supplement empty git diffs. The index remains empty; no commit-prep blockers.
- No application test suite exists. Infrastructure and device behavior remain unverified.

## Recent updates

- 2026-09-07 — Codex — Prepare the initial documentation commit; clarify the single-instance scope in README/architecture and record the owner's confirmation. Preserve the empty index; staging and committing remain user actions.
- 2026-09-07 — Codex — Rebuild documentation, incorporate owner corrections, and record selective reference reuse; update AGENTS to keep future work scoped to the experiment.
- 2026-09-06 — Codex — Complete initial design review; findings subsequently corrected/accepted by Anthony on 2026-09-07.
