# Regional image releases

Image qualification happens once in `images:build`. Publication consumes those exact approved artifacts; regional delivery never rebuilds or repeats protocol tests. CDK owns the gateway task definition and its three static local `:keep-production` references. Image releases move registry aliases and request an ECS deployment without registering or selecting task definitions.

## Ownership and topology

`deployment.json.imagePublication` persists `primaryRegion`, `disasterRecoveryRegion`, `subscribers` and `automation`. Defaults are Northern Virginia (`us-east-1`) and London (`eu-west-2`); explicit overrides survive activation. Publisher locations are independent of gateway locations. Each publisher replicates directly to every subscriber and its peer, excluding itself. Use one publication origin per promotion; DR selection is an explicit operator action.

Each participating region has three repositories named `ghostline/prod/{xray,awg,gateway-config}` in `GhostlineRelease`. Gateway regions also have a deployment gate, an on-demand DynamoDB attempt table, hourly/event triggers, diagnostics and SNS alerts. Publisher-only regions have no gateway host or gate. `GhostlineReleaseAssets` owns the private S3 bucket needed for regional Lambda ZIPs; CLI credentials perform deployment, without additional privileged deployment roles. Cost tags retain `Project`, `Environment` and resource-owned `System`.

The replication API replaces a registry-wide document. The operator reconciler replaces only the exact `ghostline/prod/` filter and preserves other filters/rules. Unavailable publishers remain pending; their absence never removes intended subscribers. ECR does not backfill old images when a destination is added, replicate deletes, or forward replicated arrivals for a second hop. Activation explicitly copies current production and retained history from a healthy publisher. [AWS replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html).

## Release identity and retention

A small OCI artifact in `gateway-config` holds schema version, promotion ID/time, origin, Linux ARM64 platform, all three repository/manifest digests, runtime child digests where needed, immutable build tags and up to three prior release-document digests. The JSON document is an OCI layer and is duplicated in the manifest's `io.ghostline.release` annotation. The gate validates that annotation against the layer's SHA256/size using manifest-read authority alone. ECR requires a nonempty layer list, even for non-runnable artifacts. It has no OCI subject: reusing one initializer must not tie all release-document lifetimes to that image.

| Tag | Meaning |
| --- | --- |
| `keep-production` | Intended runnable image in each repository |
| `keep-production-release` | Intended release document in `gateway-config` |
| `keep-mru-1`, `keep-mru-2`, `keep-mru-3` | Images of the three prior distinct app releases |
| `keep-mru-N-release` | Each corresponding release document |
| `sha-…`, `release-<promotion-id>` | Immutable artifact/publication identities |
| `keep-publishing`, `keep-publishing-release` | Temporary protection while a publication rotates aliases |

History is app-level promotion history. A regional failure or rollback does not reorder it. Unchanged publication is a no-op; promoting older images removes their duplicate from history. The publisher checks artifact identity, rotates complete sets oldest-first, and moves the production document selector last. Interrupted rotation resumes from its immutable document.

The fixed retention window is **production plus three prior releases**, including every release document. Anthony explicitly chose not to preserve additional regional rollback sets. A gateway still running outside that window produces an alert; its old cold-recovery/rollback bytes can expire and require debugging or a corrected promotion. No regional MRU or hidden fallback pins exist.

Every exact keep alias has a higher-priority count-one lifecycle rule. Since a tag selects at most one manifest, that rule protects its target from the lower-priority seven-day rule. That final rule expires all unprotected artifacts, including obsolete immutable-tagged versions and untagged leftovers, using original push age. It is not seven days since the alias was removed. Native lifecycle deletion is asynchronous. [ECR lifecycle semantics](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html).

Native replication can leave a temporary publication alias at a destination because tag deletion does not replicate. It normally points to the same retained production set; operator reconciliation must clear completed/stale publication protection after verifying its replacement. The gate has no registry-write authority.

## Regional gate and recovery

ECR events and an hourly schedule invoke one regional Lambda with reserved concurrency one. Events are wakeups: the gate reads current local intent instead of replaying an event's historical image selection. It checks all production aliases and expected local digests, including ARM64 children, and reads the ECS service state. Observed ECS identities may be the captured index or its validated ARM64 child; both map to the same expected artifact. Missing/stopped services, partial delivery, in-progress deployments and already-running sets do not trigger turnover. ECR notifications are best-effort; the schedule repairs missed wakeups, not failed image replication. [Delivery guarantee](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-ecr.html).

