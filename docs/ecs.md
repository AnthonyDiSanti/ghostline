# ECS on EC2 runtime

Stockholm's primary runtime since the 2026-09-12 cutover. Anthony accepted both protocols and IP masquerading; unattended stop/start and retained-IP cold rebuilds passed before retiring the old Ubuntu Stockholm host and EIPs. Cape Town remains unchanged. Read [current deployment evidence](launch-stockholm-ecs.md) before changes. Keep target `stockholm-ecs` and stack names `GhostlineEcsTrial` / `GhostlineEcsTrialImages`: promotion does not require replacing AWS resource identities.

## Platform and ownership

Use the stock ECS-optimized Amazon Linux 2023 **x86_64** AMI, pinned in `infra/deployment.json`, with one `t3.small` and encrypted 30 GiB gp3 root disk. `EcsEndpointStack` owns one public VPC/subnet, one ENI, two EIPs, an ECS cluster, two services and narrowly scoped host/execution roles. There is no NAT gateway, load balancer or autoscaler. Each service runs one bridge task; deployments stop the prior task before starting its replacement because its host port is fixed.

`EcsImagesStack` owns three immutable, retained ECR repositories: `xray`, `awg` and `xray-config`. Xray mirrors the unmodified official XTLS 26.7.28 amd64 image by digest; its ECR manifest matches upstream. Owned AWG/initializer releases use SHA-256 tags over their allowed Dockerfile/entrypoint inputs and pinned dependencies. Images contain no server/client credentials. ECR storage remains billable while the endpoint is stopped or removed; the initializer adds image storage, not another running server.

The host uses AWS's Docker/ECS agent and net-utils. Nonsecret userdata installs the small network reconciler and enables SSM administration. No SSH key, inbound SSH or custom AMI is required. The EC2 resource depends on the cluster so deletion terminates the host first. Removal commands explicitly deregister stopped/disconnected empty hosts, which AWS does not clean up automatically.

ECS injects the Xray server bundle only into the network-disabled `xray-config` initializer. It writes a task-scoped volume on encrypted EBS with directory/file modes `0700`/`0400`, owned by `65532:65532`, and exits. Xray starts only after initializer success, runs as that non-root user and mounts the file read-only. Its explicit single-file command preserves existing settings without loading upstream default fragments. AWG retains its protected tmpfs startup adapter. Both keep task roles absent and protocol-specific execution-role parameter access. [Image/configuration details](xray-images.md).

Docker/ECS host administrators remain trusted: native injection stores values in initializer/AWG container metadata, so unrestricted Docker inspection is confidential. Runtime metadata helpers inspect only selected fields. Task storage is cleaned through the ECS lifecycle; it is not an immediate secure-erasure guarantee. Anthony accepted encrypted task storage for this first XTLS integration; restoring RAM-backed rendered configuration remains an explicit follow-up.

## Bridge networking

| Task | Private address / public EIP | Listener | Container permission |
| --- | --- | --- | --- |
| Xray | `10.79.0.11` / Xray EIP | TCP 443 | NET_BIND_SERVICE |
| AWG | `10.79.0.10` / AWG EIP | UDP 443 | NET_ADMIN and `/dev/net/tun` |

ECS bridge port mappings have no Docker `HostIp` field. The host therefore filters each listener to its intended private address, and SNATs each discovered container's outbound traffic to that address. Discovery uses exact ECS task-family/container labels and tracks container identity/IP changes. During reconciliation, forwarding closes before NAT and stale conntrack entries change, then reopens. Unknown bridge peers, cross-container traffic, host access and link-local metadata are blocked. DNS uses explicit public resolvers because the VPC subnet is excluded from container egress.

This is application-specific host networking and the main compatibility test for AL2023/Bottlerocket. Two EIPs retain separate selectable protocol addresses, but both protocols still share one host and region; this is not HA or automatic failover. The poll-based reconciler is not a hostile multi-tenant isolation boundary. Validate replacement and actual tunnel egress, not just ECS's running-task count.

## Packaging assessment — 2026-09-12

