# Bottlerocket platform

Every regional gateway uses AWS's official ECS-3 ARM64 Bottlerocket OS. The supported image includes the ECS agent and restricted SSM control container. Stockholm and Cape Town run the qualified split-image release on official 1.66.0. Their launch records and the [handoff](../.context/handoff.md) record observed identities and remaining upstream limitations.

## Images and ownership

The common pipeline builds, qualifies and publishes five images: bootstrap, network-daemon, gateway-config, Xray and AWG. `GhostlineRelease` owns their local `ghostline/prod/` repositories plus the non-runnable `releases` metadata repository. There is no independent helper release cadence. CDK owns static local `keep-production` references and native settings; publication owns their targets and the authoritative whole-stack document. [Release workflow](releases.md).

The finite bootstrap image contains host preparation and explicitly invoked diagnostics. The separate daemon image excludes Docker CLI, mount tools, diagnostic fixtures and bootstrap-only dependencies. They share pure guard/network primitives in source, not authority or lifecycle. A successful `infra/platform-qualification.json` binds reusable native evidence to exact platform runtime manifests and build inputs; local image checks remain mandatory for each build. **Fresh native qualification must record the accepted startup availability limitation described below; prior failure evidence is never relabeled as a successful rollout.**

## OS policy

New hosts use a launch template with `resolve:ssm:/aws/service/bottlerocket/aws-ecs-3/arm64/latest/image_id`. **EC2 resolves it for each new launch**, unlike a CloudFormation dynamic reference resolved during stack operations. Preflight reads the live official channel and validates Amazon ownership, available state, exact ECS-3 image name/version and ARM64. No regional AMI ID is embedded in the global release document or deployment catalog.

An existing host does not change AMI or OS simply because it reboots. Its native verified TUF updater stages an inactive partition and explicitly activates/reboots into it. `updates.version-lock=latest` keeps AWS rollout waves; it schedules nothing. Ordinary image publication never invokes the OS updater. From `infra/`:

```sh
npm run platform stockholm-ecs status
npm run platform stockholm-ecs update
npm run platform <qualification-target> qualify /absolute/path/to/qualified.json
```

`update` is an explicit operator action under the same regional lifecycle exclusion. It checks the native latest candidate against the qualified release compatibility set, stops gateway then daemon, stages the verified update, reboots once, observes the actual new OS/bootstrap/daemon and restores the gateway. A journal makes uncertain apply/reboot acknowledgements non-repeatable; failures require inspection/resumption. Qualify a newly offered incompatible OS on a disposable target first. Neither ignoring rollout waves nor automatic boot-time upgrades is selected. New-launch and native-update channels can differ: on September 26, the official AMI launched 1.66.0, while a successful native `latest` check on the disposable 1.65.0 host offered no newer candidate. The operator must treat that as no update, not bypass rollout policy. The trial returned to 1.66.0 through a separate latest-AMI cold rebuild; that is not evidence of a successful native upgrade.

Changes to native settings, storage layout, instance size or launch-template policy use a reviewed retained-IP park/unpark. A bootstrap **image-content** update uses the release controller's controlled reboot and does not replace EC2. A daemon-only update replaces its ECS task; an application-only update replaces the gateway task.

## Recovery and evidence limits

Unexpected native boot does not fetch a release document or wait for a perfect version match. Essential swap/capacity/private-RAM/quarantine checks still apply. Bootstrap records its successful digest, OS and current boot ID through a constrained nonsecret native API operation; observation failure does not block otherwise safe boot. The fixed read-only observer checks the current kernel boot ID and native settings, since ECS registration attributes can remain stale after reboot.

**Bottlerocket 1.65 and 1.66 did not fall back to a cached bootstrap image after an ECR 403.** Bounded Ireland fault tests verified the cached alias before denying only that host’s bootstrap-repository pulls, then observed essential bootstrap failure before ECS. Removing the test deny and explicitly rebooting restored the same host/endpoints on both versions. The 1.66 test also restored administrative lockdown before completion. Release-metadata tolerance is not an offline-image guarantee. Retain required artifacts and local copies, but do not make bootstrap optional or bypass verification for availability.

