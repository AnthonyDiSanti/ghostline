# Decisions

## 2026-09-10 — Compare ECS host images and select a networking candidate

- Requester: Anthony asked about host images and whether both protocols can share a host with separate public identities. Codex recommends an AL2023 ECS-optimized x86_64 trial; Bottlerocket is an alternative with additional host-customization constraints, and arm64 requires different runtime builds.
- Proposal: two bridge-mode ECS tasks on one host/ENI/two private IPs/two EIPs, with an explicitly owned host filtering/SNAT component reconciled against task identity changes. ECS lacks Compose's per-HostIp/per-network source-IP knobs. Avoid assigning AWG host-network NET_ADMIN merely for convenience or mutating ECS-managed task ENIs.
- Evidence limit: current Compose topology already proves the physical one-host/two-IP outcome; the proposed ECS network component has not been built or tested. [Expanded assessment](scratch/2026-09-10-on-demand/ecs-ec2.md) records source links, alternatives and acceptance checks. No live changes.

## 2026-09-10 — Prefer stock ECS host and native deployment mechanisms

- Prompt: Anthony questioned why ECS-ready hosts and parameterized ECR loading appeared to require custom infrastructure code.
- Correction/recommendation by Codex: AWS already provides ECS-optimized AMIs, ECR pulls and Parameter Store secret injection, with standard CDK constructs. Recommend ECS-optimized Amazon Linux 2023 for a new trial; retaining Ubuntu via manual agent installation is unnecessary absent a demonstrated dependency.
- Remaining custom scope: render file-based protocol configuration and preserve two-IP networking/lifecycle behavior. Distinguish native environment injection from a file initializer; neither requires a new secret-management service. Update the existing ECS assessment rather than creating another platform proposal. No live changes.

## 2026-09-10 — Reconsider lifecycle around SSH-free ECS on EC2

- Requester: Anthony prefers container releases over a custom AMI, questions SSH-key retention, and proposes ECS with one EC2 host. This is a design discussion; no live migration target/cutover was selected.
- Assessment: SSH is not a protocol or guest-management requirement. Recommend reusable images plus runtime Parameter Store configuration, AWS API-driven deployment and Session Manager diagnostics. Existing keys remain recovery material until replacement workflows pass.
- Consequence: reconsider standalone start/stop work before implementation. Validate ECS-compatible two-EIP binding/SNAT, explicit one-host capacity and identity-preserving task/host replacement. Do not bake credentials into image layers or equate zero ECS tasks with zero EC2 capacity. [Assessment and primary sources](scratch/2026-09-10-on-demand/ecs-ec2.md).

## 2026-09-10 — Select start/stop before regional secret migration

- Decider: Anthony requested explicit start/stop implementation, followed by consistent per-region Parameter Store extraction, with an inventory before starting.
- Inventory/proposal: retain existing regional identities; store complete server bundles and separate device profiles as SecureStrings under `/ghostline/prod/server/` and `/ghostline/prod/clients/`. Keep SSH admin keys and legacy application backups in personal recovery; keep host SSH identity host-local. These storage details are recommendations pending the discussion, not migrated state.
- Evidence: inspected generators and local export structure/counts/sizes without emitting values. Current bundles fit Standard's 4 KB limit. Cape Town Xray needs normalized client exports with verified device mapping. [Secret inventory](../docs/secrets.md) owns details and source links. No infrastructure or secret mutation.

## 2026-09-10 — Explore configurable regional expiration

- Requester: Anthony; proposal by Codex, not an approved implementation or live policy change.
- Direction to discuss: separate permanent/idle lifetime from stop/park/release cleanup; aggregate authenticated presence across both protocols, with explicit uncertainty for sleeping/quiet clients. Prefer a small shared serverless controller for timers independent of the Mac and disposable exits.
- Constraints: cloud launches need durable images/credentials and a replacement for the local-only SSH installation path; released IPs need profile refresh or validated DNS re-resolution. Keep existing security boundaries and cost-tag dimensions. No client browsing telemetry is needed.
- Next: settle interface, idle semantics and address-retention preference. [Discussion draft](scratch/2026-09-10-on-demand/proposal.md) records current-code gaps, primary sources and candidate design. Existing Stockholm/Cape Town resources remain unchanged.

## 2026-09-09 — Retain Cape Town as backup and reassess a nearer primary

