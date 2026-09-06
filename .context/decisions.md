# Decisions

## 2026-09-07 — Make destination identity disclosure a release constraint

- Decider: Anthony.
- Decision: Mandatory identity verification or compulsory age-verification signup during intended browsing, including adult content, breaches Ghostline privacy requirements; choose another exit region if location causes the requirement.
- Evidence: Anthony reported iOS practical testing passed, then confirmed an age-verification flow requiring signup. German adult-access rules are confirmed; the specific browser and triggering location remain unconfirmed. EFF/ORG guidance supports the privacy concern but supplies no country whitelist; current EU/Swiss sources prevent assuming nearby regions are exempt.
- Follow-up: `docs/region-selection.md` records sourced findings and Canada Central as a candidate. No cloud/config migration performed; keep one endpoint as the steady-state topology.

## 2026-09-07 — Implement the complete reference setup, then debug

- Decider: Anthony (scope and launch authorization); Codex (implementation choices).
- Decision: Implement all intended PoC features before troubleshooting; do not require reduced building-block trials. Use the personal account/profile, one Frankfurt Ubuntu x86_64 host, full-device routing, available client IPv6 blocking and macOS KillSwitch. Keep Private Relay enabled and Proton disconnected.
- Result: Deploy `GhostlinePoc` using one `t3.small`, one retained EIP, encrypted 20 GiB root storage and operator `/32` SSH. Runtime installation and real device evidence remain separate from AWS success.
- Consequence: AGENTS and command/navigation docs now describe executable code and route live operations through `docs/launch.md`.

## 2026-09-07 — Match cross-project cost dimensions

- Decider: Anthony requested consolidated analysis; Codex adapted the reference convention.
- Decision: Global `Project=ghostline`, `Environment=prod`; resource-owned `System=xray` for the endpoint and `System=shared` for networking. Explicitly propagate EC2 tags to its root volume.
- Evidence: The account already has all three billing keys Active; deployed instance, volume and EIP tags verified. No reference-repository or account-wide billing changes.

## 2026-09-07 — Avoid unnecessary bootstrap resources for the asset-free stack

- Decider: Codex, within the single-host scope.
- Decision: Use built-in `LegacyStackSynthesizer` with existing CLI permissions; no toolkit or new IAM deployment roles are needed for this small inline template with no assets.
- Rationale: Avoid creating an AdministratorAccess execution role and storage infrastructure for a stack that uploads nothing. Live CDK deployment succeeded. Offline synthesis guards the no-assets/roles contract and inline size limit.
- Follow-up: Revisit synthesis when CDK owns runtime assets; no custom synthesizer/shim was introduced.

## 2026-09-07 — Confirm the single-instance deployment scope

- Decider: Anthony
- Decision: The initial deployment is one EC2 instance with one EIP in Frankfurt, plus its basic VPC/subnet/internet-gateway/security-group plumbing.
- Rationale: Test connectivity with the smallest useful setup. The reference repository's NAT gateways, load balancers, and subnet tiers were reviewed and rejected for this PoC.
- Consequence: Lead the README and architecture topic with the concrete deployment size so reference-reuse discussion cannot be mistaken for planned infrastructure.

## 2026-09-07 — Rebuild documentation around the reference experiment

- Decider: Anthony for scope/constraints; Codex for documentation organization and engineering defaults within that scope.
- Decision: Replace the upstream product-document structure with focused in-repo topics. Preserve source documents only as historical inputs; one authoritative home per concern.
- Rationale: Agent retrieval and technical implementation need clearer ownership than duplicated versioned questionnaires.
- Consequence: Current docs own product, architecture, development, and reference reuse. The original v0.3 documents are under `docs/archive/`. AGENTS now routes to this specification and explicitly prevents PoC scope inflation.

## 2026-09-07 — Reuse personal-assistant selectively

- Decider: Codex, following Anthony's instruction to inspect and adapt the reference.
- Decision: Adapt npm/TypeScript/CDK/testing principles; use one small endpoint stack. Do not transplant the reference topology or extract a shared package now.
- Rationale: The reference is an ECS/ALB application with HA networking and product-specific configuration. Its workflow is useful; its resource graph is inappropriate for this experiment.
- Follow-up: Possible later shared utilities are an SDK-based Parameter Store initializer, a configurable test phase runner, and existing managed Lambda/provider helpers when there is a real second consumer. See `docs/reference-reuse.md`.

## 2026-09-07 — Use Amnezia as a temporary reference, not the final deployment owner

- Decider: Anthony
- Decision: Tolerate Amnezia's normal requirements and assume sensible defaults to obtain a strong working setup for reference/testing. Later encode useful product/configuration choices in deterministic infrastructure and our own containerized solution, removing Amnezia server management.
- Rationale: The first milestone is evidence that the connection works under current censorship. It may fail or change substantially.
- Consequence: No installer audit, custom runtime hardening, HA, intense network segmentation, or prewritten runbook blocks launch. Record only necessarily performed launch activities; tighten the selected deployment architecture later.

## 2026-09-07 — Confirm devices, client responsibility, and secret stores

- Decider: Anthony
- Decision: macOS/iOS first, Windows/Android later. Prefer device-side IPv6 blocking with an IPv4 tunnel through off-the-shelf clients. Use LastPass for personal secrets and Parameter Store for application secrets.
- Decision: Save essential credentials/configuration during initial setup; defer a full rebuild exercise.
- Consequence: Actual client support is launch evidence, not a custom-client workstream. Parameter Store integration is added when needed, not forced into Amnezia merely for architectural consistency.

## 2026-09-06 — Review before implementation

- Decider: Anthony
- Decision: Review the template and design inputs, discuss concerns, inspect a reusable reference repository, then fill documentation and plan implementation.
- Status: Both reviews and documentation rebuild are complete. Infrastructure was subsequently implemented and deployed; see the current handoff.
