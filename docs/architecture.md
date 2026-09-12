# Architecture and runtime ownership

Read when changing an endpoint or deciding which layer owns configuration. [Product](product.md) owns scope; [ECS](ecs.md) owns primary runtime commands; [legacy runtime](runtime.md) owns Ubuntu installation. Live state is in the [Stockholm ECS](launch-stockholm-ecs.md) and [Cape Town](launch-cape-town.md) records.

## Selected topology

Stockholm's primary is `stockholm-ecs`: one ECS-optimized AL2023 x86_64 `t3.small`, encrypted 30 GiB gp3 disk, one ENI, two private addresses/EIPs and separate Xray/AWG bridge tasks. ECR owns immutable releases, Parameter Store owns regional credentials and SSM provides administration without SSH. The host reconciler filters listeners and selects each container's outbound identity. There is no NAT gateway, load balancer or autoscaler. See [ECS networking and lifecycle](ecs.md).

Anthony accepted both protocols and IP masquerading; unattended lifecycle checks passed before the 2026-09-12 cutover. The old Ubuntu Stockholm host and EIPs are retired. Device identities were preserved while local Mac profiles moved to the ECS addresses. Historical target/stack names remain stable to avoid unnecessary resource replacement.

## Shared shape and legacy backup

**Per active region: one host, one ENI, two private IPv4 addresses and two retained EIPs.** Cape Town remains the Ubuntu backup; Stockholm ECS is the primary. Cape Town’s device checkpoints passed and its original reference host is retired. There is no second permanent server per regional endpoint and no automatic switching.

| Gateway | Published listener | Outbound identity |
| --- | --- | --- |
| Xray / VLESS / REALITY | Secondary private IPv4, TCP 443 | Secondary private IPv4 → original Xray EIP |
| AmneziaWG | Primary private IPv4, UDP 443 | Primary private IPv4 → second EIP |

For the legacy Ubuntu runtime, the second EIP provides admin access and AWG's endpoint. Separate Docker bridges explicitly select source NAT and port bindings; ECS uses the host reconciler described above. Merely binding a listener does not select outgoing connection identity. [Docker publishing and SNAT](https://docs.docker.com/engine/network/port-publishing/).

Cape Town retains its `t3.small`, encrypted 20 GiB gp3 disk, dedicated VPC/public subnet, internet gateway and operator `/32` SSH rule. The pinned Ubuntu AMI renders its ENI's secondary IPv4 through cloud-init/netplan; bootstrap verifies it instead of introducing another address-management service. This legacy runtime needs no NAT gateway, load balancer, private-subnet tiers, peering, IAM instance profile or bootstrap stack. Cape Town migration is separate from the Stockholm cutover.

Both protocols share the host, kernel, capacity, AWS region and restart/failure dependencies. Separate IPs provide selectable protocol identities, not HA or guaranteed censorship unlinkability. Port 443 does not itself make a protocol ordinary HTTPS/HTTP3. Clients switch manually.

## Protocol layers

| Component | Responsibility |
| --- | --- |
| Xray-core | Proxy engine; opens destination connections and implements the selected protocols |
| VLESS | Proxy session carrying client authentication and destination requests |
| REALITY | Secure transport and camouflage around that session |
| TCP 443 | Outer transport/listener for the existing Xray endpoint |
| AmneziaWG | Independent WireGuard-derived UDP tunnel with its own obfuscation and credentials |
| Existing macOS/iOS clients | Connection UI, device routes, DNS and available IPv6/failure protection |

