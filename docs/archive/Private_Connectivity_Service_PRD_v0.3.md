# Private Connectivity Service

**Product requirements & implementation plan · Draft v0.3 · 6 September 2026**

Personal PoC | AWS CDK / TypeScript | Existing clients | Privacy first

## Decision in brief

Build a small, manually operated proof of concept that gives Anthony a **successful, stable connection from Dubai on his laptop and phone**. The immediate objective is access beyond local internet filtering, especially private browser use and video. This is not a production-grade connectivity platform, despite being hosted in the owner's production AWS account.

Start with **Xray / VLESS / REALITY over TCP 443 in a container on EC2**. Provision cloud resources with AWS CDK in TypeScript and use Amnezia's existing installer and clients where practical. Separate EC2 instances are the initial simplicity choice for separately addressed endpoints, not a high-availability requirement. A second endpoint or protocol can follow the first useful connection; it is not a prerequisite to demonstrating the PoC.

**Longer-term direction:** share compute across protocol containers while retaining distinct public endpoint identities. Prefer a single EC2 host, optionally managed by ECS, before adopting Fargate. Fargate remains an option, not a commitment; its task addressing and runtime restrictions require a different deployment design. [2–11]

| Decision | Current position |
| --- | --- |
| Owner and users | Anthony is the only administrator. Initially one user and two concurrent devices. |
| Account and region | Existing production AWS account; dedicated project resources. Frankfurt, `eu-central-1`, is the planning default. |
| Success standard | Usable, stable browsing on the actual laptop and phone across hotel Wi-Fi and mobile connections. |
| Performance | Support comfortable video use, with 4K as a desired workload; no resolution-specific acceptance gate or SLA. |
| Protection | Prefer full-device routing. Disclosed best-effort mobile behavior is acceptable; kill switch is desirable. |
| Privacy | No routine traffic, destination, DNS-query, or application access logging. No required monitoring/alerting subsystem. |
| Recovery | Manual setup, profile changes, and rebuilding are acceptable. Loss of both endpoints and AWS access is an accepted PoC limitation. |

### Scope changes from v0.2

Remove mandatory router validation, streaming-catalog tests, fixed trial counts, timed recovery targets, multi-AZ/region requirements, and independent disaster-recovery infrastructure. Keep macOS, Windows, iOS, Android, and OpenWrt/GL.iNet as the broader compatibility direction, but only the actual laptop and phone block the PoC.

All **16 current product questions are answered sufficiently to start**. Three future questions remain deferred in section 08. Detailed engineering choices remain an implementation backlog rather than another approval questionnaire.

**Evidence boundary:** no infrastructure has been deployed and no UAE reachability or performance measurements have been made. Frankfurt is a practical European default, not a measured fastest region or a claim that any jurisdiction has literally no filtering.

<!-- page -->

## 01 / Product requirements

**Now** = needed for the PoC. **Preferred** = desired behavior with disclosed limitations. **Next** = useful after the first working connection. **Later** = optional expansion. Original requirement IDs are retained; priorities supersede v0.2.

| ID / priority | Requirement | Practical completion evidence |
| --- | --- | --- |
| FR01 / Now | One laptop and one phone can connect concurrently using separate device credentials. | Both devices work; record their actual OS/client versions. Other platforms need not be certified first. |
| FR02 / Now | Establish usable access from hotel Wi-Fi and mobile networks. | Browser requests complete through the intended endpoint; ordinary use remains stable. |
| FR03 / Preferred | Route the full device, including appropriate DNS and IPv6 handling. | Check the actual client configuration. Describe partial coverage accurately; do not claim full protection from an app indicator alone. |
| FR04 / Now; Preferred | Explain dropped-tunnel behavior; enable a kill switch where practical. | Observe a disconnect and reconnect. Best-effort mobile behavior is acceptable and disclosed. |
| FR05 / Now | Keep client and administrator credentials separate; allow independent device revocation. | VPN-only profiles do not grant AWS/SSH access. A revoked device cannot establish a new connection. |
| FR06 / Next | Save a second, manually selectable endpoint profile. | The owner can switch without downloading a profile through the failed endpoint. No timed failover guarantee. |
| FR07 / Next | Keep enough installation and state information to rebuild manually. | A short installation/restore procedure identifies required secrets and operator steps. No unattended-rebuild gate. |
| FR08 / Now | Diagnose failures without routine activity collection. | Use transient, targeted checks to distinguish base internet, endpoint, authentication, routing, or unknown failures. |
| FR09 / Now | Minimize logs and retained operational data. | Inspect application/container settings and verify that normal use creates no intended traffic-history store. |
| FR10 / Now | Document the accepted recovery boundary. | The owner knows that loss of AWS management access can leave the PoC unavailable until access returns. |
| FR11 / Later | Provide OpenWrt-based router backhaul; prefer GL.iNet UI on/off control. | Third-party packages are allowed. Stock-UI integration is a soft goal, not a laptop/phone dependency. |
| FR12 / Later | Revisit streaming geo-masquerading only when desired. | No Netflix catalog, country-selector, or service-specific geographic-access tests now. |
| FR13 / Now | Use CDK / TypeScript for AWS infrastructure and reuse community software. | Versioned infrastructure plus a documented manual runtime-installation step is sufficient. |
| FR14 / Next | Give separate endpoint containers distinct EIPs. | Verify ingress to each endpoint and, in the direct EC2 design, its corresponding outbound public identity. |
| FR15 / Later | Give trusted friends independent, revocable VPN access. | Never share the owner's client identities or administrative credentials. No registration portal now. |
| FR16 / Later | Optionally add custom management or on-demand infrastructure. | A future management interface need not support every native client platform. |

