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

## 2026-09-12 — Prove unattended Stockholm lifecycle before cutover

- Decider: Anthony requested full unattended lifecycle validation before retiring the working Stockholm fallback, then explicitly excluded Cape Town from this work.
- Scope: Exercise the independent Stockholm ECS trial from running and stopped states, retaining its EIPs and credential identities. Preserve the older Stockholm host; cutover remains separate.
- Automation correction: Cold ECS rebuilds inherit CDK's interactive IAM approval by default. Make only the explicitly selected ECS deploy/publish command noninteractive, retaining fresh diffs and account/region validation; do not change IAM/network policy or global CDK settings.
- Result: Both retained-IP cold-rebuild paths and stop/start passed with closed stdin, unchanged credentials/images/IPs and real HTTPS/exit checks for both protocols. No manual repairs were needed. The old Stockholm deployment remains preserved; Cape Town was excluded.
- Completion: Full gate 96 tests/four offline synths and final live diff pass. The lifecycle prerequisite for cutover is satisfied; cutover itself remains separate. See docs/launch-stockholm-ecs.md.

## 2026-09-12 — Promote Stockholm ECS and retire the Ubuntu predecessor

- Decider: Anthony explicitly authorized cutover after unattended lifecycle validation and asked to check the existing local Stockholm profiles.
- Outcome: Keep ECS host, image/credential identities and its two existing EIPs. Delete only the old Stockholm `GhostlinePoc` endpoint and explicitly release both captured old allocations; Cape Town is unchanged and was not targeted.
- Client handling: Import current ECS exports with preserved Mac credentials, verify native REALITY and guarded AWG, retain familiar profile names and remove obsolete local entries. Leave REALITY selected and the VPN disconnected. Current iOS exports are ready for owner-mediated replacement if the phone still uses old addresses.
- Identity choice: Retain target `stockholm-ecs`, stack names `GhostlineEcsTrial` / `GhostlineEcsTrialImages` and `credentialSource: stockholm`; renaming these for presentation would add resource/recovery churn. Document `stockholm` as a retired recipe. Render current client endpoints from live outputs without rewriting imported parameter identities/versions.
- Evidence: Old host/disk/ENI/EIPs gone; active ECS resources/images/IPs and six parameter versions unchanged. Native Mac checks, post-retirement server/disposable-client checks, full local gate and final diff pass. No new iOS, sustained performance or IPv6 acceptance is inferred.
- Instruction breadcrumb: Update AGENTS and topic routing to the completed cutover and active ECS target; preserve the separate Cape Town boundary.

## 2026-09-12 — Hold Cape Town stable during primary architecture refinement

- Decider: Anthony explicitly requested leaving Cape Town as the stable backup while refining the primary deployment architecture, then upgrading it when that work is finished.
- Boundary: Keep the existing Cape Town Ubuntu/Compose host, two EIPs, credentials and client profiles in place. Defer its client-export normalization/Parameter Store migration to the later upgrade; use Stockholm for primary architecture work.
- Planning: Record remaining host/CPU and network/container evaluations, full ECS address-release/relaunch validation, and optional lifetime/remote-launch scope separately from the completed ECS/lifecycle/cutover checkpoints. Listing them does not initiate infrastructure changes.
- Instruction breadcrumb: Clarify the Cape Town preservation/upgrade sequence in AGENTS; make the task list current and separate owner recovery/profile follow-ups from completed implementation.

## 2026-09-12 — Accept iPhone connectivity, defer vault backup and assess packaging

- Decider: Anthony confirmed both Stockholm protocols work on the iPhone and explicitly deferred LastPass backup until architecture refinement is finished because the material is changing. Close the iOS profile follow-up; preserve local copies and regional parameters without repeated interim vault reminders.
- Scope: Anthony requested packaging evaluation, retaining external port 443 for both protocols and the existing separate addresses. Clarify that TCP 443 and UDP 443 can share an IP; separate public addresses provide protocol address separation. No address release or runtime change was made.
- Code/source assessment: Stockholm already uses one EC2, one ENI, two services/tasks/containers and two EIPs. Recommend retaining separate containers/services; a shared task couples task releases, and a single container adds supervision plus new per-engine egress classification. ECS also documents a per-container same-port/multiple-protocol restriction, so a combined bridge container would require distinct internal ports mapped to external TCP/UDP 443 and validation.
- Follow-up: This is an initial packaging recommendation, not owner selection of a new deployment. Keep Cape Town stable; host/CPU and optional consolidation trials remain separate. Sources and implementation consequences are captured in docs/ecs.md.

