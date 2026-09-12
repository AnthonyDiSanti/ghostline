# Container release and SSH-free ECS/EC2 direction

Historical discussion: implementation now lives in [ECS trial](../../../docs/ecs.md); its selected architecture and live evidence supersede the recommendations below where they differ.

2026-09-10 discussion. Anthony questions retaining SSH keys, prefers reusable container images over a deployment-specific AMI, and proposes testing ECS on one EC2 instance. No migration, IAM, image publication or live capacity change occurred during this assessment. This revisits the earlier standalone stop/start sequence; do not build it while the execution model is being selected.

## Assessment

Recommend ECS on EC2 as a reasonable next packaging/orchestration experiment. We already build two genuine protocol images from Dockerfiles. Package their startup/configuration rendering, publish immutable releases (ECR is now a concrete candidate), and replace local Docker/SSH installation with ECS launch using regional secret references. Do not snapshot/commit the configured running host/container into a secret-bearing image.

- Image: pinned engine, dependencies, startup logic and nonsecret configuration templates/defaults.
- CDK/task definition: region-specific network wiring, resource limits, parameter references and image digests.
- Regional Parameter Store: preserved server credentials and separately restricted client recovery/profile material.
- Host: stock ECS-optimized AMI with Docker and ECS agent already installed; configure cluster membership, IAM and any Ghostline-specific networking declaratively. No credentials embedded in userdata.

An EC2 host still boots an AMI. Recommend AWS's stock [ECS-optimized Amazon Linux 2023 AMI](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html) for the proposed new trial, rather than preserving Ubuntu solely by manually installing the ECS agent. The earlier Ubuntu choice kept the Amnezia reference consistent; the current engines run in Alpine containers. Host OS compatibility still needs testing, but no concrete Ubuntu-only engine dependency has been identified. This is a proposed host-OS change, not a modification to the current exits. [CDK EcsOptimizedImage](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.EcsOptimizedImage.html) supplies the standard image selection.

### Correction: use AWS's existing container-loading mechanisms

Anthony challenged the implied custom host work. AWS already supplies the ECS-ready host, managed ECR image pulls and native Parameter Store secret injection. Configure ECR image references/digests, services, parameter references and IAM through CDK; do not write a custom image loader or manually prepare Docker/ECS on the new host. [ECR with ECS](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ECR_on_ECS.html), [Parameter Store injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html), [CDK Secret](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.Secret.html).

Native secret injection supplies environment variables at task startup. Our engines consume files, so a small config-materialization entrypoint or one-shot file initializer remains application work; it must avoid logging values and maintain protected file permissions. A file-fetching initializer is an alternative when keeping secrets out of container environment metadata is desired. Select the delivery method explicitly rather than suggesting a custom secret service is required. Protocol-specific two-IP networking and lifecycle policy remain Ghostline responsibilities. No host image, image-pull daemon or general-purpose orchestrator needs to be built.

## SSH and guest management

SSH currently transports bootstrap commands, images/configuration, recovery exports and verification in `infra/scripts/runtime.ts`. It is not used by client authentication or ordinary tunnel traffic. EC2 start/stop itself uses AWS APIs and needs no SSH. Future guest creation can generate one VLESS identity and/or AWG peer credentials, preserve existing users, persist the updated server/client configuration and apply it via ECS replacement or an authenticated reload path. The repository does not yet implement a guest-management command.

