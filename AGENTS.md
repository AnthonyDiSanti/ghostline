# AGENTS.md — Ghostline project contract

## Scope and operating stance

Ghostline is a personal connectivity PoC. The immediate goal is to test whether an Amnezia-managed Xray/REALITY endpoint works under Anthony's current filtering conditions on macOS and iOS.

Assume sensible Amnezia defaults and tolerate its installation/management requirements for the reference experiment. Do not turn installer audits, custom runtime hardening, HA, intense segmentation, prewritten runbooks, or shared-component extraction into prerequisites. Capture necessary launch activities and observed settings. Deterministic deployment of our own containerized runtime is the intended follow-on if the reference works.

Keep secrets out of git and preserve existing production-account controls. Product scope is defined in `docs/product.md`; do not silently promote deferred work into acceptance gates.

## Start here

1. Read `README.md` and `docs/README.md`.
2. Open the relevant topic: `docs/product.md`, `docs/architecture.md`, `docs/development.md`, or `docs/reference-reuse.md`.
3. Read `.context/handoff.md`, `.context/tasks.md`, and `.context/decisions.md` for live state.
4. Inspect actual code/git state; reconcile stale notes with evidence.

If root `AGENTS.local.md` exists, read it for machine-specific command/environment overrides only. It is gitignored and must not hold shared project truth. Record material command deviations in the handoff.

`docs/archive/` contains historical upstream inputs, not current requirements. The reference repository is `../personal-assistant`; its working memory lives in `context/`. Review its relevant files before reuse. Its HA/governance requirements do not apply to Ghostline, and changes to that repository require their own task scope.

## Code and commands

The executable CDK package is under `infra/`. Use Node 24 and `npm ci`; `npm test` runs typechecking, fresh offline synth, and Vitest assertions. `npm run synth <target>`, `npm run diff <target>`, and `npm run deploy <target>` require the launch inputs documented in `docs/development.md`. Read the target's launch record linked from `docs/README.md` before touching a deployed endpoint.

Use npm under `infra/`, strict TypeScript, a thin CDK CLI and shared testable app builder. Prefer one straightforward endpoint stack per explicitly selected deployment. Preserve existing targets unless their modification or removal is authorized; see the named catalog and scoped commands in `docs/development.md`. Keep nonsecret configuration separate from runtime secret values; LastPass is the personal/admin store and Parameter Store is the application-secret store.

For non-trivial code changes:
- Add short intent comments to non-obvious functions/blocks.
- Run the smallest relevant checks first, then the full available verification gate.
- Add meaningful regression/property tests for changed behavior.
- Run a fresh CDK diff before an authorized deployment.
- Do not stage, unstage, commit, or amend unless requested.

## Documentation and working memory

- `docs/` owns stable specifications, code navigation, and workflow. Keep `docs/README.md` current when topics move or change.
- `.context/` owns live status, decisions, compact supplemental knowledge, and task-scoped drafts.
- Update relevant docs and working memory after every substantial turn. Capture decisions with date, decision-maker, rationale, and follow-up.
- Consult `.context/knowledge/index.md` before vendor/API/infrastructure work; follow existing relevant notes before adding new ones.
- Distinguish intended behavior, observed evidence, and later possibilities. Do not copy versioned product questionnaires into multiple authoritative locations.
- Keep docs small and retrieval-oriented; add directories/topics when needed, not to fill a preset taxonomy.
- Promote useful draft content and remove superseded scratch artifacts. Preserve historical sources only with explicit archive status.

## Completion and commits

Inspect the complete dirty state, including staged and untracked files, at the end of a work unit. Preserve the user's index. State what changed, what verification ran, and any remaining inputs.

Recommend a commit message covering all current uncommitted work unless Anthony narrows scope:
1. Imperative title in sentence-style capitalization.
2. Blank line.
3. Capitalized imperative bullets for key changes.

Mention when the message includes pre-existing changes. Do not claim connectivity from a passing infrastructure test.

## Instruction maintenance and risk

Keep instruction improvements small, specific, and testable; leave a breadcrumb in `.context/decisions.md` or handoff when changing workflow guidance.

If considering an unapproved workaround, pause to explain the alternative, tradeoffs, and cleanup. The explicitly accepted Amnezia reference phase is current scope, not a workaround requiring renewed permission. Do not degrade security posture for convenience.