A conditional attempt record prevents duplicate deployment requests. Immediately before the write, the gate rechecks service state and all aliases. Its ECS request contains only `cluster`, `service` and `forceNewDeployment: true`. Failed or ambiguous attempts pause and alert until explicit retry or a newer ready release; failure state survives service recreation. An older ambiguous attempt does not block a newer release, but an actual ECS rollout still has to finish. Start/deploy preflight rejects an incomplete or locally unresolved production intent.

The role cannot register task definitions, push/retag images, read application secrets, write CloudFormation or pass roles. `UpdateService` is scoped to the exact service. AWS IAM does not provide a complete force-only field restriction for this action; the exact request shape is enforced in code and regression tests. Task-definition registration/selection events are alert-worthy infrastructure changes. The regional stack owns a write-management CloudTrail trail because default Event history alone does not feed these EventBridge rules. It records regional management writes in a private encrypted S3 bucket with seven-day expiry, file validation, no global-service/data/Insights events and no CloudWatch Logs copy. AWS cannot restrict a trail’s management events to ECS alone. Existing account trails are untouched; future shared-trail adoption should remove this duplicate only after verifying equivalent coverage. [EventBridge prerequisite](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html).

The brief race between final alias validation and ECS digest capture is explicitly accepted. Each container enables image version consistency; this preserves captured digests for that deployment, without making three repository tags transactional. [ECS digest resolution](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html).

Native ECS circuit-breaker rollback is enabled. The one-host service keeps minimum healthy zero / maximum 100 because fixed ports prohibit overlapping gateway tasks. ECS rolls back to its most recent completed regional service revision's whole image set; it does **not** walk MRU1 → MRU2 → MRU3. It does not rewind ECR tags. If rollback fails or no completed target exists, alert and correct the deployment manually. The current task has no configured container health checks, so the circuit breaker mainly covers startup failures, not protocol/browsing qualification. Image rollback does not version Parameter Store values. [Circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).

## Operator workflow

From `infra/`:

```sh
npm run images:build
npm run release publish primary
npm run release status
npm run release reconcile stockholm-ecs
npm run release retry stockholm-ecs
```

`images:build` records exact tested local image IDs in ignored `.local/deployments/image-builds/qualified.json`. `publish primary` or `publish dr` pushes those IDs and verifies registry manifest/config identity without testing or rebuilding. Missing local qualified artifacts require a new central build, not a regional rebuild. To explicitly promote a retained release, supply its document digest: `npm run release publish dr sha256:<document-digest>`. This creates a new promotion and history; native ECS rollback alone never publishes one.

`release status [target]` shows nonsecret intent, readiness, actual running digests and attempt state. `reconcile <target>` reconciles publisher membership and invokes the regional gate. `retry <target>` explicitly clears the current failed/ambiguous attempt only when no deployment is in progress, then invokes the gate. It never starts a stopped endpoint; follow with the normal `ecs <target> start` if needed.

For a new catalog target, first provision `/ghostline/prod/alerts/email` as a regional SecureString containing the recipient address, then run `release activate <target>`. This prepares durable regional resources, enrolls replication and seeds existing release history. On a brand-new installation, publish the first qualified set before deploying the gateway. Email subscriptions need confirmation for each topic, even when the same address is confirmed elsewhere; check Spam for the Amazon SNS subscription messages if they are not in the inbox. `PendingConfirmation` means delivery is not enabled. Addresses stay out of templates/logs. The reusable package under `infra/packages/notifications` has no personal-assistant runtime dependency.

Stop/park preserve subscription and durable image infrastructure. Start resolves the ready local production set on resume. Destroy releases endpoint resources/EIPs while retaining images, release state and parameters. `release retire <target>` removes subscription only after the endpoint is absent; repository deletion remains an explicit operation. Gate/registry persistence is separate from future idle-expiration features.

Fresh infrastructure diffs precede deployment. Ordinary releases require no CDK update and can roll out independently in each region. Automation may be held disabled in the profile while seeding or migrating, then enabled by redeploying the durable stacks. Publication-region outages do not affect running tasks or cold starts whose complete release already exists locally.
