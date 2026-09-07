# Architecture and runtime ownership

Read when changing an endpoint or deciding which system owns configuration. Scope and acceptance are in [product](product.md). Observed identifiers and runtime settings are in the [Frankfurt](launch.md) and [Cape Town](launch-cape-town.md) launch records.

## Initial shape

**One EC2 instance and one EIP per independently selected deployment.** Frankfurt (`eu-central-1`) remains intact alongside Cape Town (`af-south-1`). Anthony explicitly authorized this parallel comparison; see [region selection](region-selection.md).

```text
macOS / iOS off-the-shelf client
    -> endpoint Elastic IP, TCP 443
    -> EC2 host running Amnezia-managed Xray / VLESS / REALITY
    -> internet destination
```

Use one CDK stack for the instance, EIP, and basic networking: a small dedicated VPC, one public subnet in one Availability Zone, internet-gateway routing, and the necessary security group.

Use the explicitly selected regional target in the existing production AWS account. The committed deployment selects Ubuntu 24.04 x86_64, `t3.small`, and an encrypted 20 GiB gp3 root disk. Runtime versions and REALITY settings are owned by Amnezia and recorded during launch. The upstream proposal favors a small x86-64 host; compatibility takes priority over prematurely standardizing an image.

Expose the selected tunnel listener and the operator access Amnezia requires. Supply an operator source range for SSH at launch and adapt it as needed for travel. Do not add production peering or place this on an existing application host. No NAT Gateway, load balancer, private-subnet tiers, interface endpoint suite, HA placement, or account-wide governance stack is needed for this shape.

## Reference phase ownership

| Owner | Responsibility now |
| --- | --- |
| CDK | AWS resources, addressing, host launch inputs, necessary access, resource identifiers |
| Amnezia | Server installation, protocol configuration, containers, generated state, and management operations |
| Existing clients | Connection UX, device routes, DNS, IPv6 blocking and failure protection where supported |
| Anthony/operator | Launch actions, chosen secret storage, evaluating real connectivity |
| Repository | Infrastructure source; nonsecret launch observations and product/engineering decisions |

Amnezia is deliberately temporary as the server manager. Allow its normal installation and administration model for the experiment, including full-access management connections where needed. Prefer VPN-only device profiles when readily supported, but do not turn a custom credential-management layer or revocation audit into a prerequisite for first use.

Do not install a competing reconciler over Amnezia's containers. Recording a working configuration is useful; freezing that configuration into our own deploy system belongs after the reference result. CDK host recreation does not imply restoration of Amnezia runtime state.

## Configuration and secrets

Keep a small typed deployment configuration for nonsecret constants: region, instance selection, names/tags, and necessary operator inputs. AWS CLI profile/account selection is a launch input; do not inherit personal-assistant's deployment identity, region, resource names, or parameter paths.

Use LastPass for personal/admin credentials and recovery exports. Use Parameter Store SecureString for application-level secrets when Ghostline needs to store them independently; `/ghostline` is the proposed namespace. Do not force a Parameter Store integration into the Amnezia installer just to match the eventual architecture. Secret values never belong in committed profiles, CDK outputs, user data, screenshots, or launch notes. [Parameter Store documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html).

Save the essential material created during launch outside the EC2 host. Record only its purpose and storage location/reference in project notes, not the values. A full restore procedure and rebuild trial are deferred. The EIP has CloudFormation Retain policies; the root disk deletes with the host. A retained address alone does not preserve runtime identity. Removing the stack leaves an allocated, billable EIP until deliberately released.

## Cost allocation

Mirror personal-assistant's exact, case-sensitive billing dimensions. `infra/deployment.json` owns shared `globalTags`: `Project=ghostline` and `Environment=prod`. Apply these globally, default `System=shared` for networking, and override `System=xray` for the endpoint instance, root volume, EIP, security group and SSH key. Reserve `System` from global overrides. Set EC2 `PropagateTagsToVolumeOnCreation` explicitly so storage joins the same cost grouping.

The account's `Project`, `Environment` and `System` cost-allocation keys were already Active during launch; no account-wide billing changes were made. Consolidated Cost Explorer analysis can group by `Project` and `System`, optionally filtering `Environment=prod`. Billing ingestion lags resource creation; live resource tags are verified separately from cost records. No shared billing stack is deployed. Use Cost Explorer’s native Region dimension to compare exits while preserving the cross-project tag schema.

## From reference to deterministic deployment

Once the connection is useful, review the actual image/runtime versions, container launch settings, protocol configuration, required state, and client profile format. Use those observations to specify our own deployment. Reuse upstream software and understood product decisions, rather than reimplementing the protocol.

The later architecture should explicitly own reproducible container inputs, configuration, secret injection, runtime lifecycle, and appropriate host/runtime access controls. Move ownership once, then remove Amnezia server management rather than keeping two configuration owners. Off-the-shelf connection clients remain independent choices.

These later controls are not requirements for an initial Amnezia audit. If the first setup fails, prioritize diagnosing reachability and compatibility over completing the future architecture.

## Optional endpoint expansion

Cape Town and Frankfurt are independent selectable exits, not chained hops. A named configuration selects one stack per command; each target has separate local artifacts, SSH credentials and Amnezia runtime identity. Preserve Frankfurt during this trial. There is no shared control plane, peering, automatic failover or automatic lifecycle manager.

Future on-demand environments can reuse this deployment boundary. Before deleting one, decide whether to retain its address and preserve its runtime recovery material: stopping EC2 still bills storage/EIP, deleting this stack retains a billable EIP, and recreating a host requires runtime installation/restoration. Neither removing a catalog entry nor disabling a region tears down its resources. Automating those lifecycle decisions is deferred.

Keep shared-host source routing, orchestration, and Fargate addressing research deferred. Earlier discussion is preserved in the [historical PRD](archive/Private_Connectivity_Service_PRD_v0.3.md), but it is not an implementation backlog to execute automatically.
