# ECS on EC2 runtime

Stockholm's primary runtime since the 2026-09-12 cutover. Anthony accepted both protocols and IP masquerading; unattended stop/start and retained-IP cold rebuilds passed before retiring the old Ubuntu Stockholm host and EIPs. Cape Town remains unchanged. Read [current deployment evidence](launch-stockholm-ecs.md) before changes. Keep target `stockholm-ecs` and stack names `GhostlineEcsTrial` / `GhostlineEcsTrialImages`: promotion does not require replacing AWS resource identities.

## Platform and ownership

Use the stock ECS-optimized Amazon Linux 2023 **x86_64** AMI, pinned in `infra/deployment.json`, with one `t3.small` and encrypted 30 GiB gp3 root disk. `EcsEndpointStack` owns one public VPC/subnet, one ENI, two EIPs, an ECS cluster, two services and narrowly scoped host/execution roles. There is no NAT gateway, load balancer or autoscaler. Each service runs one bridge task; deployments stop the prior task before starting its replacement because its host port is fixed.

`EcsImagesStack` owns two immutable, retained ECR repositories. SHA-256 tags identify the Dockerfile/entrypoint inputs, including pinned upstream base digests and Xray artifact checksum. The build context is an explicit file allowlist. Images contain engines and startup adapters, not server/client credentials. ECR storage remains billable while the endpoint is stopped or removed.

The host uses AWS's Docker/ECS agent and net-utils. Nonsecret userdata installs the small network reconciler and enables SSM administration. No SSH key, inbound SSH or custom AMI is required. The EC2 resource depends on the cluster so deletion terminates the host first. Removal commands explicitly deregister stopped/disconnected empty hosts, which AWS does not clean up automatically. Server secrets enter each task through ECS Parameter Store injection; entrypoints render files in protected tmpfs and remove the secret environment variable before launching the daemon. Docker/ECS host administrators remain trusted: native injection stores values in container metadata, so unrestricted Docker inspection is confidential. Runtime metadata helpers deliberately inspect only selected nonsecret fields.

## Bridge networking

| Task | Private address / public EIP | Listener | Container permission |
| --- | --- | --- | --- |
| Xray | `10.79.0.11` / Xray EIP | TCP 443 | NET_BIND_SERVICE |
| AWG | `10.79.0.10` / AWG EIP | UDP 443 | NET_ADMIN and `/dev/net/tun` |

ECS bridge port mappings have no Docker `HostIp` field. The host therefore filters each listener to its intended private address, and SNATs each discovered container's outbound traffic to that address. Discovery uses exact ECS task-family/container labels and tracks container identity/IP changes. During reconciliation, forwarding closes before NAT and stale conntrack entries change, then reopens. Unknown bridge peers, cross-container traffic, host access and link-local metadata are blocked. DNS uses explicit public resolvers because the VPC subnet is excluded from container egress.

This is application-specific host networking and the main compatibility test for AL2023/Bottlerocket. Two EIPs retain separate selectable protocol addresses, but both protocols still share one host and region; this is not HA or automatic failover. The poll-based reconciler is not a hostile multi-tenant isolation boundary. Validate replacement and actual tunnel egress, not just ECS's running-task count.

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
```

`import` validates the preserved Stockholm server/device files, creates missing regional SecureStrings, refuses conflicts and verifies exact round-trip bytes. It never generates identities. See [secret paths and recovery boundaries](secrets.md). Cape Town migration remains separate because its legacy Xray device exports need normalization.

`publish` diffs/deploys only the image stack, builds missing immutable releases and pushes to ECR. `deploy` checks the selected AWS AMI/account/region and server parameters, then runs a fresh diff and deploy. Explicit ECS deploy/publish commands run CDK without an interactive approval prompt after their fresh diff, allowing unattended recreation of the selected stack. Review the source and diff before launching; the legacy deployment helper keeps its existing approval behavior. ECS does not use legacy SSH runtime commands.

`verify` uses SSM to compare runtime configuration hashes, separate EIP egress and metadata isolation. `test` requires the native VPN to be disconnected: nesting the AWG probe through Xray can prevent UDP handshakes and is not a valid direct-path comparison. It creates protected profiles and disposable Docker clients that perform real encrypted HTTPS requests through both protocols without changing laptop routes. Local Docker must have the published images (the publishing machine already does). Tests do not establish native macOS/iOS import, practical browsing, DNS-leak or IPv6 behavior.

`profiles` writes native configs, links and QR files under `.local/recovery/stockholm-ecs-clients/`. It renders live endpoint addresses over the preserved device identities; imported Parameter Store source profiles can still contain historical addresses. Use these generated exports for clients instead of importing raw parameter values. Keep the catalog's retired `stockholm` recipe and protected source files because `credentialSource` still uses that identity. Keep all derived files private.

`stop` sets both service counts to zero, waits for drain and stops the exact CloudFormation-owned host. `start` starts that host, waits for EC2 health, restores both counts to one and waits for ECS stability. Disk/EIPs remain billable; no autoscaler restarts the host. Temporary desired-count changes are intentional service drift. Automatic idle expiry and a remote UI are not implemented.

`npm run park stockholm-ecs` removes endpoint compute/disk/networking but retains its two tracked EIPs. Redeploy restores from ECR/Parameter Store. `npm run destroy stockholm-ecs` releases its EIPs after deleting the selected endpoint. Images and regional credentials survive either operation; deleting those is separate. The 2026-09-12 lifecycle trial passed unattended parking/redeployment from both running and stopped states, plus stop/start with real protocol checks; see the launch evidence above. Do not destroy the image stack to save endpoint compute costs.

## Follow-up evaluations

1. **Graviton** changes CPU architecture and potentially price/performance. Verify both upstream binaries/images support arm64, then compare throughput and CPU on AL2023. It is independent of the host OS choice.
2. **Bottlerocket** changes host management/immutability. Evaluate whether this custom bridge/SNAT policy can be expressed cleanly with its supported host/bootstrap mechanisms. It can also run on Graviton; these are separate choices.
3. **One public IP** can technically host TCP 443 for Xray and UDP 443 for AWG without a port collision. It saves one EIP charge and removes protocol-specific SNAT complexity, but loses address separation: an IP block affects both protocols.
4. **One container** can run both engines, but couples release, restart, health checks and privileges; Xray would share AWG's NET_ADMIN boundary. It does not inherently reduce EC2 cost. Two containers in one ECS task are another packaging option, with shared task lifecycle but separate processes/container privileges. Keep the proven separate-task baseline until these tradeoffs are measured.
5. Ubuntu is a fallback only if Amazon Linux cannot support the workload. Do not make switching distributions, HA or automatic failover prerequisites.

## Primary references

- [AWS ECS-optimized images](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html): stock host components, x86/ARM variants and release parameters.
- [ECS EC2 task parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters_ec2.html): bridge capabilities/devices, tmpfs, DNS and logging settings.
- [ECS port mapping API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html): no per-port host IP binding field.
- [Docker iptables behavior](https://docs.docker.com/engine/network/firewall-iptables/): DOCKER-USER ordering and original-destination matching after DNAT.
- [Container-instance deregistration](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deregister_container_instance.html): running agents deregister on termination; stopped/disconnected hosts require explicit removal.
- [ECS Parameter Store injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html): task-start injection, execution-role permissions and restart requirements after updates.
