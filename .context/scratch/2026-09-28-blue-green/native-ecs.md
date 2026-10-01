# Native headless ECS contract — September 28, 2026

## Passed in disposable Ireland

Two official ECS-3 ARM64 Bottlerocket 1.66.0 t4g.small hosts; a synthetic bridge service with fixed TCP/443; one independently placement-constrained host-network DAEMON service per slot. No inbound security-group rule, VPN credential, application secret, protocol qualification or production mutation. Shared CloudTrail/GuardDuty were observed rather than changed; the trial owned its telemetry endpoint and private asset bucket.

- Headless BLUE_GREEN API acceptance, healthy scale-up, PRE/POST_SCALE_UP, IN_PROGRESS/callback continuation, production traffic weights and a five-minute bake passed. Blue remained running during bake and was retired after success.
- Force deployment of the same task-definition revision produced a distinct service revision on the selected second host. Changing candidate attributes left the existing blue task running.
- Force deployment of slot-b's daemon replaced only that service/task; slot-a retained its exact task.
- A deliberate POST_PRODUCTION_TRAFFIC_SHIFT failure invoked PRODUCTION_TRAFFIC_SHIFT with green=0 / blue=100, then reached ROLLBACK_SUCCESSFUL. targetServiceRevisionArn continued to identify green. The original blue task survived; failed green's application task stopped.
- An explicit StopServiceDeployment(ROLLBACK) during bake also reached native rollback. The return hook reported IN_PROGRESS with a 60-second callback. Both tasks remained running while the callback was pending; green stopped after acknowledgement.

These establish the scheduler/hook contract, not Ghostline EIP transfers, daemon packet readiness, production migration or real tunnel recovery. Synthetic `true` health checks deliberately tested orchestration only. Full qualification must exercise the actual restricted daemon/bootstrap/application artifacts and interrupted two-address movement.

## Private evidence and cleanup

`.local/blue-green/` holds nonsecret baseline templates, final probe templates/resources, observations and hook payloads. Initial completed deployment `GyYNXmyA42wU4-NjDOtzJ`; hook-failed force `CybOqJb7wmEQnL9NtFiQr`; controller-requested rollback `vY1dC2hQOMs6BAq5GnbSa`. The synthetic provisioner is ignored evidence, not a second maintained regional recipe.

Both main and asset stacks are DELETE_COMPLETE. Independent EC2 readback shows both exact hosts terminated with no disk mappings; DescribeVolumes returned an empty regional list. No production resource or shared security setting was changed.

## Implementation implications

Persist deployment and both service-revision identities; validate callbacks against that record, and use explicit traffic weights for direction. Never infer rollback from targetServiceRevisionArn. Keep cross-stage state in the regional journal even if a particular callback appears to retain hookDetails. Observe authoritative deployment completion before host retirement.

Boot defaults must permit native recovery without waiting for the controller to restore an ephemeral ECS attribute. Intentional placement changes still occur under lifecycle exclusion; the existing occupied fixed host ports and explicit pre-cutover identity checks prevent treating scheduling as readiness. Cold daemon health is distinct from exact engine peer readiness.

A separate transient address stack can own the two temporary EIP allocations while they move between slots. Host removal first transitions to network-only, preserving its ENI/management bindings until daemon and instance deletion finish; then detach addresses and remove the ENI. No permanent extra pair is needed.

Sources: [AWS headless support](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/blue-green-deployment-implementation.html), [hook/rollback contract](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/lambda-lifecycle-hooks.html), [CloudFormation template URL restrictions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/control-access-with-iam.html), [import support](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-supported-resources.html). The latter supports retain/import migration of ECS services/tasks and EC2 resources; the subsequent retained/imported rehearsal and production migration are recorded in [migration evidence](migration.md).