### What is deliberately absent

No public service, billing, customer support operation, analytics dashboard, 24/7 availability commitment, custom protocol, or automatic IP/protocol rotation. A working proof of concept is the milestone; a hardened operational release is not an implied follow-on obligation.

<!-- page -->

## 02 / Initial AWS architecture

### Region: Frankfurt as a practical default

Use **Europe (Frankfurt), `eu-central-1`**, for the initial endpoint(s). The owner asked for a reasonably performant non-local exit without a region-selection testing exercise. This selects a European region rather than a distant Australia/US deployment or a local UAE exit. AWS lists Frankfurt as an established region that does not require regional opt-in. [1]

This is a pragmatic planning choice, not proof of the lowest latency. Interpret the access objective as avoiding the broad local filtering currently preventing use, not a guarantee against every jurisdictional or destination-side restriction. Keep the region parameterized, but do not make a multi-region benchmark a prerequisite.

### Direct endpoint topology

**Client → Elastic IP A / TCP 443 → EC2 host A → Xray container → internet destination.**

**Optional second path → Elastic IP B → EC2 host B → separately configured protocol container → internet destination.**

The endpoints are alternatives, not chained hops. Both may be in the same region and Availability Zone. Separate hosts simplify initial setup and IP mapping; availability isolation is incidental, not a product requirement.

| Component | PoC direction |
| --- | --- |
| Infrastructure | A dedicated CDK stack/project in the existing production account; a dedicated VPC and public subnet with internet-gateway access. No production peering. |
| Hosts | Small, supported x86-64 Linux EC2 hosts for the Amnezia installer. Select the exact AMI and size during implementation. [16] |
| Addressing | One retained EIP per endpoint. AWS maps EIPs to private addresses on instance network interfaces, not directly to ordinary Docker containers. [2,3] |
| Exposure | The intended tunnel listener and narrowly scoped operator management only. No public administration panel, load balancer, NAT Gateway, or CDN required. |
| Runtime | First path: Xray / VLESS / REALITY, TCP 443. Select compatible flow, target, fingerprint, image and versions in technical design. |
| Identity | Separate endpoint state and per-device VPN-only credentials. Retain an encrypted recovery copy outside the host. |

### Endpoint and protocol strategy

First establish whether one private REALITY endpoint solves the current problem. Add the second host when useful for a saved alternative or protocol comparison. A second REALITY endpoint tests address/path differences; a different transport tests protocol differences. Neither has to be deployed before the first demonstration.

No secondary protocol is selected by this PRD. NaïveProxy, AmneziaWG, and Hysteria 2 remain previously discussed candidates, not mandatory integrations. The chosen second transport must fit the observed failure and available clients rather than architectural symmetry.

### Production-account boundary

Use the existing account as requested, but do not place the PoC on an existing production application host. Avoid private connectivity into production services. Give the tunnel runtime no unnecessary AWS privileges and deny tunnel-originated access to metadata, private infrastructure, and management interfaces. Simplicity does not require sharing production credentials or networks.

<!-- page -->

## 03 / Fargate assessment and compute consolidation