Anthony requested evaluating packaging after confirming both Stockholm protocols on the iPhone. Preserve external port 443 for both and keep the existing two EIPs during this evaluation. TCP 443 and UDP 443 are separate listeners, so port numbering alone does not require separate public IPs. Their value here is protocol address separation. Docker documents publishing the same numeric port for [TCP and UDP](https://docs.docker.com/engine/network/port-publishing/); this is distinct from ECS's per-container mapping constraint below.

At this assessment, code created **one EC2 instance, two ECS services, one task per service and one protocol container per task**, all on that host. The subsequent XTLS migration adds a short-lived initializer to the Xray task; the two long-running protocol containers remain separate. One ENI carries both private addresses and their EIPs. Cape Town is a separate regional backup host, not a second Stockholm protocol server. See `infra/lib/ecs-stack.ts`.

| Packaging on the same host | Benefit | Tradeoff / implementation consequence |
| --- | --- | --- |
| Two services/tasks, one container each — current | Independent protocol updates, credentials and container permissions; existing per-container egress selection works | Two task definitions/services to describe; shared host still couples host failures |
| One service/task, two containers | One task release can describe the complete exit while retaining separate bridge containers and per-container capabilities | Task replacement deploys both engines together. With both essential and no restart policy, one container exit stops the task. The task execution role needs both server parameters; update the network helper's exact family discovery |
| One service/task/container, two engines | One image and service artifact | Add process supervision, combined release/health handling and a shared container network boundary. AWG's network authority reaches that shared namespace. Existing container-IP SNAT cannot distinguish the two engines' outgoing traffic; preserve two egress IPs through a newly designed classifier |

The shared-task failure behavior follows [ECS essential-container semantics](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html). Container restart policies can change individual failure handling but do not make task-definition deployments independent. Multiple processes are supported, with lifecycle management owned by the container entrypoint; see [Docker process management](https://docs.docker.com/engine/containers/multi-service_container/).

ECS's [PortMapping API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html) documents that one container cannot expose the same container port for multiple protocols. A combined-container bridge trial should therefore use distinct internal port numbers, mapped to external TCP 443 and UDP 443. That preserves the requested client ports but needs an actual ECS registration/runtime trial. Two separate containers do not need this internal-port change.

Assessment: **retain separate protocol containers and services for now**. All three options still require the same EC2 host; merging does not itself eliminate compute. The current separation is useful for independent releases and the two-IP routing requirement. A shared task is the reasonable consolidation experiment if a single task release is valuable. A combined container adds routing/process work and weakens the current network separation; it is not the recommended next implementation. This is a reviewed recommendation, not a packaging deployment or a measured performance comparison.

### Compute efficiency and downsizing — 2026-09-13

Anthony asked whether merging could reduce resource use enough to permit a smaller instance at the same load. Expect limited savings from the container boundary itself: both engine processes, their encryption/packet handling and working memory remain. The Linux kernel, Docker, ECS agent and host reconciler are already shared. Merging can remove some per-container bookkeeping/init overhead, but also needs supervision and redesigned two-IP routing. A small saving could matter at an instance-size threshold; no benchmark establishes such a threshold here. Containers share the host kernel rather than each running a guest OS. [Docker container model](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/).

The protocol containers set Xray `memory: 256` MiB and AWG `memory: 512` MiB, with no `memoryReservation`: ECS accounts for **768 MiB for the two engines at placement**, plus the initializer described below, even if actual resident use is lower. These are limits/reservations, not measurements or eagerly allocated RAM. Each container has `cpu: 256`; under Linux these are relative CPU shares, not dedicated cores or hard usage caps. Uncontended CPU can be used by either engine. [ECS memory and CPU parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html).

The XTLS migration adds a 64 MiB initializer limit (16 CPU shares), bringing task-definition memory accounting to 832 MiB across both services. That helper exits before the Xray engine starts; the reservation is not a continuously running process or measured memory consumption.

A combined memory limit can pool noncoincident peaks, but pooling alone does not reduce actual simultaneous usage. Separate containers can also use measured soft reservations with suitable hard limits; merging is not required to correct conservative scheduling reservations. Keep total concurrent demand and host overhead within the smaller machine's capacity.

Recommendation: measure host/process/container memory and CPU at idle, representative load through each protocol, simultaneous device use and restart peaks; include sustained throughput and CPU-credit behavior when evaluating a smaller burstable instance. Tune reservations/limits and test downsizing with the existing packaging first. No smaller instance, load benchmark or resource-limit change was deployed during this assessment; no percentage saving is claimed.

## Commands

Run from `infra/` under Node 24, AWS profile `personal`:

```sh
npm run ecs stockholm-ecs import
npm run ecs stockholm-ecs publish
npm run ecs stockholm-ecs deploy
npm run ecs stockholm-ecs verify
npm run ecs stockholm-ecs test
npm run ecs stockholm-ecs profiles
npm run ecs stockholm-ecs stop
npm run ecs stockholm-ecs start
npm run ecs stockholm-ecs status
npm run test:ecs-images
```

`import` validates the preserved Stockholm server/device files, creates missing regional SecureStrings, refuses conflicts and verifies exact round-trip bytes. It never generates identities. See [secret paths and recovery boundaries](secrets.md). Cape Town migration remains separate because its legacy Xray device exports need normalization.

`publish` diffs/deploys only the image stack, mirrors pinned XTLS without rebuilding it, builds missing AWG/initializer releases and pushes to ECR. It verifies mirrored image identity after pulling back from ECR. `deploy` checks the selected AWS AMI/account/region, server parameters and all three image artifacts, then runs a fresh diff and deploy. Explicit ECS deploy/publish commands run CDK without an interactive approval prompt after their fresh diff, allowing unattended recreation of the selected stack. Review the source and diff before launching; the legacy deployment helper keeps its existing approval behavior. ECS does not use legacy SSH runtime commands.

`verify` uses SSM to compare runtime configuration hashes, private Xray permissions/mounts, separate EIP egress and metadata isolation. Host Python reads the exact container filesystem and probes from its network namespace, without requiring tools in distroless Xray. The public probe address is resolved on the host; this check does not establish container DNS behavior. `test` requires the native VPN to be disconnected: nesting the AWG probe through Xray can prevent UDP handshakes and is not a valid direct-path comparison. It creates protected profiles and disposable Docker clients that perform real encrypted HTTPS requests through both protocols without changing laptop routes. Xray client files use the same initializer/private-volume handoff. Local Docker must have all three published images. Tests do not establish native macOS/iOS import, practical browsing, DNS-leak or IPv6 behavior.

`test:ecs-images` builds/mirrors local images and exercises valid/invalid synthetic configuration, exact bytes and private permissions, the initializer-exit handoff and non-root TCP 443 binding. It needs Docker/public image access but no AWS credentials. The normal `npm test` gate remains offline.

`profiles` writes native configs, links and QR files under `.local/recovery/stockholm-ecs-clients/`. It renders live endpoint addresses over the preserved device identities; imported Parameter Store source profiles can still contain historical addresses. Use these generated exports for clients instead of importing raw parameter values. Keep the catalog's retired `stockholm` recipe and protected source files because `credentialSource` still uses that identity. Keep all derived files private.

`stop` sets both service counts to zero, waits for drain and stops the exact CloudFormation-owned host. `start` starts that host, waits for EC2 health, restores both counts to one and waits for ECS stability. Disk/EIPs remain billable; no autoscaler restarts the host. Temporary desired-count changes are intentional service drift. Automatic idle expiry and a remote UI are not implemented.

`npm run park stockholm-ecs` removes endpoint compute/disk/networking but retains its two tracked EIPs. Redeploy restores from ECR/Parameter Store. `npm run destroy stockholm-ecs` releases its EIPs after deleting the selected endpoint. Images and regional credentials survive either operation; deleting those is separate. The 2026-09-12 trial passed running/stopped-host park/rebuild and stop/start. The 2026-09-13 official XTLS migration repeated stop/start and a running-host cold rebuild unattended, with both real protocol checks after restoration; see the launch evidence above. Do not destroy the image stack to save endpoint compute costs.

## Follow-up evaluations

Anthony selected Stockholm for architecture refinement and wants Cape Town kept running as the stable backup. Upgrade Cape Town only after the primary architecture work is complete; include its legacy client-export normalization and regional secret import in that later unit.

The [maintained Xray image assessment](xray-images.md) records the official image migration at the existing engine version. ARM and newer engine versions remain separate evaluations. The explicit RAM-backed configuration task follows this initial encrypted-volume implementation; it is not an initial acceptance gate.

1. **Graviton** changes CPU architecture and potentially price/performance. Verify both upstream binaries/images support arm64, then compare throughput and CPU on AL2023. It is independent of the host OS choice.
2. **Bottlerocket** changes host management/immutability. Evaluate whether this custom bridge/SNAT policy can be expressed cleanly with its supported host/bootstrap mechanisms. It can also run on Graviton; these are separate choices.
3. **One public IP** can technically host TCP 443 for Xray and UDP 443 for AWG without a port collision. It saves one EIP charge and removes protocol-specific SNAT complexity, but loses address separation: an IP block affects both protocols.
4. **Container/task packaging** has an initial assessment above. Separate services remain the recommendation; shared-task runtime validation is an optional experiment, and a combined container requires redesigned egress classification and internal port mappings.
5. Ubuntu is a fallback only if Amazon Linux cannot support the workload. Do not make switching distributions, HA or automatic failover prerequisites.

## Primary references

- [AWS ECS-optimized images](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html): stock host components, x86/ARM variants and release parameters.
- [ECS EC2 task parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html): bridge capabilities/devices, tmpfs, DNS and logging settings.
- [ECS port mapping API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html): no per-port host IP binding field.
- [Docker iptables behavior](https://docs.docker.com/engine/network/firewall-iptables/): DOCKER-USER ordering and original-destination matching after DNAT.
- [Container-instance deregistration](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deregister_container_instance.html): running agents deregister on termination; stopped/disconnected hosts require explicit removal.
- [ECS Parameter Store injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html): task-start injection, execution-role permissions and restart requirements after updates.
