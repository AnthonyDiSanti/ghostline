# Bottlerocket platform

Every regional gateway uses AWS's official ECS-3 ARM64 Bottlerocket image. The ECS agent and restricted SSM control container are part of the supported OS integration. `infra/deployment.json` selects each regional AMI; `infra/platform-inputs.json` records the qualified OS version, platform-image digest and source hash. Preflight requires the exact AWS-owned image/version. This is separate from the three-image application release document and its production/MRU aliases.

## Images, ownership and updates

`GhostlinePlatform` owns immutable, encrypted, scan-on-push `ghostline/platform/host` in each active region. It is retained independently of endpoint park/destroy. Bootstrap, diagnostics and the ECS network daemon use the same explicitly selected local digest. No remote publication region is required at host startup. Tags use the common `Project`, `Environment` and `System=shared` convention.

From `infra/`:

```sh
npm run platform stockholm-ecs build
npm run platform cape-town seed eu-north-1 ghostline/platform/host
npm run platform cape-town check
```

`build` publishes a source-hash-tagged candidate and saves its metadata under ignored `.local/deployments/<target>/platform/candidate.json`. It changes neither committed selection nor running hosts. Qualify the candidate on an isolated gateway, review its digest/source hash in `platform-inputs.json`, then seed the selected bytes into each destination. Seeding copies OCI manifests, index children and layers without rebuilding or converting them. Do not select a candidate solely because it builds.

For an OS update, read AWS's `/aws/service/bottlerocket/aws-ecs-3/arm64/latest/image_id` and `image_version` public parameters in each destination, qualify the returned version with the selected platform image, then update the explicit catalog AMIs and `bottlerocketVersion`. Host updates use a fresh diff and retained-IP `park` followed by `ecs <target> unpark`, `verify` and `test`. Normal deploy/unpark reads the deployed CloudFormation template (JSON or YAML) and refuses changed settings on an existing host before making cloud changes; first park it to remove the old bootstrap state. This intentionally causes downtime. Application releases still use the normal release gate and do not rebuild the host.

The platform repository has no automatic tagged-image expiration: a host digest must remain pullable after a long park. Remove obsolete platform candidates only after checking deployed templates and the committed selection; application MRU retention does not cover platform artifacts. Automated platform garbage collection is a separate follow-up.

## Boot and runtime boundaries

1. Bottlerocket runs the finite, essential `ghostline` bootstrap on every boot. It prepares the native 2 MiB tmpfs, ownership/SELinux labels, capacity checks and an empty forwarding guard. Failure prevents workloads from starting.
2. ECS runs one network DAEMON task per host. Its only added capabilities are NET_ADMIN and NET_RAW; it has no host filesystem mounts, Docker socket, host PID access, devices, task IAM or secrets. Root is read-only, privilege escalation is disabled, seccomp applies and ordinary container SELinux policy enforces.
3. ECS runs the gateway task. Only its network-disabled initializer receives server parameters; both isolated engines wait for SUCCESS and mount their own RAM directories read-only.

The daemon continuously validates ECS introspection identities against kernel Docker port bindings. It maintains routing, protocol/EIP separation and five-second kernel forwarding leases. Ambiguous discovery, stalled or dead controllers close forwarding. ECS health checks replace a failed daemon. NET_RAW is required by the actual iptables IP-set matcher; a successful standalone ipset creation does not prove that NET_ADMIN alone suffices.

Bottlerocket's read-only verified OS and enforcing SELinux remain enabled. The admin container is disabled and ECS privileged containers are disallowed. AWS's GuardDuty host agent is enabled where supported; it is separate from Ghostline's network daemon and necessarily has privileged telemetry access. The ephemeral bootstrap and explicitly enabled diagnostic container have broader host access; the steady-state Ghostline daemon does not.

## Diagnostics and lifecycle

`ecs <target> verify` briefly enables the maintained diagnostic host container, verifies native ARM64, config hashes, private read-only tmpfs, engine/daemon confinement, cgroups and network isolation, then disables diagnostics and reads back the disabled admin/diagnostic state. Cleanup runs even when startup or verification fails. Credential comparisons and GuardDuty coverage waits happen after lockdown. Secret values never enter terminal output or agent context.

CloudFormation retains both EIP associations until the gateway and network-daemon services are deleted. This preserves the host agent’s internet connection while it acknowledges the final task stop; removing the IPs first can leave an empty-looking service stuck draining.

Stop scales down the gateway, drains the exact registered host, waits for its daemon to stop and then stops EC2. Start waits for host/agent health, reactivates placement, waits for a healthy daemon and starts a new gateway task. Park deletes both disks, compute and VPC resources, retaining the two tracked EIPs; unpark rebuilds using the same image selection and Parameter Store identities. See [lifecycle](deployment-lifecycle.md) and [isolated validation](bottlerocket-trial.md).

## AWS image publisher references

`infra/platform-publishers.json` scopes pulls to exact regional AWS accounts/repository names. It is image-publisher reference data, not cached GuardDuty availability. Live service/AZ discovery still selects whether telemetry, enrollment and agent-pull permission apply. An unknown publisher requires verifying the AWS source and extending the reference; do not widen IAM to arbitrary registries.

Sources: Bottlerocket's [official registry mapping](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/develop/sources/api/schnauzer/src/helpers/mod.rs), AWS's [GuardDuty agent accounts](https://docs.aws.amazon.com/guardduty/latest/ug/installing-gdu-security-agent-ec2-manually.html) and [Bottlerocket support requirements](https://docs.aws.amazon.com/guardduty/latest/ug/prereq-runtime-monitoring-ecs-ec2-bottlerocket-support.html). Recheck source identity when selecting a newer OS or enabling a new region. Runtime coverage must still reach HEALTHY when supported; an installed agent alone is insufficient.

CloudFormation can return processed templates as YAML even when CDK synthesized JSON. The lifecycle guard uses the [maintained YAML parser](https://eemeli.org/yaml/) and tests both serializations plus already-decoded objects; do not infer the response format from the deployment input.

A dependency-only change can appear in `cdk diff` while the change-set deployment reports no changes and leaves the old graph. After reviewing that diff, CDK's supported `deploy --method direct --force` persisted the correction in both live templates without changing hosts or tasks. Verify the deployed `DependsOn` entries and a clean final diff; command success alone is insufficient. [Direct stack updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-direct.html).
