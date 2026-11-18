# Regional release trials

Trials run infrastructure experiments on one chosen maintained region through the common ECS blue-green machinery. They can deploy the selected qualified production release or an independently pinned native-qualification candidate. No candidate power lifecycle, provisioner or rollback engine is added. Current native acceptance belongs in the handoff; implementation alone is not a qualification claim.

## Independently pinned native candidate

Run the complete local seven-image gate with a qualification output, then stage those exact bytes. From `infra/`:

```sh
GHOSTLINE_QUALIFIED_OUTPUT=/absolute/path/qualified.json npm run test:ecs-images
npm run trial stockholm-ecs stage /absolute/path/qualified.json
npm run trial stockholm-ecs begin sha256:CANDIDATE_DIGEST
npm run trial stockholm-ecs status
npm run trial stockholm-ecs deploy
# Run native persistence, isolation, protocol and recovery acceptance.
npm run trial stockholm-ecs return
# Verify the restored baseline and administrative lockdown.
npm run trial stockholm-ecs finish
```

`stage` validates the current source-bound local qualification, publishes immutable image tags and a separate OCI candidate artifact in existing regional repositories. It changes no production/MRU aliases or selector. The candidate binds its owner, exact images, accepted baseline OS and executable deployment-source digest. Its distinct media type cannot pass production release parsing and does not assert native qualification. Replication may copy immutable bytes to other regions without selecting them.

`begin <digest>` requires a settled healthy production baseline. Under the existing lifecycle claim it captures that generation, release digest, original automation mode, installed endpoint/release templates and parameters, and exact host-template URLs. Templates are checksummed assets in the owned regional release bucket; secret/masked CloudFormation parameters are rejected. It installs a durable regional exclusion before deploying candidate-aware release support in manual mode. Controller IAM allows only the exact current and captured host templates in this account/region.

`deploy` rejects executable source drift after staging, selects exact candidate digests in this region only, runs a fresh CDK diff and deploys the common endpoint recipe. Green host preparation, native hooks, direct EIP handoff, bake and source retirement keep their normal ownership. Task IAM/environment changes are part of the candidate recipe. Successful deployment moves the trial to `testing`; acceptance and qualification remain separate.

`return` selects the captured production release and host templates, and restores the captured endpoint recipe through a fresh reviewed CloudFormation change set within the same blue-green lifecycle. This preserves the baseline's task/environment/IAM interface even if candidate source changed it. Return diffs may touch only gateway task/service/IAM resources; networking/EIP changes are rejected. Returning remains available after source edits. An old secret-env baseline will intentionally reintroduce its credential persistence; this is an experimental return, not remediation adoption.

`finish` requires a verified returned generation and an unchanged coherent production selector. It restores the exact captured release-support template and original automation mode, verifies them, archives the trial, then conditionally removes the marker. If production intent changed elsewhere, retain exclusion and reconcile explicitly. If native rollback already restored the captured recipe, return verifies that state, reviews a no-op change set and retires the cleaned failed rollout without another task update. Interrupted operations retain their receipt/marker; resume the same command. A held native failure uses existing diagnosis, rollback and explicit `release cleanup-failed` before return. Never delete a marker or steal a lifecycle claim to bypass a failure.

## Production canary

The existing canary flow is retained: set the region's release mode to `manual`, then use `begin` without a candidate digest, `deploy`, acceptance checks and `finish`. It deploys the coherent selected production release and leaves manual mode in place. Restore the intended fleet modes through normal release tooling after acceptance. This mode needs no second selector and does not permit an unqualified release to become production intent.

## Operational boundary

Regional `trial/current` in the existing state table is authoritative and has no expiry. Lifecycle admission reads it before a conditional claim, so a racing trial writer invalidates stale admission.

- Ordinary deploy/start/stop/park/unpark/destroy, release infrastructure/mode changes, DERP provisioning and image retention defer the trial region. A deferred CLI exits with status 3; fleet cleanup continues other regions.
- Explicit checked trial operations and native hooks/recovery remain available. Candidate selection applies only to the owning account/region/endpoint and permitted phase. Prepared trials cannot implicitly deploy.
- Other regions continue their installed generation and normal production selector. No global aliases or shared security controls are changed by candidate selection.
- Finish before deliberate production power operations. Qualification must separately exercise normal task/reboot/replacement behavior; local image checks do not prove native behavior.

## Artifact and retention ownership

Ordinary release documents own qualified root/ARM64 digests and OS; schema v5 has seven runnable artifacts. Publication owns production/MRU aliases and replication; CDK owns the recipe. Native-pending candidate artifacts are distinct from qualified releases. They are temporary trial inputs, never per-region production fallback pins. Regional destructive cleanup is excluded during the active trial. Captured baseline assets and journal history retain useful release evidence after closeout.

See [releases](releases.md) and [platform qualification](bottlerocket-trial.md).
