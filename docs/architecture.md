# Architecture and runtime ownership

Read when implementing the first endpoint or deciding which system owns configuration. Scope and acceptance are in [product](product.md). All infrastructure below is intended, not deployed.

## Initial shape

**One EC2 instance and one EIP in Frankfurt (`eu-central-1`).** This is the confirmed PoC deployment scope.

```text
macOS / iOS off-the-shelf client
    -> endpoint Elastic IP, TCP 443
    -> EC2 host running Amnezia-managed Xray / VLESS / REALITY
    -> internet destination
```

Use one CDK stack for the instance, EIP, and basic networking: a small dedicated VPC, one public subnet in one Availability Zone, internet-gateway routing, and the necessary security group.

Use Frankfurt (`eu-central-1`) in the existing production AWS account. Choose the supported Linux image, instance size/architecture, exact runtime versions, and REALITY settings during implementation using the then-current installer requirements. The upstream proposal favors a small x86-64 host; compatibility takes priority over prematurely standardizing an image.

Expose the selected tunnel listener and the operator access Amnezia requires. Supply an operator source range for SSH at launch and adapt it as needed for travel. Do not add production peering or place this on an existing application host. No NAT Gateway, load balancer, private-subnet tiers, interface endpoint suite, HA placement, or account-wide governance stack is needed for this shape.

## Reference phase ownership

| Owner | Responsibility now |
| --- | --- |
| CDK | AWS resources, addressing, host launch inputs, necessary access, resource identifiers |
| Amnezia | Server installation, protocol configuration, containers, generated state, and management operations |
| Existing clients | Connection UX, device routes, DNS, IPv6 blocking and failure protection where supported |
| Anthony/operator | Launch actions, chosen secret storage, evaluating real connectivity |
| Repository | Infrastructure source once built; nonsecret launch observations and product/engineering decisions |

Amnezia is deliberately temporary as the server manager. Allow its normal installation and administration model for the experiment, including full-access management connections where needed. Prefer VPN-only device profiles when readily supported, but do not turn a custom credential-management layer or revocation audit into a prerequisite for first use.

Do not install a competing reconciler over Amnezia's containers. Recording a working configuration is useful; freezing that configuration into our own deploy system belongs after the reference result. CDK host recreation does not imply restoration of Amnezia runtime state.

## Configuration and secrets

Keep a small typed deployment configuration for nonsecret constants: region, instance selection, names/tags, and necessary operator inputs. AWS CLI profile/account selection is a launch input; do not inherit personal-assistant's deployment identity, region, resource names, or parameter paths.

Use LastPass for personal/admin credentials and recovery exports. Use Parameter Store SecureString for application-level secrets when Ghostline needs to store them independently; `/ghostline` is the proposed namespace. Do not force a Parameter Store integration into the Amnezia installer just to match the eventual architecture. Secret values never belong in committed profiles, CDK outputs, user data, screenshots, or launch notes. [Parameter Store documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html).

Save the essential material created during launch outside the EC2 host. Record only its purpose and storage location/reference in project notes, not the values. A full restore procedure and rebuild trial are deferred. Choose EIP retention behavior deliberately when implementing the stack; a retained address alone does not preserve runtime identity.

## From reference to deterministic deployment

Once the connection is useful, review the actual image/runtime versions, container launch settings, protocol configuration, required state, and client profile format. Use those observations to specify our own deployment. Reuse upstream software and understood product decisions, rather than reimplementing the protocol.

The later architecture should explicitly own reproducible container inputs, configuration, secret injection, runtime lifecycle, and appropriate host/runtime access controls. Move ownership once, then remove Amnezia server management rather than keeping two configuration owners. Off-the-shelf connection clients remain independent choices.

These later controls are not requirements for an initial Amnezia audit. If the first setup fails, prioritize diagnosing reachability and compatibility over completing the future architecture.

## Optional endpoint expansion

A second endpoint is an alternative path, not a chained hop. Initially, another host and EIP is a simple option; select another protocol only to address an observed issue or useful comparison. No cross-AZ/provider/region diversity requirement is implied.

Keep shared-host source routing, orchestration, and Fargate addressing research deferred. Earlier discussion is preserved in the [historical PRD](archive/Private_Connectivity_Service_PRD_v0.3.md), but it is not an implementation backlog to execute automatically.
