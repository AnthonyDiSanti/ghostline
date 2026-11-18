# Credential delivery and GuardDuty privacy plan

November 17, 2026. **Selected implementation: direct-to-RAM retrieval by the existing initializer through a narrowly scoped shared task role.** This uses Anthony's explicitly accepted runtime-read fallback after A's supported native integration failed the checkpoint boundary. Preserve identities/device setup; no rotation. Native acceptance and deployment status are recorded in the handoff, separately from source/local qualification. Runtime Monitoring opt-out remains selected follow-up scope; this credential trial preserves current GuardDuty/EBS/shared controls.

## Outcome and boundaries

Remove plaintext server keys from Docker/ECS creation inputs while retaining Parameter Store as the intentional durable identity store and protocol-private read-only engine mounts. Existing Xray/AWG/DERP identities, endpoints and behavior remain. No off-host delivery coordinator, host parameter-read authority, OS fork or permanent alternate delivery mode is introduced. Historical disk/snapshot copies and AWS/ISP correlation remain separate boundaries.

## Where credentials currently reach disk

The earlier ECS-injection path decrypts three server bundles through the execution role, then puts them in the initializer's container creation environment before it executes. Docker stores that environment on XFS/EBS; ECS also serializes it in its checkpoint. The initializer subsequently renders RAM files, but unsetting variables does not alter either disk record. The November 18 01:12 UTC [Stockholm inventory](native-storage-inventory.json) confirms one matching file in each store for all three bundles, with complete/stable/readable bounded scans. The ECS log sample has no bundle matches. Actual Docker is 29.0.4/overlayfs.

## Can Docker omit the environment record?

There is no documented per-variable memory-only/redaction option for Docker/ECS environment metadata. The saved container definition supports restart/recovery. Application tmpfs, a read-only root, unsetting variables or disabling logs does not alter that separate definition. `data-root` relocation covers a much broader runtime boundary and must also cover containerd/ECS state. Do not rewrite live JSON or mount over individual private metadata files.

## IAM roles: controller, execution, task and host

The operator/controller deploys services and passes their roles. The execution role belongs to the ECS agent for infrastructure operations such as image pulls; it no longer reads application parameters in the new recipe. The task role grants exact `ssm:GetParameters` on the configured server ARNs and belongs to every container in the task. The initializer uses it; normal engine/DNS namespace access to the credential endpoint is blocked. The host profile stays parameter-free. Host/kernel/privileged-network compromise remains outside that confinement guarantee. [Execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html), [task roles and EC2 caveat](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html).

## A feasibility result

The [local prototype](local-ram-runtime.md) proves Docker-only RAM leaves a synthetic containerd copy; both RAM roots pass the tested persistence/restart/reconstruction cases. This did not qualify native Bottlerocket. Official 1.66.0 pins Core Kit 17.0.0. Its supported bootstrap launcher exposes shared Docker/containerd/kubelet mounts while binding the host root read-only/private. ECS's secret-bearing checkpoint is `/var/lib/ecs/data`, outside those shared mounts. The supported ephemeral-storage API accepts packaged paths (ECS contributes `/var/log/ecs`) plus `/mnt/`, not checkpoint data. No supported complete A integration was established, so do not force OS/mount/SELinux changes.

Sources: [pinned host-ctr mounts](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/sources/host-ctr/cmd/host-ctr/main.go), [ECS data directory](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/packages/ecs-agent/ecs-defaults.conf), [ephemeral-storage API](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v17.0.0/sources/api/apiserver/src/server/ephemeral_storage.rs). The pinned agent 1.106.1 merges secrets into serializable container environment, consistent with the live checkpoint finding.

### Current boot order and the early hook

