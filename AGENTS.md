# AGENTS.md — Ghostline project contract

## Scope

Ghostline is a personal connectivity product with one regional architecture: official ECS-3 Bottlerocket ARM64, one Graviton host, one shared gateway task/service, separate Xray/AWG engines, one initializer, a restricted ECS network daemon and two EIPs. Stockholm is primary and Cape Town is backup. Read each launch record for observed deployment state before cloud changes.

Preserve protocol choices, device credentials and existing endpoints during runtime work. Clients switch manually; no HA, automatic protocol failover, custom rollback framework or custom client is required. Product scope and evidence limits live in `docs/product.md`. Keep secrets out of git and preserve production-account controls. Anthony intermediates LastPass activity and has deferred vault closeout.

Use the common ECS recipe for every region. Do not retain retired targets, alternative provisioners, installer-specific modes, compatibility branches or superseded architectural proposals. Git history owns removed approaches. Keep stable AWS resource names where renaming would replace live resources; a historical name is not a deployment mode.

## Start here

1. Read `README.md` and `docs/README.md`.
2. Open the relevant topic: architecture, ECS runtime, development, images or secrets.
3. Read `.context/handoff.md`, `.context/tasks.md` and `.context/decisions.md`.
4. Inspect actual code/git state and reconcile stale notes with evidence.

Read root `AGENTS.local.md`, when present, only for machine-specific execution overrides. Shared truth belongs in committed files. Before vendor/API/infrastructure work, consult `.context/knowledge/index.md`.

The reference repo is `../personal-assistant`, with working memory under `context/`. Review relevant files before reuse. Its HA/governance requirements do not apply here; changes to that repo require separate scope.

## Code and verification

The executable package is `infra/`; use Node 24 and `npm ci`. `npm test` runs typecheck, asset syntax/ShellCheck/Hadolint, fresh offline CDK synthesis and Vitest. Native linters or Docker are required. `npm run test:ecs-images` checks the ARM64 application artifacts with disposable synthetic credentials and the split bootstrap/daemon package contents. Native platform qualification is a separate central gate; package checks do not prove host behavior.

Use `npm run ecs <target> <action>` for deployment, images, regional secret import, start/stop, profiles and real-client verification. Read `docs/development.md` for argument contracts. `park <target>` retains tracked billable EIPs; `destroy <target>` releases only owned allocations. Park retains images and release support; destroy retires registry membership and removes owned regional repositories/control-plane resources. Standard Parameter Store credentials, expiring logs and independent security controls survive.

Use strict TypeScript, a thin CLI and the shared testable app builder. The catalog contains maintained endpoints only. Test regional reuse with synthetic configurations instead of creating deployable abandoned recipes. Keep account/region/resource inputs explicit; resolve the official regional AMI for the centrally qualified Bottlerocket version at each new launch and reject unknown configuration fields. Preserve exact Project/Environment/System cost-tag conventions.

Keep initializer and engines in one ECS task. Only the initializer receives server secrets through the execution role; engines have no task role and mount protocol-private RAM configuration read-only. Host fixtures supply generic storage/networking, not application secret retrieval. Platform source changes require centrally qualified artifacts. Every meaningful app/daemon/bootstrap/qualified OS/host-template change uses the same headless ECS blue-green host replacement with direct EIP handoff; unchanged releases are no-ops. Read the launch records and handoff for the observed active slot and lifecycle state. Bottlerocket replays its finite essential bootstrap on each boot; ordinary application releases do not alter host settings.

For nontrivial changes:
- Add short intent comments around non-obvious logic.
- Keep shell/Python bodies in standalone `runtime/ecs/` or `infra/test/fixtures/` files, including nested programs. Use explicit argument arrays for simple subprocess calls.
- Run targeted checks first, then the full available gate. Add meaningful behavioral regression tests.
- Run a fresh CDK diff before deployment. For source-only cleanup, compare synthesized active/parked resources, user-data bytes and release identities to a pre-change baseline.
- Never print decrypted parameters, client profiles, private keys or injected environment values. Emit selected metadata, hashes and equality results only.
- Do not stage, unstage, commit or amend unless explicitly requested.

For releases, read `docs/releases.md`: CDK owns static local `keep-production` references; publication owns global production/MRU aliases. Qualify once centrally, preserve fixed production plus three prior releases, and never add per-region fallback pins or retest protocols as a delivery gate. Regional release resources survive stop/park; complete destroy removes them. NVA/London publication members are explicitly retained. Read the handoff before resuming an unfinished lifecycle operation.

For new protocol releases, use `npm run images:build`: resolve official stable channels, verify artifacts, pass local encrypted/image checks and record `infra/image-inputs.json`. Publish/deploy reuse that selection without rediscovery. Exclude prereleases/drafts/nightly/main; `latest` alone is not evidence of stability. Read `docs/images.md` for AWG's tag-based channel and provenance limits. Local compatibility is not native-client or regional acceptance.

Immediately before real-client probes on macOS, check `scutil --nc list` and `route -n get <test-IP>`; a native VPN can connect after the initial session check. OneXraySE's System Extension can also remain connected while `scutil` reports Disconnected; verify the app and actual route. Disconnect with existing authorization before claiming direct-path results, then restore the prior connection.

Before native Mac recovery/sleep testing, read `docs/mac-client-stability.md`. The Amnezia raw daemon-socket watchdog is retired after a correlated service crash; do not reuse its ignored scripts as recovery.

## Documentation and completion

`docs/` owns current specifications and workflows; `.context/` owns live state, decisions and compact supplemental knowledge. Keep both current after substantial work. Remove superseded architectural instructions rather than retaining competing versions. Preserve source provenance, licenses, current resource inventory and observed evidence.

At major work-unit transitions or To Do reviews, perform all three upstream issue/release checks in `.context/tasks.md`: Amnezia #2933 until a fixed Mac build passes a coordinated trial, Bottlerocket core-kit #1059 until an official ECS-3 ARM64 fix passes isolated bootstrap replay and recovery, and Bottlerocket #4954 through maintainer feedback, implementation and official IPv6 bridge support qualified for Ghostline. Record the date and result of each check; issue closure or a merged fix alone is insufficient. The in-place controller and its temporary extra-reboot exception are retired with blue-green. This does not prove the upstream defect repaired: failed green boots require diagnosis, and official repair still needs isolated replay/recovery qualification.

Inspect the full dirty state, including staged/untracked files, at work-unit close. Preserve the user's index. State what changed, verification and remaining inputs. Propose a commit message for all uncommitted work unless scope is explicitly narrowed: imperative sentence-case title, blank line, capitalized imperative bullets. Mention pre-existing changes; do not imply synth success proves connectivity.

Keep instruction improvements small and specific and record their reason in working memory. Do not weaken security to bypass friction. Escalate a material unapproved workaround with concrete alternatives rather than silently introducing one.