## 2026-09-13 — Distinguish packaging overhead from instance sizing

- Requester: Anthony; assessment/recommendation by Codex, not an accepted resize or resource-limit change.
- Finding: Merging containers preserves the two engine processes and shared host services. Boundary overhead may shrink, but no benchmark shows a meaningful capacity gain. Current memory limits account for 768 MiB at ECS placement; actual usage is unmeasured, and container CPU settings are shares rather than dedicated cores.
- Recommendation: Measure representative and simultaneous loads plus restart peaks, tune reservations/limits separately from packaging, then validate any smaller instance. Near a capacity threshold a small saving could matter; do not claim zero savings or invent a percentage. Sources and sizing rationale are in docs/ecs.md.

## 2026-09-13 — Research maintained Xray containers

- Requester: Anthony; recommendation by Codex, not an accepted image migration or engine upgrade.
- Finding: Official XTLS and third-party Teddysun images both publish current 26.7.28 and newer 26.9.9 with amd64/arm64 variants. Live registry metadata resolves stale overview pages; the release API labels both engine versions prereleases. Our current container packages the official ZIP on Alpine 3.15 rather than inheriting either image.
- Recommendation: Evaluate official `ghcr.io/xtls/xray-core` at the existing 26.7.28 version, pinned by digest and retained in ECR. Its upstream-owned distroless/non-root packaging requires adapting secret-file preparation, permissions and diagnostics; Teddysun is easier for the existing shell wrapper but adds another binary publisher. Preserve protocol/credential/address identity and validate runtime behavior separately from a later version or CPU change.
- Follow-up: Sources, resolved digests and implementation consequences live in docs/xray-images.md. No images were executed or published and no deployment/client state changed.

## 2026-09-13 — Use encrypted task storage first and retain the RAM follow-up

- Decider: Anthony selected a one-shot initializer and encrypted task storage while planning migration to the unmodified official XTLS image, then explicitly requested a recorded follow-up for RAM-backed configuration.
- Rationale: Keep the first integration straightforward using ECS-managed storage on the existing encrypted EBS disk. Preserve regional Parameter Store identities; revisit RAM-backed rendered files after the initial migration rather than making shared-memory mount handling a prerequisite.
- Follow-up: Task `01M2DA6YG0BA1GD47ZCMKBEWRX` covers RAM-backed handoff, permissions, cleanup and unattended lifecycle validation. This records the selected design and backlog; no runtime or infrastructure implementation occurred.


## 2026-09-13 — Deploy official XTLS with initializer-only secret delivery

- Decider: Anthony authorized the selected migration and expressly approved Parameter Store decryption when plaintext stays outside the context window. Values stayed in verification processes; diagnostic artifacts contain hashes/metadata only.
- Outcome: Mirror unmodified official Xray 26.7.28 amd64 to retained ECR; add a pinned Alpine/jq one-shot initializer with no networking, a private encrypted task volume and non-root read-only engine access. Keep two services/EIPs and existing protocol/credential identities. Cape Town remains untouched.
- Evidence: Official mirror identity, initializer handoff/permissions/secret recipient, server isolation/egress and real protocol tests pass. Unattended stop/start and retained-IP rebuild preserve all six secret values/versions, allocations/tags and images without repairs. Both existing iPhone profiles and native Mac protocol probes pass; final CDK diff is clean. Exact host and evidence: docs/launch-stockholm-ecs.md.
- Learning: Distroless diagnostics use host Python in the engine's network namespace. AL2023 Python 3.9 raises its distinct `socket.timeout`; test it explicitly so blocked IMDS is not misclassified. RAM-backed files remain deferred; deleted-host disk cleanup does not establish instant task cleanup or secure erasure.

## 2026-09-13 — Prioritize recurring Mac sleep/VPN instability after migration handoff

- Decider: Anthony reported recurring configd crash/beach ball/hard restart and suspects sleep while Amnezia is connected. Treat this as a hypothesis until crash reports and sleep/wake evidence support it; a passing short tunnel test cannot establish client stability.
- Boundary: Finish and record the server migration, then pause to touch base before investigating. Anthony subsequently authorized remaining awake connect/disconnect checks and kept the Mac active; guarded AWG passed and final VPN state is disconnected. No sleep reproduction or client reinstall/reset was performed.
- Next: Task `01M2D00GJ5HE1591CYW6KSFVV1` starts with crash/panic/configd reports, sleep/wake timing and exact versions; evaluate replacement clients if evidence implicates Amnezia without a reliable fix. Keep this separate from RAM/host/CPU/Cape Town architecture work.


