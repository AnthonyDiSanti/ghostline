# Bottlerocket ECS bridge IPv6 — upstream review

Checked September 28, 2026 using authenticated read-only GitHub REST/GraphQL, including comments. Consult before proposing upstream IPv6 work or resuming Ghostline IPv6 implementation.

## Published proposal — September 28

Anthony authorized submission of the reviewed draft. Created [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954) under `AnthonyDiSanti`; readback confirms OPEN and the body matches the approved local draft. No related-issue comments or duplicate issues were posted. Await maintainer feedback on the API shape and repository split before implementation; check this issue at major milestones.

## Decision and scope

Anthony defers Ghostline IPv6 implementation until an official Bottlerocket release supports configuring Docker bridge IPv6. Keep the shared bridge task, initializer networking disabled, per-engine isolation, shared memory budget and existing park behavior. No custom OS or protected configuration override is selected. Production stays unchanged. This hold concerns IPv6; classic WireGuard does not depend on it.

## Search result

Before filing #4954, no exact matching open issue/PR was found. Reviewed all open PR listings in `bottlerocket`, `bottlerocket-core-kit` and `bottlerocket-settings-sdk` (11/25/15 at this check), IPv6 issues in those repositories, organization-wide searches for `fixed-cidr-v6`, `fixed-cidr`, `ip6tables`, `daemon.json`, Docker/IPv6 and `ECS_INSTANCE_IP_COMPATIBILITY`, plus the six organization discussion search hits for IPv6. Search absence is not proof that no unpublished work exists.