Ireland also passed signed TUF preparation, reboot before activation, cancellation, boot into 1.64.0 and normal-wave return to 1.65.0. The updater lock hid exact write progress, so this is not proof of a precise mid-write interruption. [Native updater](https://bottlerocket.dev/en/os/1.64.x/update/methods/in-place/), [bootstrap settings](https://bottlerocket.dev/en/os/1.64.x/api/settings/bootstrap-containers/); exact-version claims above come from live evidence, not older documentation alone.

The subsequent deployed-controller experiment passed application-only, daemon-only and combined changes, but one bootstrap-only transition failed in native host-containerd before our entrypoint ran: a parent filesystem snapshot was missing after successful pull/unpack. The controller issued one reboot, timed out and paused without retrying. One explicit diagnostic reboot recovered the same host; this is recovery evidence, not successful unattended rollout. A later controlled test reproduced the missing-parent failure with the selected client and server, then with Ireland's actual native overlayfs snapshotter. The standard containerd pull-and-unpack path survived the same forced GC. This is strong evidence for an upstream client-path defect, although the original boot's exact GC timing was not captured. The [supported-pattern audit](../.context/scratch/2026-09-22-coordinated-release/bootstrap-pattern-audit.md) found no invalid bootstrap setting explaining the failure; [core-kit issue #1059](https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059) reports the bounded evidence. Native `host-ctr` is OS software, so a Ghostline bootstrap image cannot repair it. Anthony accepted this startup availability limitation while pursuing [PR #1063](https://github.com/bottlerocket-os/bottlerocket-core-kit/pull/1063). Fresh exact-image/1.66 qualification, including the bounded recovery behavior below, preceded the September 26 production migration. An official repair must still pass native replay/recovery checks before its limitation is removed. See the [investigation and candidate source patch](../.context/scratch/2026-09-22-coordinated-release/native-bootstrap-failure.md).

## Temporary controlled-boot recovery

For core-kit #1059, an acknowledged release-triggered bootstrap reboot may receive one additional reboot after its 15-minute startup deadline. The exact instance must remain running under active lifecycle ownership, ECS must still be disconnected, and both services must remain drained. Its source OS must be explicitly accepted (currently 1.65.0 or 1.66.0) and the qualified release must carry the issue in `os.knownLimitations`. Unknown OS versions do not inherit this policy.

The controller persists allowance consumption before the effect, observes recovery with the existing minute continuation schedule, and uses hourly reconciliation as a backstop. Duplicate/newer notifications cannot reset an unresolved incident. Recovery failure or uncertain acknowledgement pauses and alerts; no further automatic reboot occurs. Unexpected reboots, task failures, missing metadata and an unavailable observer alone remain diagnostic events. Current safety prerequisites and image verification remain enforced.

This is a removable availability exception, not a general self-healing policy. Disable it for repaired hosts when the official fix is qualified; delete the temporary recovery code/policy after both production hosts adopt that repair. Normal boot failures then always require diagnosis.

## Boot and runtime boundaries

1. Bottlerocket runs the finite, essential `ghostline` bootstrap on every boot. It prepares the native 2 MiB tmpfs, ownership/SELinux labels, capacity checks and an empty forwarding guard. Failure prevents workloads from starting.
2. ECS runs one network DAEMON task per host. Its only added capabilities are NET_ADMIN and NET_RAW; it has no host filesystem mounts, Docker socket, host PID access, devices, task IAM or secrets. Root is read-only, privilege escalation is disabled, seccomp applies and ordinary container SELinux policy enforces.
3. ECS runs the gateway task. Only its network-disabled initializer receives server parameters; both isolated engines wait for SUCCESS and mount their own RAM directories read-only.

The daemon continuously validates ECS introspection identities against kernel Docker port bindings. It maintains routing, protocol/EIP separation and five-second kernel forwarding leases. Ambiguous discovery, stalled or dead controllers close forwarding. ECS health checks replace a failed daemon. NET_RAW is required by the actual iptables IP-set matcher; a successful standalone ipset creation does not prove that NET_ADMIN alone suffices.

Bottlerocket's read-only verified OS and enforcing SELinux remain enabled. The admin container is disabled and ECS privileged containers are disallowed. AWS's GuardDuty host agent is enabled where supported; it is separate from Ghostline's network daemon and necessarily has privileged telemetry access. The ephemeral bootstrap and explicitly enabled diagnostic container have broader host access; the steady-state Ghostline daemon does not.

## Diagnostics and lifecycle

`ecs <target> verify` briefly enables the maintained diagnostic host container, verifies native ARM64, config hashes, private read-only tmpfs, engine/daemon confinement, cgroups and network isolation, then disables diagnostics and reads back the disabled admin/diagnostic state. Cleanup runs even when startup or verification fails. Credential comparisons and GuardDuty coverage waits happen after lockdown. Secret values never enter terminal output or agent context.

CloudFormation retains both EIP associations until the gateway and network-daemon services are deleted. This preserves the host agent’s internet connection while it acknowledges the final task stop; removing the IPs first can leave an empty-looking service stuck draining.

Stop scales down the gateway, drains the exact registered host, waits for its daemon to stop and then stops EC2. Start waits for host/agent health, reactivates placement, waits for a healthy daemon and starts a new gateway task. Park deletes both disks, compute and VPC resources, retaining the two tracked EIPs; unpark rebuilds using the same image selection and Parameter Store identities. See [lifecycle](deployment-lifecycle.md) and [central qualification](bottlerocket-trial.md).

## AWS image publisher references

`infra/platform-publishers.json` scopes pulls to exact regional AWS accounts/repository names. It is image-publisher reference data, not cached GuardDuty availability. Live service/AZ discovery still selects whether telemetry, enrollment and agent-pull permission apply. An unknown publisher requires verifying the AWS source and extending the reference; do not widen IAM to arbitrary registries.

Sources: Bottlerocket's [official registry mapping](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/develop/sources/api/schnauzer/src/helpers/mod.rs), AWS's [GuardDuty agent accounts](https://docs.aws.amazon.com/guardduty/latest/ug/installing-gdu-security-agent-ec2-manually.html) and [Bottlerocket support requirements](https://docs.aws.amazon.com/guardduty/latest/ug/prereq-runtime-monitoring-ecs-ec2-bottlerocket-support.html). Recheck source identity when selecting a newer OS or enabling a new region. Runtime coverage must still reach HEALTHY when supported; an installed agent alone is insufficient.

CloudFormation can return processed templates as YAML even when CDK synthesized JSON. The lifecycle guard uses the [maintained YAML parser](https://eemeli.org/yaml/) and tests both serializations plus already-decoded objects; do not infer the response format from the deployment input.

A dependency-only change can appear in `cdk diff` while the change-set deployment reports no changes and leaves the old graph. After reviewing that diff, CDK's supported `deploy --method direct --force` persisted the correction in both live templates without changing hosts or tasks. Verify the deployed `DependsOn` entries and a clean final diff; command success alone is insufficient. [Direct stack updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-direct.html).