## 2026-09-13 — Diagnose recurring Mac network watchdog panics and retire socket recovery

- Requester: Anthony authorized investigating three to five crashes after committing the server migration and clarified that startup cleanup followed the latest reboot. Read-only report/log analysis confirms three sleep/wake-related configd watchdog/panic pairs. In two, a blocked Amnezia service thread owns the mutex configd needs; upstream #2933 corroborates the failure class. Record a strongly implicated Amnezia/macOS interaction, not a fully proven lock cycle or sole-vendor defect.
- Diagnostic correction: a separate service SIGSEGV at 13:05 coincides with our previous raw-socket AWG cleanup. Retire that watchdog; route/HTTPS success did not prove daemon stability. Added a small AGENTS guard and revised the historical recovery note to prevent repeated use. This is independent of the preceding 12:55 system panic.
- Recommendation by Codex: trial an Apple NetworkExtension-based Mac REALITY client, with SFM as a concrete candidate, preserving the server and credentials. Actual installation and owner-coordinated sleep/wake validation remain open; do not treat the incident as resolved. No system settings, runtime or cloud changes were made. Evidence and sources: docs/mac-client-stability.md.
- Follow-up by Anthony: select SFM for the trial. Use the official standalone macOS distribution through Homebrew; prepare a private sing-box profile from the existing Stockholm REALITY credentials after installation. Selection is recorded; no successful replacement-client or sleep test is claimed yet.

## 2026-09-13 — Scope the replacement to REALITY and establish SFM incompatibility

- Decider: Anthony keeps AWG in Amnezia and considers Shadowrocket only if comparable AWG instability occurs. Rechecking all three preserved system crashes finds the Xray-specific tun2socks path each time; this strongly supports REALITY involvement, but does not directly establish selected-profile state. The AWG cleanup service crash is separate from sleep/watchdog panics.
- Evidence: private profile conversion/schema validation succeeded. Official sing-box 1.14.0 fails live REALITY authentication while official Xray 26.7.28 with the original credentials passes expected-exit validation. A temporary localhost-only server comparison reproduces the failure and resolves it by changing only its client-version floor. Pinned code establishes a 26.3.27 server default versus sing-box's 1.8.1 REALITY marker.
- Boundary: installation remains incomplete (owner sudo authentication needed), and live version policy, server image, credentials and native VPN settings are unchanged. No silent floor reduction, server downgrade, client version spoof or Shadowrocket installation. The upstream warning makes a deployed compatibility-policy change a censorship tradeoff requiring discussion under the existing project contract.
- Recommendation by Codex: assess an Apple client using current Xray while preserving server settings; alternative is explicit evaluation of the server-policy tradeoff for SFM. The earlier SFM recommendation overgeneralized protocol support and must not be treated as exact-version compatibility evidence. Task and diagnosis document hold the current blocker.

## 2026-09-13 — Remove SFM and preserve the deployed server for client trials

- Decider: Anthony explicitly rejects modifying the image to accommodate SFM, requests removal and focuses on alternative clients. Keep the deployed server/version policy intact. Revisit official Amnezia when a relevant fix can be validated, ideally before a later compatibility change forces another switch.
- Outcome: SFM installation had never completed; verified app/cask/receipt absence and removed its cached package, private trial profile and headless sing-box tools. Preserved private diagnostic evidence/provenance; no native VPN settings or cloud deployment changed.
- Recommendation by Codex: trial Happ’s Apple App Store build next because its release history includes the same Xray 26.7.28 used in the successful live control; Streisand is another current-engine candidate. This is not owner selection or a native connectivity/stability pass. Verify actual engine and Apple tunnel integration; the standalone Happ desktop daemon is a different packaging choice. Keep AWG in Amnezia and Shadowrocket conditional on comparable AWG instability.

## 2026-09-13 — Compare replacement clients by source availability and adoption

- Criteria from Anthony: prefer open source when it differs between Happ and Streisand; otherwise favor mass adoption.
- Findings by Codex: Happ explicitly retains private app source, while no published Streisand app source/license was found. Both use open-source Xray, which is a separate layer. US App Store ratings favor Happ (~15k at 4.6/5 versus ~2.1k at 4.4/5); these are platform-combined reputation/adoption proxies, not active-user counts or Mac sleep evidence.
- Recommendation: retain Happ’s Apple App Store build as the next REALITY experiment. Its developer has documented a provider-oriented push backend; review optional controls with our local profile during setup. Source availability/adoption findings and evidence limits are captured in docs/mac-client-stability.md. No owner selection, installation, client connection or server change occurred in this comparison.