- Decider: Anthony reports unacceptable speed on both AWG and REALITY, confirms Frankfurt was substantially faster, and wants Cape Town preserved for verification problems. He excludes Tel Aviv because he does not want a persistent UAE-to-Israel connection; this is an owner constraint, not a measured surveillance claim.
- Recommendation: Codex recommends Stockholm (`eu-north-1`) for the next independent trial, superseding the earlier Tel Aviv recommendation. No new location or deployment is authorized yet.
- Rationale: Stockholm is approximately Frankfurt-distance from Dubai. Milan is only marginally closer and Italy enforces pornography age checks; Zurich also has relevant age-check obligations. Sweden rejected specific pornography verification motions in January 2026, while broader national/EU age-assurance work remains a limitation. Frankfurt is a known faster option if the owner accepts its observed verification friction.
- Scenario clarification: Anthony then asked to ignore age verification in the comparison. Under that assumption, recommend Frankfurt first because its performance is owner-proven. Keep this conditional; no product requirement or deployment authorization changed. Broad internet access does not imply literally zero content blocking.
- Latest direction: Anthony agrees Stockholm is worth testing as the intended primary, preserving Cape Town as backup. Treat actual speed as unverified and do not infer launch authorization from the recommendation discussion.
- Milan comparison: Codex favors Stockholm independently of age verification because Italy’s Piracy Shield adds content-blocking and reported collateral-blocking risk. Sweden also has targeted blocks; neither AWS egress was measured. The roughly 100 km distance difference does not establish a speed winner.
- Follow-up: Compare real Dubai performance and browsing pass/fail before promotion; both protocols being slow does not rule out their shared host as a bottleneck. Preserve existing resources/profiles. Evidence and the full-AWS-region scope live in `docs/region-selection.md`.

## 2026-09-07 — Own the runtime with a credential-preserving Xray checkpoint

- Decider: Anthony authorized implementation after selecting AmneziaWG, shared compute and a staged ownership migration.
- Decision: Keep the same Ubuntu 24.04 AMI and upstream container distribution choices. Export all Xray configuration, restore it on a fresh host, move the existing EIP allocation and confirm unchanged macOS/iOS profiles. Retire the original server after that checkpoint, before installing AWG on the new host's second EIP.
- Boundary: One permanent host and two manually selected protocols, not automatic failover. No rollback command/framework, ECR/ECS infrastructure, Parameter Store or on-host AWS secret plumbing. Local bundles demonstrate portable credentials; Anthony handles LastPass.
- Implementation: One ENI/two private IPs, separate Compose projects and Docker SNAT per protocol; staging IP becomes AWG's permanent IP. Preserve original CloudFormation resource identities and remove temporary migration scaffolding only after owner-confirmed retirement.
- Evidence: Preparation diff added only five managed resources; cutover diff replaced only the EIP association. Both deployments completed. The complete six-file Xray bundle contains two clients; installed server JSON matches byte-for-byte. Actual container egress is the original EIP; repeat install retained the same container ID/start timestamp. Reboot/device evidence is recorded in the launch record as it completes.
- Workflow breadcrumb: Update AGENTS and product/runtime navigation to the authorized ownership phase and explicit owner checkpoint; preserve the original host until both device passes.
- Checkpoint result: Anthony validated the unchanged macOS/iOS profiles on 2026-09-07, then requested commit prep and continuation only after his commit. Record the migration checkpoint as passed; leave the deployed cutover stage, original host and disabled AWG unchanged during this pause.

## 2026-09-07 — Retire Frankfurt after the Cape Town trial