### Recommendation

**Separate EC2 hosts now; shared EC2 compute later. ECS can manage that shared host if its orchestration is useful. Fargate is not the default next step.** The objective is reduced management effort and unused compute, not infrastructure-failure isolation.

| Deployment option | Fit for this project |
| --- | --- |
| Containers on separate EC2 hosts | Simplest initial Amnezia installation and direct EIP mapping. Duplicate host cost is accepted temporarily. |
| Multiple containers on one EC2 host | Natural consolidation option. Retain separate EIPs through deliberate private-address, listener and source-routing configuration. |
| ECS on EC2 | Adds service lifecycle management while retaining host/network control. Networking mode still needs explicit design. |
| ECS on Fargate | Potentially viable for a suitably packaged userspace proxy, but introduces static-address, capability, and Amnezia-management changes. |

### Why Fargate is not a direct substitution

**Static entry addresses.** Fargate supplies a task ENI and can assign a public IP, but does not provide a directly assigned, retained EIP per task; its ENIs are service-managed. A normal stable-ingress design places an internet-facing Network Load Balancer with EIPs ahead of the tasks. Use a TCP pass-through listener for REALITY, not TLS termination or an HTTP Application Load Balancer. [6–8]

**Exit addresses are separate.** The NLB's entry address does not become the source of new internet connections opened by the proxy. A public task can use its assigned public IP; a private task can use a NAT Gateway with an EIP. NAT is therefore conditional on the egress design, not mandatory for every Fargate deployment. Stable ingress plus stable egress normally adds distinct resources and addresses. [5,9]

**Runtime compatibility.** Fargate does not support privileged tasks or adding NET_ADMIN. An ordinary userspace Xray listener is a feasibility candidate; host-level VPN/TUN setup and Amnezia installation scripts cannot be assumed portable. Validate the specific image and entrypoint before claiming Fargate support. [10,14]

**Shared-resource economics.** Separate running Fargate tasks are billed for their requested resources even when one protocol is idle. Multiple containers inside one task can share its capacity, but also share its task networking and deployment lifecycle; they do not acquire independent EIPs. [6,10,11]

### Shared EC2 design to investigate later

Assign two private IPv4 addresses to a suitable instance interface and associate a different EIP with each. Bind each container's public listener to its intended private address. Configure explicit source selection/SNAT so new outbound connections use the matching address. **Publishing a port on a particular IP alone does not guarantee matching outbound identity.** [3,4]

For ECS on EC2, evaluate host/bridge networking rather than assuming task-level `awsvpc` provides the same public-address mapping. Ordinary EC2 `awsvpc` task interfaces do not receive public IPs automatically. [5] Validate the chosen instance's address limits and the installer's ability to preserve these bindings.

Consolidation can reduce duplicated compute cost, but EIP and internet-transfer charges remain. Fargate designs may additionally incur load-balancer and NAT processing charges. No percentage saving or monthly total is claimed. [11–13]

<!-- page -->

## 04 / Amnezia, CDK, and client responsibilities

### Reuse community work without creating two configuration owners

Amnezia is both a connection client and a server installer/manager. Its self-hosted workflow uses SSH to install Docker-based protocol containers on an existing server. It is not an AWS provisioning service or an ECS/Fargate control plane. [14]

| Layer | PoC responsibility |
| --- | --- |
| AWS infrastructure | CDK / TypeScript owns VPC, subnet, host(s), EIPs, security groups, narrowly scoped IAM, and resource identifiers. [23] |
| Runtime installation | Amnezia is the preferred initial installer/manager. Select Xray explicitly; automatic setup selects AmneziaWG. [15] |
| Privacy configuration | Inspect generated settings and disable unwanted logs before normal use. Record any supported manual adjustment so reinstalling does not silently re-enable logging. |
| Secrets and client profiles | Amnezia or the selected runtime tooling creates independent VPN-only profiles; the operator stores recovery material securely. [17] |
| Device experience | Existing clients, starting with Amnezia VPN where suitable. Use compatible alternatives only when needed; no uniform custom UI requirement. |

**CDK infrastructure recreation is not runtime-state restoration.** A manual reinstall and encrypted-state restore, or deliberate profile reissue, is acceptable. Record the distinction instead of describing the PoC as an unattended one-command deployment.

Amnezia may need privileged SSH for installation and maintenance. Open only the approved management path, restrict it to the operator where practical, and close unnecessary exposure afterward. Do not treat AWS host administration and ordinary VPN-client access as the same credential.