| Related work | Current state and relevance |
| --- | --- |
| [Bottlerocket #4743](https://github.com/bottlerocket-os/bottlerocket/issues/4743) | Open, but requested agent update has landed: core-kit 17.0.0 packages 1.106.1. Remaining comment asks for an IP compatibility override. Host/control-plane IPv6, not Docker bridge addressing. |
| [Discussion #4625](https://github.com/bottlerocket-os/bottlerocket/discussions/4625) | IPv6-only host difficulties with ECR and ECS endpoints. No comments at review. Related context, not our dual-stack host/IPv6-egress requirement. |
| [Core-kit #418](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/418) | Open, originally about wicked/per-interface RA control. Current netdog/networkd has RA support and explicitly enables it for the kernel-command-line interface path; a general configuration knob remains a TODO. Relevant to route/forwarding testing, not the missing Docker settings. |
| [Settings SDK PR #103](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/pull/103) | Open. Kubernetes kubelet node-IP dual stack; not ECS/Docker. |
| [Core-kit PR #802](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/802) | Open. Settings service restart behavior; consult when specifying configuration activation, not a prerequisite or IPv6 implementation. |
| [Merged Bottlerocket PR #1710](https://github.com/bottlerocket-os/bottlerocket/pull/1710) | Historical EKS/kubelet/pluto IPv6 work, not an implementation of configurable ECS default-bridge IPv6. |

The inspected core-kit Docker 29 template on `develop` still has no `ipv6`/`fixed-cidr-v6` setting. The prior source review found the same gap in core-kit 17.0.0, used by Bottlerocket 1.66.0. [Template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/docker-engine-29/daemon-json). Engine capability and AWS bridge instructions do not establish a supported Bottlerocket configuration path.

## Contribution starting point

Existing GitHub fork: [AnthonyDiSanti/bottlerocket-core-kit](https://github.com/AnthonyDiSanti/bottlerocket-core-kit), upstream `develop`. Keep this feature separate from `fix/host-ctr-unpack-lease` and open [PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063). No other Bottlerocket fork appeared in the inspected account fork list.

The submitted proposal below is the current contribution contract: one optional bridge IPv6 subnet, preserved defaults, and Docker IPv6 firewall handling retained. Expected code responsibilities span the settings SDK, core-kit and ECS variant integration; maintainers have not yet confirmed the API or split. All three repositories report `develop` as their default branch; the SDK contribution text's `main` instruction is stale. [Core contribution guidance](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/develop/CONTRIBUTING.md) asks for an issue before significant PR work.

The initial review made no upstream writes. The subsequently authorized proposal is now #4954, recorded above. Check it at major milestones; resume deployment work only after an official release includes the capability and passes isolated Ghostline lifecycle/isolation qualification.

## Deeper dependency review and PR housekeeping — September 28

Fetched upstream `develop` and the fork's `fix/host-ctr-unpack-lease` in the clean existing `/private/tmp/ghostline-core-kit-pr-1059` checkout. Develop is `209347ba321f023c242f48cb1afc590e5f9793bb`; PR head is `6a4c053219b4741a1dddc0738e7a91d099deff83`. Git ancestry comparison reports **0 behind / 2 ahead**, matching GitHub's compare API. No rebase, rewritten commit or push is needed. Source and Ghostline index were unchanged; prior runtime qualification was not rerun for this metadata-only check.

1. **#4743 — agent capability versus exposed settings.** Both linked updates #816/#932 are merged. [Core-kit 17.0.0](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/ecs-agent/Cargo.toml) packages agent 1.106.1, newer than the requested 1.101.2. [Agent documentation](https://github.com/aws/amazon-ecs-agent/blob/v1.106.1/README.md) says `ECS_INSTANCE_IP_COMPATIBILITY` controls route-based detection/IPv6-compatible AWS endpoints and explicitly recommends IPv4 mode for dual-stack hosts. The [Bottlerocket ECS template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/ecs-agent/ecs-base-conf) does not expose that override. Adding it could help an IPv6-only host but would neither allocate bridge IPv6 addresses nor configure Docker forwarding. Our IPv4 management path makes this unnecessary for selected egress scope. Also distinguish the agent's IPv6 port-binding reporting flag from outbound IPv6 connectivity; IPv6 ingress is not selected.

2. **Discussion #4625 — the full management path.** The report used Bottlerocket 1.45.0/agent 1.91.2 and a host with private IPv4 but no public IPv4 or NAT. It failed through ECR hostname selection, ECS registration and subsequent agent/telemetry endpoint connectivity. The agent-version obstacle has since changed; the whole reported scenario has not been requalified here. Fixing it would help run hosts without public IPv4, not give bridge containers IPv6. Keep our two EIPs and IPv4 control plane, so this is related context rather than a prerequisite. If scope ever expands to IPv6-only management, qualify all registry, bootstrap/control, ECS and other required AWS service paths, not registration alone. No use of its diagnostic proxy workaround is proposed.

3. **#418 — forwarding and the host's default route.** RA supplies routing information; DHCPv6 address acquisition alone does not establish the complete egress path. Its original wicked/sysctl timing report does not describe the current implementation. Core-kit 17.0.0's [netdog generator](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/sources/netdog/src/cli/generate_net_config.rs) explicitly calls `enable_ipv6` for kernel-command-line interface configuration; [the builder](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/sources/netdog/src/networkd/config/network.rs) sets `IPv6AcceptRA=true` and DHCPv6 solicitation, while noting that a configurable option remains TODO. [Sysctl generation](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/sources/netdog/src/cli/mod.rs) deliberately disables kernel RA processing because systemd-networkd owns it. Do not apply `accept_ra=2` generically. A supported per-interface setting could improve explicit configuration, especially custom interfaces, but is not established as necessary for our standard single ENI. Verify actual generated settings, default route, renewal, forwarding enablement and reboot in a future trial. No live IPv6 host test was performed.

Even if all three close, the independent blocker remains: supported opt-in Docker default-bridge IPv6 settings (`ipv6`, address pool and IPv6 firewall behavior) with safe activation. Once upstream supplies that, Ghostline still needs VPC/ENI IPv6, parallel quarantine/lease/isolation enforcement, validated IPv6 engine discovery, protocol egress and client qualification. Keep the upstream proposal focused on configuration; these application responsibilities do not belong in the OS feature request.

## Upstream coordination rationale — September 28

Use the single canonical feature/design issue in `bottlerocket-os/bottlerocket`, using its feature template. Omit #4743, discussion #4625 and core-kit #418 from the submission: the review above retains them as research, but no actual dependency or shared implementation has been established. Cite the Docker template and Docker/AWS bridge documentation instead. State willingness to implement; describe repository responsibilities rather than requesting staffing or creating a multi-issue project.

Contribution guidance asks for discussion before significant PR work, not one issue per repository. Empirical examples are mixed: hugepages used [SDK issue #113](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/issues/113)/[PR #139](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/pull/139) and [OS issue #4385](https://github.com/bottlerocket-os/bottlerocket/issues/4385)/[core-kit PR #952](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/952), while the merged container-runtime-endpoint changes in [SDK #141](https://github.com/bottlerocket-os/bottlerocket-settings-sdk/pull/141) and [core-kit #968](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/968) have no populated issue number. These samples show cross-repository implementation and variable tracking, not a mandatory umbrella/subissue convention. Recommend one discussion issue, with implementation PRs linked back; add another issue only if maintainers identify an independent need.

Optional typed settings are established: the ECS model exposes capabilities such as container metadata and image cleanup, and SDK #141 explicitly preserves the unset value/default behavior. Distinguish deployment configuration from an experimental feature gate. Proposed minimal API: one optional IPv6 subnet for the default Docker bridge; its presence enables IPv6 plus Docker IPv6 firewall handling, absence preserves existing behavior. No redundant enable boolean, firewall-disable switch or arbitrary daemon.json escape hatch. Exact namespace and compatibility behavior need implementation review. Anthony accepts optional enablement with unchanged defaults. Exact API naming remains a proposal, not an implementation. Automatic enablement based solely on host IPv6 would change existing containers' addressing/published-port behavior and is not assumed safe.

Drafting correction: runtime validation meant rejecting malformed/non-IPv6 subnet input, not testing the implementation; omit that adjective from the feature summary. Keep ordinary tests in the implementation plan. Draining/redeploying workloads belongs to consumers; Bottlerocket owns rendering/application of its settings, so do not prescribe consumer deployment orchestration in the issue. Do not assert datastore migration work for an additive optional setting without an identified schema/upgrade need. Keep the ECS workload-Docker boundary once, without a list of unrelated exclusions.

### Submitted feature request

Title: **Support IPv6 on the default Docker bridge for ECS variants**

**What I'd like:**

I would like to contribute IPv6 support for ECS bridge tasks through Bottlerocket's settings API.

We use Bottlerocket 1.66.0 (`aws-ecs-3`, ARM64) with multiple containers in one bridge task. We need IPv6 egress while retaining IPv4 connectivity, separate container network namespaces and a network-disabled initializer. [Docker supports bridge IPv6](https://docs.docker.com/engine/daemon/ipv6/#use-ipv6-for-the-default-bridge-network), but the [core-kit Docker template](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/docker-engine-29/daemon-json) exposes no equivalent configuration.

**Proposed behavior**

Add one optional IPv6 subnet setting for the default Docker bridge:

- When configured, enable Docker's `ipv6` setting and use the supplied subnet as `fixed-cidr-v6`.
- When unset, preserve existing behavior.
- Keep Docker's IPv6 firewall handling enabled, without a separate toggle.

**Scope and affected repositories**

The change targets the workload Docker engine in ECS variants.

| Repository | Expected responsibility |
| --- | --- |
| `bottlerocket-settings-sdk` | Define the IPv6 subnet setting |
| `bottlerocket-core-kit` | Render it into Docker configuration and integrate with settings application |
| `bottlerocket` | Incorporate the updated components into ECS variants |

I can implement the changes and document the setting. Does this API shape and repository split fit the project's preferred approach?

**Any alternatives you've considered:**

`awsvpc` shares a task network namespace and does not support our per-container networking disablement. Editing generated Docker configuration bypasses Bottlerocket's settings model. Supported bridge configuration would preserve our existing architecture.

The feature request above was submitted as [Bottlerocket #4954](https://github.com/bottlerocket-os/bottlerocket/issues/4954) and verified against GitHub readback. Anthony accepts optional enablement rather than default-on behavior. The repository split describes expected code responsibilities, not requests for maintainers to implement them or evidence that all three require independent PRs.
