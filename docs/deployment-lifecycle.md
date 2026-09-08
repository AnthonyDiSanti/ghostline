# On-demand deployment assessment

Research date: 2026-09-07. Scope: evaluate lifecycle and cost options for the validated Cape Town Xray/AWG deployment. This is a recommendation, not an approved implementation plan or an observed AWS bill. No cloud resources were changed.

## Recommendation

Keep EC2 for the combined gateway. Add explicit start/stop management first if on-demand operation is selected. A stopped copy preserves both addresses, disk and credentials for approximately **$9.39 per idle month**. Terminating the host and deleting its disk while retaining both EIPs saves only another **$2.09/month**. Release the addresses for seldom-used exits only if changing endpoint identity is acceptable.

The current VPC, subnet, routes, security groups, ENI and internet gateway do not introduce a standing gateway/platform fee. Keeping that foundation does not require keeping compute. There is no financial reason to delete this basic networking solely to reach zero compute cost. Public IPv4 allocation is the main idle cost. [Internet gateway billing](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html), [security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html), [VPC pricing](https://aws.amazon.com/vpc/pricing/).

## Protocol and platform fit

Our runtime already replaces Amnezia's server orchestration: Ghostline owns installation, Compose, preserved configuration and per-protocol networking. Amnezia supplies the client and upstream protocol/product choices. Changing the compute platform is separate from packaging images, restoring credentials and exposing an on-demand lifecycle.

- **AWG cannot run unchanged on Fargate.** `infra/lib/runtime.ts` mounts `/dev/net/tun` and adds `NET_ADMIN`; `runtime/awg/start.sh` creates the tunnel interface, forwarding and NAT. Fargate disallows device mappings and adding NET_ADMIN. The userspace daemon avoids a host kernel module but still uses the OS TUN interface. A different userspace network-stack integration would be protocol engineering requiring a new trial, not an ECS task-definition conversion. [Fargate constraints](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html).
- **Xray is a plausible Fargate candidate, not yet tested there.** It accepts a TCP connection and opens destination sockets without AWG's TUN/router requirements. Its Compose host bindings, capability declaration, local image delivery and host configuration mounts would need task-native equivalents.
- A Fargate task has one managed ENI and can receive a public address in a public subnet. That permits direct internet access without NAT or a load balancer, but it does not reproduce our two retained EIPs and per-protocol source NAT. Containers in one task share its network namespace. Task replacement changes its addressing; use separate tasks for separate task identities. [Task networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html).
- A Network Load Balancer can provide stable ingress; it does not select the source IP of Xray's new destination connections. Static outbound IPv4 normally adds a NAT gateway. The NLB and NAT use different EIPs, so this is not the current same-address ingress/egress arrangement. REALITY requires transport passthrough: use an NLB TCP listener, not TLS termination or an HTTP application load balancer. [TCP passthrough](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html).
- An ordinary ECS cluster/service at desired count zero has no Fargate compute or separate ECS orchestration charge. Paid networking, stored images, secrets, logs and other retained services can remain billable. This does not mean an incoming VPN packet starts a task: use an explicit external management action. [ECS pricing](https://aws.amazon.com/ecs/pricing/), [desired count](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_UpdateService.html).

## Cape Town list-price model

USD, 730-hour comparison month, Linux x86 On-Demand, no discounts/credits/taxes. Exclude internet transfer, CPU surplus credits, NLB capacity/data processing and optional image/secret/log storage. These are modeled resource costs, not throughput-equivalent configurations or measured bills.

| Configuration | Idle for the whole month | Running for the whole month | Fit |
| --- | ---: | ---: | --- |
| Current EC2, 20 GiB gp3, two retained EIPs; stop when idle | $9.39 | $29.18 | Both validated protocols and unchanged profiles |
| Terminate EC2/delete disk, retain two EIPs | $7.30 | $29.18 after recreation | Both protocols; rebuild and restore required |
| Delete compute/disk and release addresses; retain free network foundation | ~$0 | $29.18 after recreation | New addresses; profile/discovery work required; excludes recovery/image storage |
| Xray-only Fargate, 0.25 vCPU/0.5 GB, direct changing public IP | ~$0 | $15.80 | Untested small task; AWG excluded; no permanent IP |
| Xray-only small Fargate plus one single-AZ NLB and one NAT gateway, all networking retained | $70.81 | $82.96 | Static ingress and a different static outbound IP; AWG excluded; processing extra |

A stopped EC2 instance retains EBS, ENIs, private addresses and associated EIPs; compute billing stops, disk/IP billing continues. The previous reboot check supports runtime boot recovery, but stop/start timing and a full cold rebuild have not been benchmarked. [EC2 stop/start semantics](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html).

Calculations:

- Current compute: `0.0271 × active hours`.
- Disk: `20 × 0.1047 = 2.094/month` while retained.
- Two EIPs: `2 × 0.005 × 730 = 7.30/month`, associated or idle.
- Stop/start for 100 active hours/month: `9.394 + 100 × 0.0271 = 12.104`.
- Small Fargate compute: `0.25 × 0.0546 + 0.5 × 0.006 = 0.01665/hour`; direct public IPv4 adds `0.005/hour` only while allocated.
- Fargate 1 vCPU/2 GB plus one task public IPv4 costs `$52.27/month` continuously. The smallest task is not a demonstrated substitute for t3.small: CPU/memory/throughput differ, and t3 is burstable.
- One single-AZ NLB plus one IPv4 costs `$25.55/month` before tasks or usage. One NAT gateway plus its IPv4 adds `$45.26/month`; combined idle floor `$70.81`. Multiple AZs or separate protocol gateways increase costs. A direct public task behind an NLB can avoid NAT if changing outbound IP is acceptable.

Even if the NLB and NAT gateway are deleted during downtime and recreated with the same retained allocations, the illustrative Xray-only Fargate design costs `7.30 + 0.10365 × active hours` per month, versus `9.394 + 0.0271 × active hours` for stopped/running EC2. The disk saving is exhausted after approximately **27.4 active hours/month**, before gateway processing or recreation overhead. At 100 active hours the estimates are $17.67 versus $12.10. This favorable Fargate comparison excludes paid gateway provisioning/deletion time and hourly rounding. Keeping the gateways continuously provisioned eliminates even that small idle advantage. Retained EIPs attach to the gateways, not directly to a Fargate task; ingress and outbound allocations remain distinct.

### Price provenance

Queried the public AWS Price List API in us-east-1 with target region af-south-1; ECS/ELB values also retrieved from the public regional catalogs. Prices can change; repeat these queries before implementation. This assessment deliberately uses Cape Town rates rather than US example prices.

| Resource | Rate | Catalog identity |
| --- | --- | --- |
| Linux shared t3.small | $0.0271/hour | AmazonEC2 SKU `49D4TM9U2Z3RXDCN`; OnDemand, effective 2026-09-01 |
| gp3 provisioned capacity | $0.1047/GB-month | AmazonEC2 SKU `XWCTMRRUJM7TGYST`; baseline IOPS/throughput only |
| Public IPv4 | $0.005/address-hour | [VPC pricing](https://aws.amazon.com/vpc/pricing/); in-use and idle |
| Fargate Linux x86 CPU / memory | $0.0546/vCPU-hour; $0.006/GB-hour | [Cape Town ECS catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/af-south-1/index.json); `AFS1-Fargate-vCPU-Hours:perCPU`, `AFS1-Fargate-GB-Hours`; published 2026-08-31 |
| NLB / capacity | $0.03/hour; $0.0071/NLCU-hour | [Cape Town ELB catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/af-south-1/index.json); `LoadBalancing:Network` |
| Zonal NAT gateway / processing | $0.057/hour; $0.057/GB | AmazonEC2 SKUs `U73HRB9YKHATEZNY`, `VJUNJK7THUCUPZ5C` |
| Internet outbound, first paid tier | $0.154/GB | AWSDataTransfer SKU `TYMC6C8YMFPJS2V8`; Africa (Cape Town) → External, 0–10,240 GB tier |

For EC2, use `aws pricing get-products --service-code AmazonEC2` with `regionCode=af-south-1` and the instance filters Linux/Shared/NA/Used/t3.small, or `volumeApiName=gp3`, or `productFamily=NAT Gateway`. Select OnDemand terms only. For transfer, use service `AWSDataTransfer`, `fromLocation=Africa (Cape Town)`, `transferType=AWS Outbound`. [AWS Price List queries](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-price-list-query-api.html), [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/).

## Traffic can outweigh compute

AWS provides 100 GB/month of internet egress free across the account's services/regions, not another 100 GB for each Ghostline exit. If 500 GB leaves Cape Town in a month, internet transfer alone is approximately **$61.60** with the entire allowance available, or **$77.00** if other projects already consumed it. Video downloaded from a destination enters AWS, then leaves AWS through the tunnel to the device; that latter leg is billed outbound traffic. Device uploads forwarded to destinations also contribute. Protocol overhead and other account traffic affect the actual total. Fargate does not eliminate these charges. [Data transfer and shared allowance](https://aws.amazon.com/ec2/pricing/on-demand/).

NAT processing and load-balancer capacity are additional to internet egress. Our direct EC2 topology avoids both. The t3.small uses Unlimited credits, so sustained CPU above its baseline can add surplus-credit charges; do not assume the compute estimate is a hard ceiling. [T3 Unlimited pricing](https://aws.amazon.com/ec2/pricing/on-demand/).

## Management direction to evaluate next

1. For a few frequently reused exits, retain identities and stop/start EC2. Keep the current simple networking and tag dimensions. Add explicit target-scoped lifecycle commands, readiness checks and status; test a real stop/start while preserving both protocols.
2. For exits unused for long periods, a cold lifecycle can delete compute/disk. Retaining both EIPs costs $7.30 per idle month; releasing them approaches zero regional idle cost but sacrifices their identities.
3. For cold rebuilds, automate trusted host bootstrap, credential restoration and image delivery. ECR content-addressed images and narrowly scoped Parameter Store access are possible later choices on EC2 too. They are not reasons to adopt Fargate. Images/configuration need durable storage independent of the destroyed host; do not bake client secrets into a reusable AMI.
4. Separate address/network ownership from disposable compute if EIPs must survive. Current Retain policies leave billable allocations after stack deletion, and a naive redeploy allocates new EIPs rather than automatically adopting retained ones. Current scripts have no complete start/stop/cold-rebuild lifecycle. Avoid manual termination as an untracked CloudFormation lifecycle mechanism.
5. If changing IPs is acceptable, evaluate stable DNS names in profiles and explicit DNS updates. Existing profiles use literal IPs; client DNS caching/re-resolution needs testing. REALITY's camouflage server name is a separate setting. Keeping credentials alone does not keep a literal-IP profile usable after releasing that IP.

Classic ECS on self-managed EC2 could later add task scheduling without Fargate's device restrictions or a separate ECS control-plane fee. It does not itself remove EC2/EBS/EIP charges, and introduces an agent/capacity-management layer. For one host, Compose plus explicit lifecycle management remains the simpler candidate. No ECS migration, stop/start, termination, address release or new image/secret infrastructure is authorized by this analysis alone.
