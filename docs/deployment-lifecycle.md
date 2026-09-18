# Regional lifecycle

One reusable ECS gateway recipe serves every configured region. An explicit target controls one endpoint stack and a separate durable image stack. The catalog allocates nothing by itself. [Development](development.md) lists commands; [secrets](secrets.md) defines durable identities.

| Operation | Compute | Root disk | Two EIPs | Images / parameters |
| --- | --- | --- | --- | --- |
| `ecs <target> stop` | Stopped, no running task | Retained | Retained | Retained |
| `ecs <target> start` | Same host; new task initialization | Reused | Reused | Reused |
| `park <target>` | Removed | Removed | Retained in stack | Retained |
| `ecs <target> deploy` after park | Fresh host/task | Fresh | Reused | Reused |
| `destroy <target>` | Removed | Removed | Explicitly released | Retained |

Stop waits for actual task termination before stopping EC2. Start waits for host health before restoring one desired task. Parking uses the same EIP logical identities; a later active deployment reuses them. Destroy journals exact allocations/stack ARN, waits for deletion and verifies ownership/attachment before release. These operations preserve protocol credentials.

A stopped host avoids compute charges but keeps disk and public-address charges. Parking removes the disk cost as well; retained addresses remain billable. Destroy removes the endpoint IP floor; ECR storage and any separately charged durable resources remain. Running costs include EC2, disk, public IPv4, egress and possible burstable CPU-credit charges. Do not infer a current regional price quote from an old estimate. [EC2 stop/start](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html), [AWS public IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

Use stop for a frequently reused exit, park when keeping known client addresses is worth their idle cost, and destroy for disposable regional experiments. Releasing addresses requires new profile endpoint exports after redeployment. The current client format uses literal IPv4; DNS-based persistent endpoints are not implemented.

## Replacement and validation

Publish images first, deploy, then run `verify` and real encrypted `test`. Host AMI/bootstrap changes use park/redeploy: the same ENI cannot be attached to two hosts simultaneously. Task-only releases do not require rebooting the host. IAM shutdown dependencies keep agent authority available while services/tasks drain.

New regions use AWS's regional recommended ECS ARM64 AMI, verified by Amazon publisher alias, architecture and image family. AWS publisher account IDs differ by region. Keep the chosen AMI explicit in the catalog. Both server/client parameters must exist before deployment; imports refuse identity conflicts.

Address adoption during an authorized migration uses a reviewed one-time [CloudFormation resource import](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-existing-stack.html). Retain and remove allocations from their former stack before importing them under the gateway's standard logical IDs. Resource identifiers come from `get-template-summary`; do not guess that the EIP's public address and allocation ID are interchangeable. Retain existing association resources as well before removing ownership, so the old host keeps serving during import. CloudFormation EIPAssociation creation does not replace an existing association: explicitly disassociate the retained old association at cutover before deploying the active gateway. This creates an outage while the new host starts. CloudFormation import cannot add outputs; add the standard outputs during the following normal deployment. Keep migration scripts/evidence outside the maintained deployment implementation; the resulting stack must use the common recipe without compatibility branches.

## Optional expiration follow-up

No automatic expiry controller exists. A future lifetime policy could be permanent, idle timeout or fixed expiry, with stop/park/release as the chosen action. Select CLI versus phone-accessible launch before building a controller. Normal VPN packets cannot wake a deleted or stopped host.

Authenticated presence is not equivalent to interface state or EC2 network bytes. AWG keepalives and quiet/sleeping clients need explicit semantics; public scans must not extend a lease. Store aggregate activity and reporter health, not browsing destinations. A controller would need durable operation generations, serialized changes and explicit stale-telemetry handling. These are backlog decisions, not a second deployment architecture.