Native essential bootstrap runs before Docker/ECS and mounts the 2 MiB private config tmpfs. ECS later schedules the daemon, DNS, initializer and engines. Under the new recipe, the initializer waits for healthy DNS and verified networking, retrieves current parameters directly into memory, renders private files and exits; engines then start. Bootstrap reads no application secrets. [Boot sequence](../../../docs/platform.md#boot-and-runtime-boundaries).

### Local proof versus isolated native qualification

Git Spice is `main` → `feature/tailscale` → `feature/zero-logs`, integrated at `712e610`. Anthony authorizes experiments on the chosen maintained Stockholm endpoint; a disposable region is optional. The [candidate workflow](../../../docs/candidate-releases.md) stages exact locally tested images without moving production aliases, captures installed baseline templates/mode and uses common native blue-green deployment/return. Other regions and shared controls stay outside this experiment. The experiment returned its captured injected-secret baseline, temporarily restoring that persistence. The subsequently authorized [fleet adoption](fleet-adoption.md) is complete and has its own verification receipts.

## Direct-to-RAM implementation

The initializer's pinned official Go SDK reads only the three exact public ARN references. It uses only the ECS credential endpoint, with no host/environment/shared-file credential fallback, no redirects or proxy and fixed suppressed errors. Before fetching it verifies private tmpfs/ownership/no swap, disables core dumps and clears prior known outputs. Two complete reads must agree on values and versions. Protocol renderers receive exact bytes through private pipes; partial/invalid/denied retrieval or rendering leaves no success signal and clears outputs. Engines retain private read-only mounts. No secret enters Docker environment, argv or ECS checkpoints.

The network daemon grants public TLS/private DNS and task-credential access only to the running initializer's exact ECS identity plus kernel binding, guarded by expiring leases. The non-listening identity port is denied externally. Engines/CoreDNS inherit shared task IAM authority and its opaque locator; they must not reach the credential service. Native probes require TCP timeout to that service, rather than treating a refused connection as isolation. This boundary is not independent IAM against a hostile kernel/host or sufficiently privileged container.

## Rejected option B

Anthony rejects an off-host secret-push controller because coordinating cold boot/restarts/recovery adds too much complexity. Do not revive it as the active implementation plan.

## Refresh and recovery contract to qualify

Cold boot/reboot/task replacement retrieves current parameters before engine success. Engine-only restart reuses its valid RAM config. No polling or implicit rotation is added. API denial/unavailability, mixed/partial versions, malformed config, missing RAM, swap or capacity failure must fail closed with fixed output and no environment/disk fallback. Preserve all existing device identities and endpoints.

## GuardDuty: exact proposed changes

The AWS agent is a separate **Bottlerocket host container**, `amazon-guardduty-agent`, installed/updated through SSM Distributor. It is not our ECS network daemon, the SSM control container or an immutable part of the OS. Its purpose here is Runtime Monitoring. Foundational service-stream analysis and EBS malware scanning do not require it. [Host-container model](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-assess-coverage-bottlerocket-ecs-ec2.html), [agentless EBS scanning](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-initiated-malware-scan.html).

| Item | Proposed action |
| --- | --- |
| Runtime Monitoring on Ghostline VPN hosts | Exclude all current/future maintained Ghostline hosts, including both replacement slots and Cape Town when resumed. Put `GuardDutyManaged=false` on the EC2 instance at creation; omission alone is insufficient in NVA's account-wide auto-management mode. |
| Installed runtime agent | Stop/disable the existing host container using supported Bottlerocket settings during migration and verify no running process/container. Clean replacement hosts must never install it. Retiring old hosts removes their local agent artifacts; do not promise secure erasure from an in-place settings toggle. |
| Project enrollment/health enforcement | Separate desired privacy policy from regional feature availability in host templates, CLI/enabler, native qualification and verification. Report explicit policy exclusion, verify agent absence, and do not re-enable Runtime Monitoring or require `HEALTHY` for an excluded host. Preserve checks on retained protections. |
| Project-only agent plumbing | Remove the dedicated `guardduty-data` endpoint/security group and the host role's Distributor `ssm:GetManifest` / GuardDuty document permissions after reference checks. Remove any other agent-only grants/artifacts discovered. Endpoint deletion alone is not the stop-collection mechanism. |
| Regional detector / regional Runtime Monitoring flag / account SSM association | Preserve them for other workloads. Do not delete shared associations, service-linked roles, detectors or organization policies. Do not change account-wide EC2/Fargate/EKS auto-management options to implement a host exclusion. |
| EBS malware protection, OS and data volumes | **Keep enabled and leave exclusions unchanged.** The temporary data-volume exclusion recommendation is withdrawn in favor of fixing the source. RAM is already outside EBS scans. Revisit only on concrete residual disk evidence. |
| SSM control/recovery, Ghostline network daemon, image vulnerability checks | Keep. They are separate from the runtime security collector; review their logs in the remaining audit. |

AWS documents that [changing management tags](https://docs.aws.amazon.com/guardduty/latest/ug/how-runtime-monitoring-works-ec2.html) or [stopping automated management](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring-agent-resource-clean-up.html) does not remove an installed agent and can leave runtime events flowing. We must verify actual absence across reboot/task replacement and an SSM reconciliation interval. Coverage metadata may lag; an old finding or stale coverage row is not proof of a currently running agent. Customer access cannot establish an empty AWS raw-event feed.

Lost protection: host/process/file/live-connection intrusion detection from the runtime agent, including fileless behavior. Disk-scanning eligibility remains, although fewer runtime findings may mean fewer automatic scan triggers. Foundational signals can still trigger eligible scans; retaining the feature is not identical detection coverage.

## Shared settings that still affect Ghostline

[Read-only configuration receipt](privacy-settings.json), November 17 at 22:29 UTC, covers Oregon, NVA, Stockholm, Zurich and parked Cape Town. All five detectors, foundational sources, Runtime Monitoring and EBS malware protection are enabled. All five also enable S3 data, EKS audit, RDS login and Lambda network analysis; AI Protection and legacy EKS Runtime Monitoring are disabled. NVA enables EC2/Fargate/EKS automated management; the other four use EC2 inclusion enrollment. Optional RDS data-risk analysis is enabled in Oregon only. AI Analyst is disabled where returned (Oregon/NVA/Stockholm), absent from Zurich/Cape responses. No setting was changed.

| Retained source/setting | Concrete Ghostline implication | Decision/scope |
| --- | --- | --- |
| Foundational EC2 flow analysis | AWS processes network metadata independently of the host agent and customer flow-log configuration. Tunnel-side source/endpoints and egress endpoints/timing can support correlation. This is a remaining direct conflict with a stronger no-provider-flow-processing goal; it does not establish HTTPS payload/URL recording. | Bundled per regional account with foundational CloudTrail/DNS. No supported Ghostline-only flow opt-out. Keep for this incremental unit with an explicit limitation; if unacceptable, evaluate a dedicated Ghostline account before changing its detectors. |
| Foundational AWS Resolver DNS | Sees queries actually made through AWS's resolver. Current private CoreDNS sends browsing DNS to external upstreams over TLS, so this source does not automatically receive all browsing questions. Host/control-plane DNS may still use AWS resolver. | Preserve shared setting; verify actual resolver paths. Excluding Runtime Monitoring removes a separate possible plaintext observer on the internal DNS hop. |
| GuardDuty profiles, findings and integrations | AWS says it extracts profiling fields then discards foundational input logs. That is not no retained metadata. Findings and downstream copies can retain endpoints; runtime-agent removal does not delete existing findings. | Inventory findings exports/integrations and retention separately. Suppressing or archiving findings does not disable source collection. |
| EBS scanning and snapshot preservation | All five use `NO_RETENTION`, with empty custom inclusion/exclusion lists. Scans still create snapshots and service-account replicas; NO_RETENTION is not a no-copy setting. AWS documents replicas up to 55 hours, up to seven days for failures, and locked-snapshot exceptions. Residual sensitive disk artifacts can therefore still be copied. | Retain scanning while removing disk secrets and checking journals/dumps. Do not claim old provider copies were purged. |
| Shared CloudTrail | Deliberately durable administration/API history, including actor/source addresses and times. The earlier bounded shared-bucket sample also found partial STS credential fields; it did not establish complete usable credentials or browsing logs. | Keep independent trail and its account controls. Sanitize Ghostline-generated event/error payloads; do not promise a universal client-IP prohibition covers administrative API records. Account isolation alone does not make CloudTrail memory-only. |
| Lambda network / S3 data / EKS audit / RDS login/data risk / AI plans | Optional per-service telemetry. Ghostline's Lambdas/storage create infrastructure metadata; VPN forwarding does not run inside Lambda/RDS/EKS. No current Ghostline RDS/EKS workload was identified. These settings do not need the EC2 runtime host agent. They are not blanket guarantees against personal data. | Preserve shared settings; audit actual Ghostline control-plane payloads/object names and applicable exports. No new plan is enabled. |

Source limits: [foundational streams and AWS-resolver scope](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html), [bundled-source limitation](https://aws.amazon.com/blogs/security/get-to-know-amazon-guardduty-runtime-monitoring-for-amazon-ec2/), [snapshot/replica lifecycle](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_malware_protection-ebs-volume-data.html). Independent CloudTrail and GuardDuty copies are separate systems. Regional detector changes are not one global switch; global IAM/STS management events can also be processed across enabled regions. A dedicated account enables project-specific policy, not AWS/ISP anonymity.

### Fresh customer-log and DNS boundary verification

[Configuration receipt](network-logging-settings.json), November 17 at 23:05 UTC: Oregon, NVA, Stockholm and Zurich each have one owned VPC and **zero customer Flow Logs** matching their VPC, subnet or ENI resources; **zero direct Resolver query-log associations** and **zero Route 53 Profile associations**. Cape Town has no VPC while parked. Customer Flow Logs are configurable per VPC/subnet/ENI; no parent or child subscription affecting these VPCs was found. Do not enable one to inspect GuardDuty's independent stream. [AWS scope/control](https://docs.aws.amazon.com/vpc/latest/userguide/working-with-flow-logs.html).

All four VPC DHCP configurations advertise AmazonProvidedDNS. [Native count-only probes](dns-boundary-probe.json) at 23:10 UTC verify the actual Corefile matches the external-DoT source and **32/32 fixed public DNS canaries** succeed from the two engine network namespaces. UDP and TCP queries addressed to both AWS Resolver addresses increment the expected forced-redirection counters. This is evidence for the sampled engine-to-CoreDNS path, not every application/device resolver path or access to GuardDuty's raw DNS feed. Host resolv.conf points at a loopback stub; DHCP alone does not establish that stub's current upstream. Host/control-plane DNS using AWS remains a separate exposure to assess; Runtime Monitoring still may observe the plaintext internal hop until removed.

No production query names, raw packet/log data or secrets were exported. Temporary diagnostics were disabled and diagnostic/admin/control lockdown was read back on all four hosts; no public management ingress changed. Reproducible public-canary probe/driver are preserved privately under `.local/zero-logs-release/dns-boundary-2026-11-17/`.

Disabling customer Flow Logs or customer query-log associations does not disable GuardDuty processing. AWS marks foundational [`FLOW_LOGS`, `DNS_LOGS` and `CLOUD_TRAIL` as read-only](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-feature-object-api-changes-march2023.html): there is no independent off switch while that regional detector remains enabled. To stop Ghostline flow processing without reducing other projects' protection, a dedicated account with GuardDuty off in the hosting regions is the clean separation. A region containing no other protected workloads is another possible isolation boundary; account separation is not the only theoretical route. Independent CloudTrail can remain. No detector/account migration is selected or applied.

### What foundational EC2 flow analysis means here

It is AWS-side analysis of network-interface flow metadata, independent of the runtime agent and any flow-log delivery we configure. Standard [VPC flow records](https://docs.aws.amazon.com/vpc/latest/userguide/flow-log-records.html) include source/destination IPs and ports, protocol, interface/account identity, first/last packet times within an aggregation window, packet/byte counts and accepted/rejected status. Optional fields add context such as TCP flags and direction. These describe the source format; they are not a verified complete schema for GuardDuty's private normalized feed or every field it retains. Customer aggregation/field settings do not control GuardDuty's independent stream.

Applied to Ghostline's current topology, the ENI can observe the outer VPN connection from a client's public address to the gateway, and separate egress connections from the gateway to destination addresses. This is an architectural inference, not a newly retrieved GuardDuty traffic trace. Timing, endpoints and volumes can support correlation, especially for a lightly shared exit. NAT means those records do not inherently supply a definitive client-to-egress mapping or expose every inner tunnel address.

Flow records contain no packet payload, HTTP body/header, URL path or DNS-question payload. Destination IPs may suggest sites but can be shared by many domains. AWS Resolver DNS analysis is a separate foundational source, limited to requests using AWS's resolver; process/command-line/internal-DNS observation belongs to Runtime Monitoring. AWS states it extracts profiling fields and discards foundational input logs, which does not imply no derived profiles/findings or downstream copies. The complete private representation and retention are not established by this audit.

## Delivery and verification sequence

1. Pass focused behavior tests, full source gate and the complete seven-image ARM64 package/encrypted-traffic gate; freeze exact candidate bytes/source inputs.
2. Capture Stockholm's baseline/parameters/endpoints and other regions' state. Stage/begin/deploy through the bounded native trial with a fresh diff and normal blue-green handoff.
3. Verify RAM mounts/confinement, blocked engine credential access, both encrypted protocols, DERP/STUN, key/config continuity, fresh complete native generation and bounded key-material searches in Docker/ECS/containerd/log storage. Emit only counts/booleans from sensitive comparisons.
4. Exercise ordinary task recovery and reboot with fresh bootstrap/ready evidence; cover failure cleanup with synthetic inputs and no production secret changes. Record tested limits instead of claiming exhaustive provider erasure.
5. Return the captured baseline through normal blue-green, verify restored config/automation/lockdown, finish exclusion and compare unaffected regions/parameters/endpoints. Record whether the candidate is qualified; do not deploy fleet-wide without completing the relevant gates.
6. Implement Ghostline-host Runtime opt-out as its own coherent source/native unit, preserving shared controls/EBS scans. No temporary disk exclusion.

## Remaining decisions

Task-role retrieval is selected under the accepted fallback; [native recovery/persistence qualification and captured baseline return pass](native-credential-trial.md). [Fleet adoption](fleet-adoption.md) is complete; Runtime opt-out remains the next separate unit. Historical copies are not revoked or securely erased; Anthony defers rotation/re-enrollment until a milestone he selects. Foundational network analysis/account separation remains a separate privacy decision. No regional GuardDuty detector/feature setting is changed by this credential trial.
