# Regional gateway architecture

Ghostline has one deployment model: an ECS gateway on an ECS-optimized Amazon Linux 2023 ARM64 EC2 host. [ECS runtime](ecs.md) owns the detailed contract; [development](development.md) owns commands and code navigation.

## Regional unit

Each regional exit has one `t4g.small`, encrypted 30 GiB gp3 root disk, public subnet, one ENI and two retained EIPs. Xray serves VLESS/REALITY on TCP 443 through one address; AmneziaWG serves UDP 443 through the other. Clients switch manually. Both protocols share the host and region; address separation does not provide high availability.

One ECS service manages one task containing separate `xray` and `awg` engines plus the short-lived `gateway-config` initializer. Both engines wait for initialization success, mount only their own RAM-backed configuration read-only and share one formula-derived memory budget. Eligible engine exits restart independently; whole-task replacement reruns initialization. Host fixtures supply generic storage and networking. See [configuration, networking and recovery](ecs.md).

`EcsEndpointStack` is reusable across explicitly configured regions. `EcsImagesStack` retains three ECR repositories independently of endpoint removal. Regional Parameter Store holds six server/device SecureStrings independently of either stack. Deployment, restart and rebuild preserve credential identity; profile export substitutes current EIPs. [Secrets](secrets.md) owns the format and access boundary.

There is no SSH provisioning, Compose deployment mode, NAT gateway, load balancer, autoscaler or cross-task initialization controller. SSM provides host administration. AWS management credentials remain with the operator; protocol containers receive no task role.

## Resource and billing identity

The maintained catalog contains `stockholm-ecs` (primary) and `cape-town` (backup). Stockholm’s deployed stack names `GhostlineEcsTrial` / `GhostlineEcsTrialImages` and resource prefix `ghostline-ecs-stockholm` remain stable AWS identities. Their names do not select a different architecture. Adding another region instantiates the same stack class with explicit account/region/AZ/AMI/resource inputs; it does not introduce a new implementation.

Cost tags mirror personal-assistant: exact `Project=ghostline`, `Environment=prod`, and resource-owned `System`. Host/network/shared-task/initializer resources use `shared`; engine repositories and EIPs use `xray` or `amneziawg`. Region is already an AWS billing dimension. Global tags cannot override `System`. See [reference reuse](reference-reuse.md).

## Regional identity

[Cape Town](launch-cape-town.md) uses `GhostlineCapeTown` / `GhostlineCapeTownImages`, with resource prefix `ghostline-cape-town`. Its existing EIPs and device credentials are preserved during migration into the same recipe. Each region has independent image repositories and parameters; there is no dependency on Stockholm for runtime or startup.

## Validation boundary

Offline synthesis verifies infrastructure shape and ownership; image tests verify actual initializer/engine behavior. Real encrypted client tests prove tunnel egress through each assigned address. Native device acceptance, sleep/wake, IPv6 behavior and representative throughput require their own evidence. [Stockholm evidence](launch-stockholm-ecs.md) records what passed.