## 2026-09-13 — Reject provider-driven remote client configuration

- Requirement from Anthony: a client should not expose third-party remote control. Codex withdraws the Happ recommendation; source/adoption criteria apply only after suitability for owner-controlled use.
- Evidence: Happ’s developer describes push-driven subscription URL/app-setting changes without user action; official docs describe subscription management controls and Provider ID backend reporting. This is remote configuration, not evidence of arbitrary command execution. Current iOS policy describes notification consent, but Mac/local-profile behavior and complete disablement remain unverified; describing the whole feature as optional was too confident.
- Follow-up: screen Streisand/other candidates for the same unwanted management dependency before selection. Happ was never installed and received no Ghostline credentials. Preserve deployed image/settings, AWG scope and existing identities. Sources and distinctions are in docs/mac-client-stability.md.

## 2026-09-13 — Review Streisand without assuming it resolves Happ’s trust mismatch

- Requester: Anthony asks for a Streisand review and the origin of its name. No installation is implied by this document review.
- Findings: the official store’s no-data label conflicts with its linked policy describing analytics/crash collection, 90-day retention and AdMob advertising. No comparable provider-management API was documented, but app source and exact runtime behavior remain unavailable/unverified. The advertised current Xray version exceeds the server floor; it is not a native compatibility or sleep pass.
- Recommendation by Codex: do not select Streisand for adoption yet; broaden toward inspectable Mac client code and documented owner-controlled local operation. No app installed, credentials imported or deployed settings changed. The likely Streisand-effect naming reference is explicitly an inference; developer intent is unconfirmed. Evidence and limitations are in docs/mac-client-stability.md.

## 2026-09-13 — Accept Streisand tracking and complete one final client search

- Decider: Anthony retains Streisand as a strong stopgap candidate and explicitly accepts ads/tracking. Practical requirements are reliable connectivity, no system crashes and no attack surface from proprietary provider remote administration. Open source remains preferred; request one final search, not an extended audit or server refactor.
- Findings: OneXray publishes GPL app source and an Apple Packet Tunnel implementation. Reviewed store-tag notification code generates local alerts; no provider push channel was identified in the bounded review. Apple adoption is much smaller (55 ratings versus Streisand’s ~2.1k). v2rayN has broad overall adoption but uses elevated desktop TUN processes, making it a less direct Apple-networking comparison.
- Recommendation by Codex: short OneXray Apple App Store trial first, Streisand immediately next if unsuitable. This is not owner selection or a stability claim. Distinguish store 26.9.1 from GitHub 26.9.2; confirm installed engine, local profile behavior and full-tunnel DNS/routing, then awake and coordinated sleep/wake tests. Source/links are in docs/mac-client-stability.md. No app installed, source script run, credentials imported or deployment changed.

## 2026-09-13 — Complete requested v2rayN due diligence before client selection

- Requester: Anthony asks for focused research before deciding. Reviewed stable 7.24.9 source/releases and Mihomo 1.19.30. No client installation or broader AWG migration was inferred.
- Findings: Xray can retain the REALITY handshake while Mihomo supplies AWG 3.1; Mihomo alone sends marker 1.8.2, incompatible with our preserved 26.3.27 floor by source analysis. Mac TUN uses privileged engine processes; its GUI holds the sudo password in memory and configures the local Mihomo controller without authentication. No Happ-like provider push dependency was identified in the scoped review. Current release addresses an older downloader MITM vulnerability; native sleep behavior remains untested.
- Recommendation by Codex: retain OneXray first for the selected REALITY-only stopgap; consider v2rayN when consolidating both protocols justifies its control/packaging tradeoffs. Apple NetworkExtension alone is not evidence of immunity to network-lock failures. Sources, scope and trial requirements are in docs/v2rayn-assessment.md. Owner selection remains open; no credentials, network settings or cloud resources changed.

## 2026-09-13 — Close out the three-client comparison in the notebook

- Requester: Anthony asks to capture final thoughts on OneXray, Streisand and v2rayN. This records the research conclusions, not an app selection or installation.
- Synthesis by Codex: OneXray first for the current REALITY-only/open-source preference; Streisand is an immediate alternative and a reasonable first choice if Apple adoption takes priority. Its accepted tracking tradeoff is resolved. v2rayN is strongest when consolidating both protocols justifies separate Xray/Mihomo engines and its local privilege/control model. No candidate is proven more stable on this Mac.
- Handoff: the final comparison in docs/mac-client-stability.md owns decision triggers and the next trial checks; compact status/task notes link to it rather than restating the research. Choose and test a distributed client using existing credentials/server settings. No further broad research is needed absent a concrete failure or changed requirement; no staging or commit performed.

