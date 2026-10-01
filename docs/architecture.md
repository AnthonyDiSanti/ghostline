# Regional gateway architecture

Ghostline has one deployment model: an ECS gateway on an official ECS-3 Bottlerocket ARM64 EC2 host. [ECS runtime](ecs.md) owns the detailed contract; [development](development.md) owns commands and code navigation.

## Regional unit

Each regional exit owns a dedicated, non-default VPC (`10.79.0.0/24`), one public subnet, one `t4g.small`, encrypted 2 GiB OS disk and 30 GiB gp3 data disk, one host ENI and two retained EIPs. The stack creates the VPC directly; it neither imports the default VPC nor connects to other VPCs. Keep unrelated workloads out of this disposable regional VPC. Xray serves VLESS/REALITY on TCP 443 through one address; AmneziaWG serves UDP 443 through the other. Clients switch manually. Both protocols share the host and region; address separation does not provide high availability.

One ECS service manages one task containing separate `xray` and `awg` engines plus the short-lived `gateway-config` initializer. Both engines wait for initialization success, mount only their own RAM-backed configuration read-only and share one formula-derived memory budget. Eligible engine exits restart independently; whole-task replacement reruns initialization. An essential finite Bottlerocket bootstrap establishes RAM and a closed forwarding guard before ECS starts. A restricted ECS DAEMON reconciles networking continuously; it has no host mounts, control socket or application secrets. See [configuration, networking and recovery](ecs.md).

`EcsEndpointStack` owns shared regional resources. Reusable `HostSlotStack` templates own slots a/b; meaningful releases temporarily overlap two hosts and two extra EIPs, returning to one host/two production EIPs after native ECS bake and verified cleanup. `RegionalReleaseStack` owns five component repositories plus the authoritative OCI release-document repository and regional rollout controller, independently of endpoint stop/park. Complete destroy retires these resources/images; Standard regional Parameter Store server/device credentials survive. [Release distribution](releases.md) owns publication/history; [platform policy](platform.md) owns native boot, OS and confinement. Rebuild preserves credential identity and retained endpoints; profile export substitutes newly allocated IPs when addresses were released. [Secrets](secrets.md) defines access boundaries.

Where regional runtime telemetry is supported, the stack also owns a private GuardDuty telemetry endpoint and security group, ordered before host creation and after host deletion. Its additional interface carries telemetry. An imperative deployment step creates the account/region detector with AWS defaults plus supported Runtime Monitoring, or enables only missing available requirements on an existing detector. It preserves unrelated settings and never disables or deletes regional security. Host inclusion tags enroll our hosts with AWS-managed agents where runtime transport is supported. Confirmed service/capability gaps are accepted and reported; live discovery controls the deployment shape. [GuardDuty](guardduty.md) defines scope, data collection and deployment verification; [lifecycle](deployment-lifecycle.md#guardduty-telemetry-lifecycle) records the endpoint comparison and conditional adoption requirement.

There is no SSH provisioning, Compose deployment mode, NAT gateway, load balancer, autoscaler or cross-task initialization controller. SSM provides host administration. AWS management credentials remain with the operator; protocol containers receive no task role.

## Resource and billing identity

The maintained catalog contains `stockholm-ecs` (primary) and `cape-town` (backup). Stockholm’s deployed stack names `GhostlineEcsTrial` and resource prefix `ghostline-ecs-stockholm` remain stable AWS identities. Their names do not select a different architecture. Adding another region instantiates the same stack class with explicit account/region/AZ/resource inputs and the official regional AMI mapping for the centrally qualified OS version; it does not introduce a new implementation.

Cost tags mirror personal-assistant: exact `Project=ghostline`, `Environment=prod`, and resource-owned `System`. Host/network/shared-task/initializer resources use `shared`; engine repositories and EIPs use `xray` or `amneziawg`. Region is already an AWS billing dimension. Global tags cannot override `System`. See [reference reuse](reference-reuse.md).

## Regional identity

[Cape Town](launch-cape-town.md) uses `GhostlineCapeTown`, with resource prefix `ghostline-cape-town`. Its existing EIPs and device credentials are preserved during migration into the same recipe. Each region has independent image repositories and parameters; there is no dependency on Stockholm for runtime or startup.

## Validation boundary

Offline synthesis verifies infrastructure shape and ownership; image tests verify actual initializer/engine behavior. Real encrypted client tests prove tunnel egress through each assigned address. Native device acceptance, sleep/wake, IPv6 behavior and representative throughput require their own evidence. [Stockholm evidence](launch-stockholm-ecs.md) records what passed.