- Decider: Anthony requested Frankfurt teardown; Codex recommends deleting the complete dedicated stack and releasing its retained EIP.
- Rationale: Cape Town passed both device trials and Frankfurt is no longer needed. No CDKToolkit, asset bucket, registry or deployment role was created in Frankfurt. The free networking is inexpensive to recreate; retaining the IPv4 address alone costs $0.005/hour (about $3.65 per 730-hour month).
- Scope: Delete only Frankfurt `GhostlinePoc` and its retained EIP; preserve Cape Town and local recovery material. Keep the named Frankfurt configuration as a redeployment recipe, not a claim that resources exist. A future deployment needs a new address and runtime installation/restoration.
- Sources: [CloudFormation pricing](https://aws.amazon.com/cloudformation/pricing/), [VPC/IPv4 pricing](https://aws.amazon.com/vpc/pricing/). Live inventory and a fresh no-change CDK diff confirmed the deletion scope; final results belong in `docs/launch.md`.

## 2026-09-07 — Correct the agent's npm environment

- Decider: Anthony requested addressing the unknown-env-config warning; Codex traced its source.
- Evidence: The managed command environment injects both cases of `npm_config_http_proxy` alongside supported `npm_config_proxy` and `npm_config_https_proxy` pointing at the same managed proxy. No matching setting was found in inspected npm/shell configuration or shell snapshots; both invalid names occur in the installed Codex executable. Installed npm defines `proxy` and `https-proxy`, not `http-proxy`.
- Action: Omit only the unsupported duplicate names from agent-run npm commands, retaining supported proxy settings and normal warning levels. Record the machine-specific command correction in ignored `AGENTS.local.md`; no application wrapper or cloud change is needed.
- Verification: Full npm test passed all 42 assertions without the unknown-env-config warning. `npm config get proxy` confirmed the supported proxy value was unchanged. Registry ping passed with the environment's normal network escalation; the initial sandboxed ping encountered ECONNRESET.
- Limit: This corrects agent invocations; Codex still injects the invalid names. Drop the command adjustment once the upstream runtime fixes environment generation. Global instructions were not changed.

## 2026-09-07 — Add Cape Town while preserving Frankfurt

- Decider: Anthony (trial, preservation and future direction); Codex (implementation boundary).
- Decision: Add one independent Cape Town endpoint from the same minimal IaC. Preserve Frankfurt and its profiles. Prepare for future selectable/on-demand exits through named deployment configuration, not a fleet controller or HA design.
- Implementation: Explicit target commands, regional AMI/AZ pins, separate artifacts/SSH key and unchanged consolidated cost tags. Keep Frankfurt’s stack/resource identities; live diff confirmed no changes. Amnezia remains the runtime installer, with fresh identity per host.
- Evidence: Archive the supplied VPN location research under `docs/archive/`; external citation tokens remain unresolved. Region monitoring observed ENABLING then ENABLED and a successful EC2 preflight after Anthony enabled Cape Town.
- Workflow breadcrumb: AGENTS now states one endpoint stack per explicit target, requires preserving other deployments, and routes agents to the selected target's launch record. Auto-review initially rejected agent-driven region enablement; Anthony performed it, resolving that prerequisite without changing IAM controls.
- Result: Cape Town deployed; Amnezia XRay installation and native Mac exit/HTTPS succeeded. Both exits work when selected, and both CDK diffs are clean. Saved dedicated key, VPN-only profile and two-server recovery export locally.
- Trial update: Anthony reported Cape Town macOS and iOS tests passed. LastPass saves remain unconfirmed; keep automated lifecycle management deferred.

## 2026-09-07 — Make destination identity disclosure a release constraint

- Decider: Anthony.
- Decision: Mandatory identity verification or compulsory age-verification signup during intended browsing, including adult content, breaches Ghostline privacy requirements; choose another exit region if location causes the requirement.
- Evidence: Anthony reported iOS practical testing passed, then confirmed an age-verification flow requiring signup. German adult-access rules are confirmed; the specific browser and triggering location remain unconfirmed. EFF/ORG guidance supports the privacy concern but supplies no country whitelist; current EU/Swiss sources prevent assuming nearby regions are exempt.
- Superseded follow-up: Canada was a provisional candidate and one endpoint was the earlier scope. Anthony subsequently selected a parallel Cape Town trial while preserving Frankfurt; see the decision above.

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

## 2026-09-07 — Retire the reference host and enable shared-host AWG

- Decider: Anthony authorized continuation after committing the validated Xray migration; Codex implemented it.
- Result: Retire original instance `i-0abac95ff3acf0d6a`, its security group and root disk; verify termination and disk absence. Preserve managed host, ENI and both EIPs. Remove one-time migration stages; deploy only UDP 443 ingress for AWG.
- Constraint learned: AWS KeyPair tag changes require replacement and can cascade to EC2. Preserve the existing free key's historical System=xray tag; billable shared compute/disk/networking already have the intended dimensions. Regression tests guard resource identities.
- Client sharing: Generate independent Mac/iOS peers once, with locally derived VPN-link files and native-config QR images. Keep Amnezia as the connection client; no server installer or online QR service. Update AGENTS to remove the completed retirement checkpoint.

- Repeatability fix: owned-runtime export exposed Mac tar metadata pollution. Disable AppleDouble emission at archive creation, remove verified sidecars once, and keep strict bundle validation. Successful re-export preserves all six original Xray file values; a real extended-attribute regression test guards the fix.

## 2026-09-07 — Accept the shared-host AWG work unit

- Decider: Anthony reported both outstanding device tests passed and requested commit prep.
- Result: Close the iPhone AWG import/practical/manual-switch and Mac post-reboot AWG checkpoints. The authorized one-host, two-protocol work unit is complete; do not repeat accepted tests or add deployment work before commit.
- Evidence limit: This is practical owner confirmation, not a new agent-measured IP/DNS/IPv6 result. LastPass recovery saves remain owner-mediated and unconfirmed; document them as a follow-up rather than a code-commit blocker.
- Instruction breadcrumb: Update AGENTS from planned migration to the validated deployed state.

## 2026-09-07 — Assess on-demand platform choices

- Requester: Anthony; analysis/recommendation by Codex, not an accepted migration decision.
- Finding: Fargate rejects the TUN device and NET_ADMIN used by current AWG. Direct public Xray tasks could have negligible idle compute/network cost but changing addresses; retained NLB/NAT infrastructure is materially more expensive.
- Recommendation: Keep the validated EC2 runtime and evaluate explicit stop/start first. Cape Town modeled idle cost is $9.394/month (20 GiB gp3 + two EIPs); deleting disk/compute while retaining IPs saves only $2.094/month. Keep free basic networking. Rare exits can release addresses if profile/discovery changes are acceptable.
- Follow-up: Choose retained versus disposable identities before designing lifecycle automation. Egress, optional retained storage and CPU surplus charges remain separate. Source/rate details are in `docs/deployment-lifecycle.md`; no cloud changes were made.

## 2026-09-07 — Repair the hidden client window without resetting profiles

- Decider: Codex, within Anthony's request to diagnose and fix the unusable Mac client.
- Evidence/action: normal idle GUI event loop plus enabled Start minimized preference; back up preferences and disable only `Conf.startMinimized`, then relaunch. Visible UI and both saved profiles returned; encrypted profile data/default identity remain unchanged.
- Consequence: No full uninstall, credential reset, Keychain edit or server change. Keep Start minimized disabled on this client build; reusable recovery is in `.context/knowledge/amnezia.md`.

## 2026-09-09 — Stockholm and explicit address lifecycle (Anthony / Codex)

- Anthony authorized deploying Stockholm with both protocols and retaining Cape Town as backup. Use the same Canonical Ubuntu 24.04 build in eu-north-1, one host/two EIPs and independent regional credentials.
- Anthony requested reusable regional stacks, retained-IP redeployment and explicit PoC release. Extend existing `EndpointStack` with active/parked states: parked leaves only tracked EIPs, and active reattaches them. `destroy` deletes the stack then releases only its captured, still-owned unattached allocations. Prefer full release for abandoned PoC exits; no idle addresses allocated merely by adding catalog entries.
- Fresh Xray generation follows the inspected Amnezia 5.0.1.5 REALITY/Vision settings with separate device UUIDs. Standard VLESS imports/QRs avoid returning to Amnezia's server installer. Cape Town credentials and deployment are untouched.

- Agent contract updated to scope the one-host constraint per region and name the explicit retention/release commands, matching Anthony’s new multi-region lifecycle request.

## 2026-09-09 — Guard disruptive AWG client testing (Anthony / Codex)

- Anthony explicitly authorized reconnecting AWG to diagnose the Mac outage, with local recovery if connectivity fails. Verify Amnezia's own daemon deactivate API, arm a bounded local watchdog before connecting, run controlled probes and always restore disconnected/direct state after the test. No security controls, runtime credentials or server configuration are relaxed to make the test pass.

- Commit-prep breadcrumb: clarify that the owner-confirmed Apple checkpoint is Cape Town, with Stockholm iOS/practical trials still pending; replace stale AppleScript UI guidance with the verified CUA Raise workflow.

## 2026-09-10 — Begin the ECS bridge migration

Anthony selected stock ECS-optimized Amazon Linux 2023 x86_64 first, with Bottlerocket/Graviton later and Ubuntu only if Amazon Linux fails. Implement a separate Stockholm trial preserving both existing exits and all protocol identities. Use one explicit EC2 host (no autoscaler), two ECS services, two EIPs, ECR content tags and regional server/client SecureStrings. Updated AGENTS scope to reflect this authorization; HA and automatic expiry remain deferred. Validate both protocols, replacement routing and start/stop before considering cutover.

### ECS bridge trial findings

The AWS AL2023 image runs the preserved Xray and userspace AWG images with ECS bridge networking, restricted capabilities and tmpfs config. ECR/Parameter Store restoration and real protocol HTTPS passed after a retained-IP rebuild. ECS cluster deletion must follow host termination; stopped/disconnected hosts require explicit deregistration. Tests add both guards. AWG validation must run outside an already-active Xray tunnel: the nested test failed against both new and old endpoints, then passed directly without server changes. Keep native-device acceptance and cutover separate.

## 2026-09-12 — Accept the ECS bridge checkpoint

- Decider: Anthony reported both protocols working, confirmed IP masquerading and requested commit prep.
- Outcome: Close the AL2023 x86_64 ECS bridge trial work unit. Record owner-confirmed connectivity and IP masquerading separately from the existing agent-run HTTPS/configuration/lifecycle evidence; devices and other privacy subtests were not enumerated.
- Follow-up: Cutover and old-host retirement require an explicit instruction. Graviton/Bottlerocket, combined containers/IPs, Cape Town secret normalization and automatic expiry remain separate work.
- Instruction breadcrumb: Update AGENTS with acceptance, preserve the explicit cutover boundary, and route ECS commands to docs/ecs.md.