If an installer limitation makes the required logging or container networking impossible to maintain cleanly, hand runtime ownership to a small script-managed deployment using upstream Xray software. Keep compatible community clients. Do not let Amnezia and an ECS service independently manage the same container or overwrite each other's configuration.

### Platform scope and sequencing

**PoC:** the owner's actual laptop and phone. Confirm their precise OS/client versions while installing; no additional product decision is required to start.

**Broader compatibility direction:** macOS, Windows, iOS and Android. Availability of a client does not establish full-device coverage or fail-closed behavior. Amnezia documents IPv4-only support, desktop kill-switch functionality, Android system controls, and no built-in iOS kill switch; actual behavior needs checking on the chosen devices. [18,19]

**Router follow-on:** OpenWrt-based GL.iNet with third-party packages permitted. Prefer control of an already configured connection's on/off state through the GL.iNet UI. This is a soft integration goal. Native support for the chosen REALITY client, firmware compatibility, and persistence across upgrades are not assumed. Router hardware and packaging decisions wait until that work begins.

**Optional future management:** a TypeScript CLI or web interface may start/stop or provision infrastructure. It need not replace the native tunnel clients or meet their complete platform matrix.

<!-- page -->

## 05 / Privacy and practical acceptance

### Logging policy: off by default, not an analytics project

Do not collect routine connection histories, destination IP/domain histories, browsing URLs, DNS queries, payloads, or traffic captures. Do not add dashboards, alert destinations, bandwidth-anomaly detection, or a retained incident database as PoC requirements.

| Layer | Required direction |
| --- | --- |
| Xray / proxy | Explicitly disable access and routine error output and DNS-query logs during normal use. Xray supports `none` for access/error logging; omitting a path can send output to stdout rather than disable it. [20] |
| Container | Avoid persistent capture of proxy stdout/stderr. Docker's `none` logging driver is available; file output inside the container must also be disabled. [21] |
| Network telemetry | Do not enable project VPC Flow Logs, DNS-query logging, or equivalent destination telemetry. Check whether existing account policy already imposes collection; report it, do not claim it is absent. |
| Troubleshooting | Owner-initiated, temporary diagnostics only when necessary. Prefer live inspection; redact secrets and destinations, stop collection afterward, and delete temporary captures. |
| Existing account controls | Preserve production-account security/audit settings. AWS control-plane records are distinct from browsing logs; CloudTrail records AWS API and administrative activity. [22] |

The earlier suggested alerts meant endpoint-down or aggregate-transfer notifications, not browsing analysis. They are removed from mandatory scope. Existing billing information may be consulted manually without building a project-specific telemetry system.

This is a **no-routine-traffic-logging design**, not a claim that AWS, operating systems, client software, ISPs or destination services retain no metadata. Inspect the actual deployment before making a stronger statement.

### PoC success: a stable, useful connection

The owner can connect the laptop and phone through saved profiles, browse the intended sites and use video normally on hotel Wi-Fi and mobile internet without recurring unexplained drops or repeated country hunting. Test both devices concurrently and reconnect after ordinary sleep/wake or network changes.

Check the expected public exit and DNS/IPv6 behavior while connected. Observe what happens when the tunnel stops. Prefer full-device routing; disclose best-effort mobile behavior and any coverage limitation instead of blocking the PoC on a universal kill switch.

**4K is a workload goal, not a formal test standard.** Use normal video playback to reveal obvious throughput or stability problems. No required bitrate, fixed video duration, trial count, success percentage, or recovery deadline is introduced. Keep only a brief redacted setup/result note; no sensitive URLs or screenshots are required.

### Minimum safeguards despite prototype scope

Use encrypted secret storage, independent device credentials, restricted administration, and an authenticated, private-use proxy. Check that a revoked credential cannot reconnect and that another still works. Review access to metadata/private networks and REALITY's unauthenticated forwarding behavior during setup. A privacy-oriented PoC must not become a public relay or a route into production resources.

<!-- page -->

## 06 / Implementation plan

The first useful connection is the immediate milestone. Stages below are implementation steps, not calendar commitments, formal release gates, or authorization to change the AWS account.