## 2026-09-13 — Triage patching Amnezia without starting implementation

- Requester: Anthony asks whether the OSS client is worth patching, a GitHub issue to review personally and a difficulty score out of five; explicitly excludes a code deep dive.
- Findings: GPL-3.0 client; #2933 remains open/unassigned with community analysis but no maintainer response or matching fix identified. Newer comments reproduce without sleep and propose bounded firewall cleanup, tunnel shutdown ordering/lifecycle changes and dependency isolation. Treat those as candidate approaches, not established prevention of the kernel deadlock.
- Assessment by Codex: 4/5 for a reliable fix; diagnosis, Mac build/helper packaging and repeated reproduction dominate a potentially modest code change. Recommend a replacement-client trial first, or a one-engineering-day feasibility cap if keeping Amnezia becomes the priority. No owner commitment to a fork, implementation, forced sleep or upstream message; detailed rationale is in docs/mac-client-stability.md.

## 2026-09-13 — Defer Amnezia repair to upstream and advance to replacement installation

- Decider: Anthony rejects local patching and requests a check between major work units, including To Do reviews, for #2933 resolution and inclusion in a released Mac client. Keep dated status in the recurring task; closure/merge alone is insufficient, and any macOS OS prerequisite must be distinguished from the client release. Added one AGENTS reminder so this survives completion of the immediate crash task. No background monitor requested.
- Scope: pause routine REALITY use in the affected Mac Amnezia build because upstream also reports awake triggers. Continue AWG under the existing decision. Reconsider the official client after an applicable released fix and local validation; potential wider benefits are unproven.
- Installation recommendation by Codex: free OneXray Mac App Store edition, preserving the existing Stockholm identity/server; confirm packaged core and routing/DNS before awake and coordinated sleep tests. Anthony requests which app/how to install; exact app acceptance, installation and native results are not yet recorded. Official listing/install route rechecked; no app, credential, network or cloud changes made in this guidance turn.

## 2026-09-13 — Install OneXraySE and preserve both regional Mac identities

- Decider: Anthony rejects an expensive/disruptive Mac restart, proceeds with Homebrew and authorizes configuring Stockholm and Cape Town. Use OneXraySE despite its different extension/file-logging packaging; App Store authentication repair is no longer a prerequisite. Keep AWG in Amnezia and server/iPhone configuration unchanged.
- Observed: app 26.9.2/444, Xray-core 26.9.9, network extension enabled. Imported both local REALITY nodes as standard VLESS links. Compared current stored UUID/key/short ID/SNI/fingerprint/flow/endpoint to preserved exports without printing credentials. Cape Town's Mac identity is established by historical last_config plus server/iPhone cross-check, not arbitrary client array order.
- Pending: automatic approval review rejected saving full-device capture/encrypted DNS as beyond profile-only authorization. Requested explicit approval for settings and native connect/disconnect tests; no saved routing change, native connection or reboot is claimed. The approved device credential import is complete; validation remains open.

## 2026-09-13 — Validate both regional REALITY nodes in OneXraySE

- Decider: Anthony explicitly approves full-device routing, encrypted DNS and connection/disconnection tests, retaining automatic connection off. Saved All via VPN, fixed Stockholm selection, full capture with documented system exceptions and DoT to `8.8.8.8` / `dns.google`. An accidental macOS Don't Allow caused registration failure; retry/Allow resolved it without restarting or resetting preferences.
- Evidence: Stockholm, Cape Town and Stockholm reconnect pass native HTTPS/exact-exit checks; both regions pass fresh OS DNS resolution, tunnel routes and certificate-verified TLS 1.3 resolver connectivity. Supported `scutil --nc stop` reliably restores direct internet/en0. Final UI: Stockholm selected/disconnected. No new relevant crash reports during the awake trial; repeated sleep/wake remains pending. IPv6 lacks a working disconnected baseline; do not claim prevention or an exhaustive DNS leak audit.
- Audit scope: automatic review rejected an optional final reread of recovery credentials and navigation for a redundant settings check. Completed a narrower network/status/crash-filename audit and confirmed the final UI instead; rely on the earlier import comparison, not a claimed second credential comparison. No unresolved approval is needed for the completed configuration/connectivity work.
- Follow-up: owner-coordinated practical use and repeated battery/AC sleep/wake checks, then review new reports. Preserve server/iPhone settings and AWG in Amnezia. Evidence and bounded native-probe details are in docs/mac-client-stability.md; no deployment or Mac reboot occurred.