Changing a guest list does not need an image rebuild or an SSH identity for the guest. Initial task replacement is straightforward but can interrupt that protocol; hot reload is separate work. Updating Parameter Store alone does not reconfigure a running process. Startup-fetched configuration must be refreshed through a deployment/reload. [ECS secret-update behavior](https://repost.aws/knowledge-center/ecs-manage-secrets-access-keys).

[Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) provides IAM-controlled host diagnostics without SSH keys or inbound SSH. ECS Exec is another option, but its documented writable-root-filesystem requirement conflicts with our current read-only containers; do not silently relax that protection just to enable it. [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html). Preserve existing admin keys for current deployments/recovery until replacement access and workflows are validated; the proposed new host can omit KeyName and port 22.

## Topology and the networking checkpoint

### Host-image choices

For this Linux VPN workload, the practical choices are:

| Image | Fit |
| --- | --- |
| ECS-optimized Amazon Linux 2023, x86_64 | Recommended initial candidate: standard AWS ECS host and same CPU architecture as both currently built images. General-purpose host tooling accommodates explicit packet-filter/NAT configuration. |
| ECS-optimized Amazon Linux 2023, arm64 | Graviton candidate later; rebuild/validate both images and pinned binaries for arm64 rather than assuming the existing amd64 artifacts run natively. |
| ECS Bottlerocket variant | Purpose-built immutable container host with ECS integration, no normal package manager or SSH server. Attractive long term; custom host-network operations need its supported bootstrap/host-container mechanisms and validation. |
| Ubuntu 24.04 with ECS agent | Retains the observed host family, but requires agent/runtime integration that the stock ECS images already provide. Consider only for an identified compatibility reason. |

Sources: [ECS Amazon Linux images](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html), [Bottlerocket](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-bottlerocket.html), [Bottlerocket host containers](https://bottlerocket.dev/en/os/1.35.x/concepts/host-containers/), [non-Amazon-Linux ECS agent installation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-agent-install.html). Amazon Linux 2 is an older line with its documented June 2026 end of life; do not choose it for this new deployment. GPU/Neuron and Windows variants do not serve our current Linux/amd64 images. The AL2023 ECS image normally has a 30 GiB root volume; check snapshot minimum and costs before carrying over the current 20 GiB setting.

Candidate active topology: one ECS cluster per active region, one EC2 host, and one service/task per protocol, each desired count one. Two tasks do not imply two hosts. Keep independently released Xray and AWG containers; combining both into one image is unnecessary. ECS task definitions on EC2 expose device mapping and Linux capabilities, so `/dev/net/tun` and NET_ADMIN are expressible without privileged mode. [EC2 task definition](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html).

Current Compose relies on explicit published host IPv4 and per-network `com.docker.network.host_ipv4` source NAT. Those are not a direct ECS default-bridge conversion. Default `awsvpc` EC2 task ENIs also lack public IPs and are not a drop-in replacement for our two host EIPs; AWS documents NAT/load-balancer paths for that model. [Task ENIs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html). Host mode would put AWG's network capabilities into the host namespace, changing isolation. Do not select that merely for convenience.

Resolve an ECS-compatible networking design and prove both ingress bindings and actual per-protocol egress identities, including task replacement/host replacement, before promoting the migration. Preserve one host/two EIPs, no NAT gateway or load balancer as the intended low-cost topology; feasibility of that exact ECS network design remains untested. A fully self-contained container cannot own AWS EIP allocations, host agents or arbitrary host network configuration through image contents alone.

### Recommended networking candidate: bridge tasks with explicit host rules

The desired outcome is feasible at the EC2/Linux level and already observed under Compose. It requires one ENI with two private IPv4 addresses, each associated with its own EIP; multiple NICs are not necessary. [EC2 multiple addressing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html#multiple-ip-addresses). Two protocol containers remain separate ECS services/tasks on the same host. Additional ECS/management agents are platform processes, not extra VPN servers.

Prefer an ECS bridge-mode trial that retains separate network namespaces for the protocol processes. ECS can publish Xray TCP 443 and AWG UDP 443 in their separate task definitions. Its [PortMapping API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html) exposes host/container ports and transport, but not Docker's HostIp or our current per-network driver options.

Add a deliberately owned host network component for the missing policy:

1. Restrict each published listener to the intended original destination private IP; wildcard ECS publication must not make both protocols usable on both EIPs.
2. Source-NAT Xray-originated traffic to the Xray private IP and AWG-originated traffic to the AWG private IP, before Docker's generic masquerade. Classify by actual container identity/address, not TCP versus UDP: both gateways can relay ordinary TCP/UDP user traffic.
3. Discover the current task/container addresses from trusted local ECS/Docker metadata and reconcile rules on task start/stop/replacement and Docker/host restart. Do not hard-code ephemeral container IPs or use a one-time rule that becomes stale after ECS replacement.
4. Preserve filtering between protocol containers and block access to host/instance credentials except the deliberately enabled task-credential mechanism. Keep Docker's own rules enabled, use owned chains, and gate forwarding until the selected identity rules are installed so a restart cannot silently fall back to the wrong EIP. Treat IP reuse/connection tracking as part of lifecycle testing.

This is a custom host routing component, not an ECS-native per-IP checkbox or a tested implementation. It can be a host service delivered with bootstrap; no third VPN container, gateway appliance or extra EC2 is inherently necessary. Exact firewall implementation must be tested with the Docker version shipped in the selected AL2023 image. Docker documents its user filtering chain and original-destination matching after DNAT; it also warns that rule placement and connection tracking affect behavior/performance. [Docker firewall integration](https://docs.docker.com/engine/network/firewall-iptables/).

Other choices: host mode removes bridge translation but shares the host network namespace, including the effects of AWG's NET_ADMIN, and still needs correct source selection/listener restrictions. It is not the preferred tradeoff; [AWS host-mode guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-networkmode-host.html) describes the isolation implications. `awsvpc` has clean private task networking but no directly provisioned public IPv4 for EC2 tasks; task ENIs are service-managed and cannot simply be treated as our manually controlled EIP ENIs. Do not propose unsupported EIP mutations as a shortcut.

Acceptance for the candidate: both actual public ingress/egress identities and wrong-IP rejection, concurrent Xray/AWG use, container task replacement with changed internal IPs, host replacement/EIP reassociation, metadata/isolation checks and retained client identities. Only after that is it an observed ECS solution. Existing working regional hosts remain untouched during this research.

## Capacity and lifecycle

Distinguish service desired tasks from host capacity. Services at zero do not by themselves stop billing a host left running. Use explicit bounded host capacity 0/1 if an ASG is selected; ECS managed scaling has a documented initial two-instance scale-out behavior, which is unnecessary for this experiment. [Capacity providers](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/asg-capacity-providers.html), [managed scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/managed-scaling-behavior.html).

ASG capacity zero terminates hosts; it is not EBS-preserving EC2 stop. Do not manually stop an ASG-managed instance and assume it will remain stopped. Preserve credential and optional EIP ownership independently, reassociate addresses on replacement, and distinguish stop-first single-host task updates from HA rolling deployment. Enforce a one-host ceiling and tolerate an explicit update interruption. Classic self-managed ECS/EC2 has no extra ECS service charge; EC2, EBS, EIPs, registry storage and optional supporting resources remain billable. [ECS pricing](https://aws.amazon.com/ecs/pricing/).

Suggested next work unit once this direction is selected: Parameter Store import/read with existing identities, immutable image publication, SSH-free bootstrap and management, explicit one-host ECS topology/network validation, credential/profile preservation, and ECS-aware up/down rather than standalone instance stop/start automation. Keep existing regional exits intact until a migration target and cutover are selected.