| Stage | Work | Completion / decision |
| --- | --- | --- |
| 1 — CDK foundation | Create the TypeScript project and a dedicated stack/VPC in the production account. Default to Frankfurt. Provision endpoint A's EC2 host, EIP, restricted management path and tunnel security group. | Infrastructure is isolated from existing applications and reachable through the intended paths. The actual account ID is an execution input, not an unresolved product question. |
| 2 — Working tunnel | Use Amnezia manual Xray installation. Select compatible server/client versions; inspect logging and access controls. Create separate laptop and phone profiles and securely save runtime identity/configuration. | Functional traffic traverses the endpoint from the owner's devices. Any manual steps and privacy changes are recorded. |
| 3 — Practical use | Try hotel and mobile connections, ordinary reconnects and concurrent use. Check exit/DNS/IPv6 behavior, browser/video stability, and disconnect behavior. | Owner decides whether the PoC fixes the observed problem. Diagnose failures before expanding the architecture. |
| 4 — Second endpoint, when useful | Provision endpoint B on a separate EC2 host with its own container and EIP. Use the same transport for address comparison or a selected alternative for protocol comparison. Save its profile locally. | Demonstrate manual switching and independent public identity. Do not add multi-AZ, cross-region or provider-diversity requirements. |
| 5 — Consolidation, optional | Assess one EC2 host with multiple containers/private addresses/EIPs. Add ECS on EC2 only if service lifecycle management is useful. Select one runtime configuration owner. | Preserve working client behavior and distinct endpoint addressing; compare actual total cost. Fargate requires a separate addressing/runtime decision. |
| 6 — Follow-ons, optional | Add untested desktop/mobile platforms, router integration, friends, or an on-demand controller in the order the owner needs them. | None of these blocks the laptop/phone PoC. |

### Minimal implementation artifacts

A CDK repository; a nonsecret endpoint/version inventory; concise install/start/stop/rebuild notes; encrypted recovery material; and a short statement of tested devices, connection results, and known limitations. Suggested folders are `infra/`, `ops/`, and `docs/`; no framework, pipeline or portal is required for its own sake.

### Recovery and accepted limitations

Restart the client or container, select a saved alternative, or manually repair/recreate resources when needed. Retain EIPs and runtime state when useful for continuity; a new address may require updated profiles. **If both endpoints fail and AWS administration is unreachable, the PoC can remain unavailable until access returns.** No alternate-provider or out-of-band recovery system is required.

AWS concentration, a future shared-host failure, temporary maintenance outages, client limitations and evolving filtering are accepted risks. This does not mean account credential exposure or false protection claims are accepted. Ordinary travel usage and video transfer inform later sizing; there is no formal budget or cost-approval gate.

<!-- page -->

## 07 / Decision register — current scope resolved

**16 answered current decisions. No blocking product questions.** Original IDs are retained; later answers supersede earlier assumptions. Implementation values such as an AMI, account ID, exact phone OS or runtime version are filled in during setup.

| ID | Captured decision |
| --- | --- |
| Q01 | One owner and two devices first. Independent friend access is optional later; never share owner credentials. |
| Q02 | macOS, Windows, iOS, Android and Linux/OpenWrt router backhaul remain platform targets. Actual laptop/phone first. |
| Q03 | Disclosed best-effort mobile protection accepted; kill switch is nice to have. |
| Q04 | Private blocked-site browsing and video are primary. Geographic streaming access is deferred by Q16. |
| Q05 | Full-device protection preferred; no elaborate split-routing feature is required. |
| Q06 | Choose a reasonably performant non-local region for Dubai without a region-benchmark gate. Frankfurt is the document's engineering default, not a measured fastest-region claim. |
| Q07 | Ordinary travel usage; no formal budget needed for design. |
| Q08 | Both paths on AWS, with separate containers and EIPs. Separate EC2 hosts first for simplicity; sharing compute later is acceptable. No HA placement mandate. |
| Q09 | Existing clients first; custom clients or an on-demand management surface may follow. |
| Q10 | AWS CDK / TypeScript; maximize community reuse. Amnezia is the initial runtime/client candidate, not an irrevocable dependency. |
| Q11 | Existing production AWS account; Anthony is the only administrator. Isolate project resources within that account. |
| Q12 | Privacy-oriented, minimal logging if any. Disable routine traffic logging; no required alerting or observability service. |
| Q13 | 4K desired; acceptance is a successful, stable connection, not a resolution or numeric reliability standard. |
| Q14 | Manual setup and repair accepted. No recovery solution required when AWS access is unavailable. |
| Q15 | OpenWrt and third-party packages accepted. GL.iNet UI on/off control is a soft later goal; router work does not block the PoC. |
| Q16 | Defer geo-masquerading and Netflix/other streaming-catalog acceptance. Focus on bypassing current local filtering. |