Xray retains version 26.7.28, VLESS Vision and the reference REALITY configuration, including `www.googletagmanager.com:443`. Preserve the complete live configuration rather than reconstructing it from this summary. Destination HTTPS encryption remains separate from tunnel protection. [Xray-core](https://github.com/XTLS/Xray-core), [VLESS](https://xtls.github.io/en/config/inbounds/vless.html), [REALITY](https://github.com/XTLS/REALITY/blob/main/README.en.md).

AWG uses upstream userspace implementation/tools and the inspected Amnezia 5.0.1.5 generation rules. Its protocol dependency is independent of Amnezia's server installer. Match device support to the actual generated 3.1 configuration; local engine acceptance does not establish UAE reachability or Apple import compatibility.

## Ownership boundary

| Owner | Responsibility |
| --- | --- |
| CDK | Region/host/network resources, EIP associations, protocol ingress and cost tags |
| Ghostline runtime | Pinned container recipes, ECS or legacy Compose lifecycle, preserved configuration, private-IP binding/SNAT and explicit credential generation/import |
| Amnezia application | Existing device connection profiles; no server management on the replacement host |
| Anthony | Practical macOS/iOS checkpoints and LastPass operations |

Amnezia's accepted reference setup worked and is the source of observed product/protocol decisions. The new runtime adapts its server recipes instead of forking the application. Preserve upstream licenses and provenance; see [runtime notice](../runtime/NOTICE.md).

The primary host OS is AL2023; Cape Town remains Ubuntu 24.04. Container distributions remain consistent with the inspected upstream recipes: Alpine for Xray and the pinned upstream Alpine-based AWG image. Host OS selection does not require protocol retuning.

## Credentials and repeatability

Preserve complete server configuration, all client identities and REALITY keys/short IDs. Retained-IP rebuilds require no profile changes; moving to new EIPs requires rendering new client endpoints with the same credentials. For Stockholm, six regional SecureStrings provide server/device source material. ECS restores server configuration at task startup; client exports render live addresses. See [secret boundaries](secrets.md).

CDK contains only nonsecret inputs/outputs. Runtime secrets belong in protected storage and task mounts, never images, userdata, arguments, screenshots or logs. ECS injects server values using narrowly scoped execution roles; Docker host administrators remain trusted. Anthony intermediates LastPass saves, and protected local recovery copies remain available.

Stockholm uses immutable content-tagged ECR releases; its image stack and Parameter Store values survive endpoint removal. Cape Town still uses local Docker archives and SSH installation from protected bundles; rebuilt host SSH keys are verified through authenticated EC2 console output. Boot and ordinary installation never generate credentials. There is no rollback framework.

## Resource lifetime and cost allocation

The reusable `EcsEndpointStack` and legacy `EndpointStack` accept explicit regional configuration and active/parked lifecycle state. Parking removes all compute, disk and networking resources while leaving the original EIP resources owned by CloudFormation. Deploying again reuses those logical IDs and allocations. `destroy` explicitly releases the retained allocations after deleting the selected stack. Disposable PoC exits should use `destroy` to avoid idle IP costs; retain IPs only when their identity is useful. [Lifecycle commands](development.md#on-demand-regional-lifecycle).

The Cape Town credential migration preserved the original EIP allocation and all Xray clients; its original host is retired. Fresh regions generate independent credentials through explicit runtime commands, then install the same pinned protocol recipes. Frankfurt and Ubuntu Stockholm remain historical deployment recipes, not live exits.

Mirror personal-assistant's case-sensitive dimensions: `Project=ghostline`, `Environment=prod`, and resource-owned `System`. Shared managed compute/root disk/networking use `System=shared`; protocol EIPs use `System=xray` and `System=amneziawg`. The existing unbilled SSH KeyPair keeps its historical `System=xray` tag because changing its tags requires resource replacement. Root-volume tags propagate from EC2; verify actual tags. Keep account-wide billing controls unchanged and use Cost Explorer's native Region dimension.

Both EIPs have Retain policies and remain billable after stack deletion until explicitly released. The EC2 root disk deletes with its host. Neither preserving an EIP nor retaining a catalog entry preserves runtime credentials; Parameter Store and protected recovery bundles supply that state.

For the researched Fargate versus EC2 start/stop/rebuild tradeoffs, see the [on-demand lifecycle assessment](deployment-lifecycle.md). Explicit ECS stop/start and retained-IP cold rebuild are implemented and validated. Automatic idle expiry, scheduling and a remote controller remain separate proposals.
