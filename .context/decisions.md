# Decisions

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
- Status: Both reviews and documentation rebuild are complete. Infrastructure implementation and deployment remain future work.