## 08 / Deferred questions and engineering backlog

**Q17 — On-demand lifecycle.** Later decide whether to start/stop retained hosts or create/destroy endpoints, and which management interface is useful. No controller now.

**Q18 — Trusted-friend sharing.** Later decide friend/device count and onboarding. Independent credentials remain the baseline; no multi-user product now.

**Q19 — Future Fargate addressing.** Only if Fargate is pursued: must each protocol retain both a dedicated ingress EIP and a matching stable egress identity, or is stable ingress with different/shared egress acceptable? The direct EC2 design preserves both without reopening this now.

Engineering backlog: precise instance/AMI and versions; REALITY parameters; secret restore procedure; client coverage; secondary protocol selection; consolidated container source-IP routing; future router model/firmware/package/UI integration. These are not additional PoC approval gates.

<!-- page -->

## 09 / Sources and research boundaries

Official provider/project documentation reviewed on **6 September 2026**. Numbered references support technical facts, not reachability guarantees. Product decisions come from the owner's answers. The runtime, consolidated networking and Fargate alternatives remain unimplemented.

[1] [AWS — Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html). Region identifiers, location and opt-in status; not a Dubai performance ranking.

[2] [AWS — Elastic IP addresses](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html). Address association, retention and regional scope.

[3] [AWS — Elastic network interfaces](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-eni.html). Multiple private addresses and EIP association.

[4] [Docker — Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/). Listener binding, masquerading and explicit outbound source selection.

[5] [AWS — ECS internet connectivity](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html). EC2 network modes, public Fargate tasks and NAT egress.

[6] [AWS — Fargate task networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html). Task ENIs, public-IP assignment and managed-interface constraints.

[7] [AWS — Create a Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/create-network-load-balancer.html). Static ingress addresses through EIP mappings.

[8] [AWS — NLB listeners](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html). TCP pass-through versus TLS termination.

[9] [AWS — NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html). Outbound translation and public NAT EIPs; not unsolicited inbound access.

[10] [AWS — Fargate task-definition differences](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html). Privilege/capability restrictions, task resources and network mode.

[11] [AWS — Fargate pricing](https://aws.amazon.com/fargate/pricing/). Requested resources and task duration, rather than observed CPU activity.

[12] [AWS — VPC pricing](https://aws.amazon.com/vpc/pricing/). IPv4 and NAT-related charges; recheck applicable rates at deployment.

[13] [AWS — Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/). Load-balancer time and capacity/data-related charges.

[14] [Amnezia — How it works](https://docs.amnezia.org/documentation/how-amnezia-works/). SSH-based deployment and separate protocol containers.

[15] [Amnezia — Self-hosted setup](https://docs.amnezia.org/documentation/instructions/install-vpn-on-server/). Manual Xray selection and installation flow.

[16] [Amnezia — VPS requirements](https://docs.amnezia.org/documentation/supported-linux-os-for-vps/). Supported host OS, architecture and minimum resources.

[17] [Amnezia — Share VPN access](https://docs.amnezia.org/documentation/instructions/share-connection/). Guest versus full-access profiles and revocation.

[18] [Amnezia — KillSwitch](https://docs.amnezia.org/documentation/instructions/killswitch/). Platform-specific failure-protection controls.

[19] [Amnezia — Split tunneling](https://docs.amnezia.org/documentation/instructions/vpn-split-tunneling/). Routing differences and documented IPv4 limitation.

[20] [Project X — Log configuration](https://xtls.github.io/en/config/log.html). Access/error disabling, stdout defaults and DNS logging.

[21] [Docker — Logging drivers](https://docs.docker.com/engine/logging/configure/). Container-output retention and the `none` driver.

[22] [AWS — CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html). AWS administrative/API event history, distinct from proxy traffic logs.

[23] [AWS — CDK in TypeScript](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html). Infrastructure tooling, not an assumed Amnezia integration.

**Revision history:** v0.1 established the concept. v0.2 captured initial scope and platform decisions. v0.3 resolves current questions, narrows delivery to the personal PoC, removes formal operational gates, and evaluates Fargate versus shared EC2 compute. Earlier versions are retained separately.
