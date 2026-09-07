# Architecture and runtime ownership

Read when changing an endpoint or deciding which layer owns configuration. [Product](product.md) owns scope; [runtime](runtime.md) owns commands and migration stages; [Cape Town evidence](launch-cape-town.md) owns live state.

## Selected topology

**One Ubuntu 24.04 EC2 instance, one ENI, two private IPv4 addresses and two retained EIPs in Cape Town.** The original reference host remains temporarily until Anthony confirms the migrated Xray service on macOS and iOS. Retire it before installing the alternative protocol. There is no second permanent server and no automatic switching.

| Gateway | Published listener | Outbound identity |
| --- | --- | --- |
| Xray / VLESS / REALITY | Secondary private IPv4, TCP 443 | Secondary private IPv4 → original Xray EIP |
| AmneziaWG | Primary private IPv4, UDP 443 | Primary private IPv4 → second EIP |

The second EIP initially provides staging/admin access, then becomes AWG's endpoint. Separate Docker bridges explicitly select source NAT and port bindings. Merely binding a listener does not select outgoing connection identity. [Docker publishing and SNAT](https://docs.docker.com/engine/network/port-publishing/).

Keep the existing `t3.small`, encrypted 20 GiB gp3 disk, dedicated VPC/public subnet, internet gateway and operator `/32` SSH rule. The pinned Ubuntu AMI renders its ENI's secondary IPv4 through cloud-init/netplan; bootstrap verifies it instead of introducing another address-management service. No NAT gateway, load balancer, private-subnet tiers, peering, IAM instance profile or bootstrap stack is needed.

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
| CDK | Region/host/network resources, explicit migration stage, EIP associations and cost tags |
| Ghostline runtime | Pinned container recipes, Compose lifecycle, preserved configuration, private-IP binding/SNAT, explicit local credential generation/import |
| Amnezia application | Existing device connection profiles; no server management on the replacement host |
| Anthony | Practical macOS/iOS checkpoints and LastPass operations |

Amnezia's accepted reference setup worked and is the source of observed product/protocol decisions. The new runtime adapts its server recipes instead of forking the application. Preserve upstream licenses and provenance; see [runtime notice](../runtime/NOTICE.md).

The EC2 OS remains Ubuntu 24.04. Container distributions remain consistent with the inspected upstream recipes: Alpine for Xray and the pinned upstream Alpine-based AWG image. No distribution upgrade, stealth retuning or comprehensive hardening program is folded into migration.

## Credentials and repeatability

Export the entire Xray configuration directory into a protected local bundle, then install it unchanged on the fresh host. Preserve all client identities, REALITY keys/short IDs and the original EIP allocation so existing device profiles need no edit. New host SSH keys are separately verified from authenticated EC2 console output.

CDK contains only nonsecret inputs/outputs. Runtime secrets live in ignored local files and protected host mounts; never put them in images, userdata, arguments, screenshots or logs. Anthony intermediates LastPass saves. Parameter Store remains the preferred future application store, but no Parameter Store integration or host AWS plumbing is needed here.

Local Docker builds produce content-tagged amd64 images and ordinary transfer archives. There is no release catalog, automated rollback, image-backup framework, ECR or ECS infrastructure. Future SHA-tagged ECR images can replace delivery without changing protocol identity. Boot and ordinary installation never generate credentials.

## Resource lifetime and cost allocation

Migration uses the same Cape Town stack and retains original resource logical IDs. Preparation adds a distinct host; cutover changes the EIP association, not the allocation. AWS models association updates as replacement; the EIP resource remains retained. [CloudFormation EIPAssociation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-eipassociation.html).

After the owner confirms both unchanged Xray profiles, remove the reference host/disk and temporary migration scaffolding. Only then enable/install AWG. Keep release and fleet automation out of this work unit. Frankfurt remains a historical deployment and an available recipe; do not redeploy it implicitly.

Mirror personal-assistant's case-sensitive dimensions: `Project=ghostline`, `Environment=prod`, and resource-owned `System`. Shared managed compute/root disk/networking use `System=shared`; protocol EIPs use `System=xray` and `System=amneziawg`. The temporary original host keeps its historical `System=xray` tag until retirement. Root-volume tags propagate from EC2; verify actual tags. Keep account-wide billing controls unchanged and use Cost Explorer's native Region dimension.

Both EIPs have Retain policies and remain billable after stack deletion until explicitly released. The EC2 root disk deletes with its host. Neither preserving an EIP nor retaining a catalog entry preserves runtime credentials; the recovery bundle supplies that state.
