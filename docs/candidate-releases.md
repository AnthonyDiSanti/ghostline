# Regional release trials

The maintained trial tooling coordinates a bounded canary deployment through the normal production release and ECS blue-green machinery. It supplies a shared regional exclusion during the test window. It does not introduce candidate start/stop/park/unpark or another desired-state selector.

The owner authorized DERP integration and the running-fleet rollout on November 17, 2026. For this migration, qualify the new seven-image contract in an isolated common-stack deployment, hold maintained controllers in their existing `manual` mode, publish the qualified production set, then deploy and accept Stockholm before advancing the other running regions. Other gateways keep their current generation during the canary; Cape Town stays parked. Restore the captured automation modes after acceptance.

## Operator flow

From `infra/`, after selecting the qualified production release and setting the target's existing release mode to `manual`:

```sh
npm run trial stockholm-ecs begin
npm run trial stockholm-ecs status
npm run trial stockholm-ecs deploy
# Run the protocol, security and endpoint-continuity acceptance checks.
npm run trial stockholm-ecs finish
```

`begin` requires an already-running, settled gateway, a complete production selection and manual mode. It records the baseline generation, selected release and trial identity under the existing regional lifecycle CAS. `deploy` invokes the ordinary ECS deployment command with that trial identity and checks that the resulting whole image set matches the selected release. Fresh template diffs, native ECS hooks, EIP handoff, bake and rollback retain their existing ownership.

`finish` requires the same selected production release, manual mode and a matching observed generation. It archives the trial metadata and removes the exclusion conditionally. It leaves manual mode in place; restoring the fleet's captured automation settings is an explicit release operation after acceptance. If selection changes or deployment fails, inspect and reconcile actual state before finishing. Do not delete the marker to bypass a failed check.

This is a production canary. An unselected, independently pinned candidate with a separate deploy/return plan is not implemented. Immutable bytes may replicate without selection, but the trial command does not provide an alternative image-resolution path. Add that capability only when a concrete test requires it; the current fleet migration does not.

## Operational boundary

The authoritative exclusion is regional `trial/current` in the existing state table. It has no time-based unlock. A lifecycle admission check reads it after reading the lifecycle version and before the conditional claim write, so installing a racing marker invalidates the claim's CAS.

- Ordinary deploy, start, stop, park, unpark, destroy, release infrastructure/mode changes, DERP provisioning and image-retention operations defer that region while a trial is active.
- The matching trial runner may perform its normal deployment and release-support work. Native hooks and already-deployed container/task recovery retain their existing behavior.
- A deferred CLI reports the trial and exits with status 3. Regional publication cleanup reports the deferral and continues other regions.
- Interruption retains the marker and manual mode. Status exposes the baseline and selected release; existing native rollback and explicit failed-generation cleanup remain the recovery tools.

Finish the trial before deliberate power changes. There is no candidate reconstruction branch in production power jobs. Once the new protocol is adopted, its ordinary production start/stop/park/unpark behavior must pass the same acceptance as the existing engines.

## Artifact and retention ownership

The ordinary whole-stack release document owns exact executable root/ARM64 digests and qualified OS. Schema v5 includes DERP as the seventh runnable artifact; retained v2/v3/v4 documents remain strictly validated. Publication owns production/MRU aliases and normal replication. CDK owns the static local references and complete task/network/host recipe.

Existing retention protects selected history and observed running/rollback dependencies. The trial exclusion defers regional destructive cleanup throughout the test window. No separate candidate repository, expiry policy, publisher, provisioner or rollback engine is introduced.

See [releases](releases.md) for publication and recovery, and [DERP qualification](derp-poc.md) for this migration's gates. Source/package checks do not establish native host or public-path acceptance.
