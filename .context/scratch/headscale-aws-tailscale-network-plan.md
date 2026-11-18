# Self-Hosted Tailscale Network — AWS + Headscale + UniFi UDM Pro

**Architecture summary and implementation plan**

**Prepared:** November 15, 2026

**Status:** Original standalone proposal; not deployed. The [selected Ghostline integration plan](../../docs/headscale.md) supersedes its ownership, sequence and immediate dual-stack requirements. The first implementation plan is the [Stockholm DERP PoC](../../docs/derp-poc.md). Retain as source context, not a competing deployment recipe.

## Objective

Build a private, self-managed, Tailscale-compatible WireGuard network that:

- Uses **Headscale** rather than Tailscale's hosted coordination service.
- Uses **self-hosted DERP/STUN infrastructure**, with no dependency on Tailscale's public DERP fleet.
- Supports **IPv4 and IPv6** throughout the AWS-facing infrastructure.
- Gives remote devices secure access to selected home VLANs through a **UniFi Dream Machine Pro (UDM Pro)**.
- Allows the UDM Pro to act as an optional **exit node** for internet traffic routed through home.
- Prioritizes straightforward recovery, isolation and explicit access control over unnecessary orchestration complexity.

## Architecture at a glance

```text
                              Internet
                 +------------------------------+
                 | Remote Mac / iPhone / other  |
                 | Tailscale client             |
                 +---------------+--------------+
                                 |
              coordination + DERP map |  TLS 443 (IPv4/IPv6)
                                 v
          +--------------------------------------------+
          | AWS: Headscale coordinator                 |
          | Single active instance, persistent SQLite  |
          | Public HTTPS DNS; backups + recovery       |
          +--------------------------------------------+
                  |                         |
                  | DERP map                | DERP client verification
                  v                         v
        +------------------+      +------------------+
        | DERP region 900  |      | DERP region 901  |
        | standalone derper|      | standalone derper|
        | AZ 1             |      | AZ 2             |
        | TCP 443 / UDP 3478      | TCP 443 / UDP 3478
        | IPv4 + IPv6      |      | IPv4 + IPv6      |
        +------------------+      +------------------+
                  ^                         ^
                  | fallback encrypted relaying
                  +------------+------------+
                               |
                    direct WireGuard preferred
                               |
                         +-----v-----+
                         | Home UDM  |
                         | Pro       |
                         +-----+-----+
                               |
                    Selected LANs and VLANs
```

**Data-path priority:** A direct WireGuard/UDP tunnel between the remote client and the UDM Pro is preferred. DERP transports encrypted discovery traffic and, when direct connectivity fails, relays encrypted tunnel packets. Headscale coordinates devices and distributes network information; it is not normally in the data path.

## Agreed design decisions

| Area | Decision |
| --- | --- |
| Coordination | Self-hosted **Headscale** on AWS |
| Coordination availability | **One active instance** with automated recovery and persistent state; do **not** put multiple active Headscale replicas behind a load balancer |
| Coordination database | **SQLite** on durable storage, with consistent backups and tested restore procedure |
| Relays | **Two standalone `derper` instances**, each advertised as an independent DERP region, ideally in distinct AWS Availability Zones |
| Relay authentication | **Fail closed** when DERP cannot contact Headscale to verify a client; never expose an intentionally open public relay |
| Relay independence | Disable Tailscale's default public DERP map once the self-hosted relays are tested |
| Networking | Dual-stack **IPv4 + IPv6**, including TLS ingress and STUN |
| Home VPN endpoint | **Tailscale client on UDM Pro** through the community-maintained `tailscale-unifi` installation |
| Home reachability | Advertise only the required home IPv4/IPv6 VLAN prefixes; enable optional exit-node functionality |
| Ingress | Prefer direct public IPs for standalone DERP. If Headscale is managed behind a load balancer, use **NLB TCP passthrough** rather than assuming ALB compatibility |

## AWS deployment

### Headscale coordinator

- Use a small Linux EC2 instance, or **one** ECS-on-EC2 task with an explicitly designed persistent-storage and recovery mechanism.
- Provide a stable hostname (example: `headscale.example.com`) and public HTTPS on TCP 443 over IPv4 and IPv6.
- Use TLS on the backend (for instance Let's Encrypt); an NLB with TCP passthrough can preserve Headscale's custom upgraded control connection.
- Store the SQLite database, Headscale keys and configuration on persistent storage, and back up the full state consistently. Safeguard private keys and encryption material.
- Protect administrative gRPC, metrics, SSH/SSM and other management surfaces; do not publicly expose them by default.
- Monitor health, registration errors, certificate expiry, backups and restore readiness.

**Why single-active?** Headscale is not an active-active clustered coordination service. Sharing a database across multiple live Headscale replicas does not synchronize all application state or active network-map connections. Existing direct WireGuard sessions can generally survive short coordinator interruptions, but registration, updates and other coordination operations may not.

**ECS-on-EC2 caveat:** ECS is fine for automatic process/task restarts, but **ECS service-managed EBS volumes are deleted when the task stops**. Do not treat them as durable Headscale state. Options include a persistent host-mounted EBS filesystem with controlled placement and recovery, or a simpler dedicated EC2 instance with managed EBS. Cross-instance/AZ recovery requires a deliberate state-recovery runbook. Do not assume ECS alone supplies HA.

### DERP/STUN relays

- Run **two independent standalone `derper` processes**, each with its own DERP region ID and hostname (`derp-a.example.com`, `derp-b.example.com`).
- Place them in separate AZs if feasible. Each should have stable, publicly reachable IPv4 and IPv6 addresses, or reliable DNS and corresponding DERP-map configuration.
- Publish both regions in the Headscale DERP map. Use **no** public Tailscale DERP regions after cutover.
- Expose **TCP 443** for DERP and **UDP 3478** for STUN, over both IP families. TCP 80 is optional where needed for HTTP-01 certificate issuance/renewal.
- Prefer independent single-node regions to placing multiple non-meshed DERP servers behind one load balancer; the client selects and fails over between regions.
- Use client verification through Headscale's `/verify` endpoint, with the explicit **fail-closed** setting:

```sh
# Illustrative standalone derper flags; add TLS/listener and other deployment flags.
-verify-client-url=https://headscale.example.com/verify \
-verify-client-url-fail-open=false
```

**Important availability consequence:** Fail-closed verification means **new DERP connections may be rejected if Headscale is unavailable**, even when DERP itself is healthy. Existing relayed sessions may remain connected, and existing direct WireGuard paths may remain usable, but the relay tier is **not independently available for new admissions** during a coordination outage. This is an intentional security choice.

**DNS and dual-stack:** Publish A and AAAA records. Ideally include accurate stable public `IPv4` and `IPv6` addresses for each DERP node in the distributed DERP map so clients can connect without relying exclusively on DNS. The embedded Headscale DERP `derp.server.ipv4/ipv6` settings apply to the *embedded* relay; standalone DERP nodes instead need their own entries in the custom map.

**ECS nuance:** DERP is comparatively stateless and can run in ECS, but each logical relay still needs stable endpoint identity (hostname, address, TLS, region ID). Plain task replacement with changing public addresses is not sufficient by itself. Small dedicated EC2 hosts may be simpler for two relays.

### Ingress and network rules

| Endpoint | Protocol/port | Internet-facing? | Notes |
| --- | --- | --- | --- |
| Headscale | TCP 443 | Yes, IPv4 + IPv6 | TLS and custom control-protocol upgrade |
| Standalone DERP A/B | TCP 443 | Yes, IPv4 + IPv6 | Encrypted packet relay |
| STUN A/B | UDP 3478 | Yes, IPv4 + IPv6 | NAT discovery |
| ACME HTTP-01, if used | TCP 80 | Conditional | Only if chosen TLS issuance method needs it |
| Headscale administrative gRPC | TCP 50443 (or configured) | **No** | Restrict to private/admin access |
| Metrics/debug endpoints | Configured port, often TCP 9090 | **No** | Internal monitoring only |
| UDM Pro | Outbound coordination/DERP traffic and WireGuard UDP | Primarily outbound | Optional carefully scoped inbound UDP rule may improve direct connectivity |

An AWS **dual-stack NLB** can be used for the Headscale HTTPS service, with TCP passthrough rather than an ALB application-level proxy. If routing STUN through a dual-stack NLB, note that AWS requires an **IPv6 target group for its UDP listener**. For standalone DERP, prefer stable direct endpoints and avoid load-balancing multiple unmeshed relay servers as though they were interchangeable HTTP backends.

## Home network: UDM Pro

Use the community project [SierraSoftworks/tailscale-unifi](https://github.com/SierraSoftworks/tailscale-unifi) to run the standard Tailscale daemon on the UDM Pro, pointing it at the Headscale URL.

Intended functions:

1. **Subnet router:** advertise selected LAN/VLAN CIDRs so authenticated remote nodes can access specific home devices and services.
2. **Exit node:** optionally route remote clients' default internet traffic through the home connection.
3. **Direct connectivity:** favor peer-to-peer WireGuard over DERP whenever feasible.

Illustrative configuration (replace domain and CIDRs with the actual values, and confirm your installed client/UniFi versions):

```sh
tailscale up \
  --login-server=https://headscale.example.com \
  --advertise-routes=10.42.10.0/24,10.42.20.0/24 \
  --advertise-exit-node
```

Approve the routes and exit-node advertisement in Headscale and apply restrictive access policies. Do **not** advertise all VLANs or a default route to all clients indiscriminately. Ensure no unintended IPv6 bypasses or policy gaps when enabling exit-node routing.

This installation is **not a native UniFi Network plugin**; it is community-maintained software on a critical gateway. Keep a separate local recovery/administrative path, record UniFi OS and Tailscale compatibility, and test upgrades before relying on the gateway remotely.

## IPv6 strategy

- Make the AWS VPC/subnets, security-group rules and public ingress **dual-stack**.
- Provide public IPv6 endpoints for Headscale and both DERP regions, with appropriate AAAA records.
- Tailscale/Headscale also support private **tailnet IPv6 addressing**, even when a client or the home ISP has only IPv4 internet transport.
- Native IPv6 transport can improve direct UDP reachability, subject to local IPv6 firewalls.
- Only advertise **home IPv6 LAN prefixes** if they exist and policy/firewall routing is configured for them; cloud dual-stack does not require home IPv6 to be enabled.
- Test IPv4-only, IPv6-only (where available), dual-stack and restricted-network clients.

## Security controls and recovery

- **Client verification is required** on every DERP server and explicitly set to **fail closed**.
- Set Headscale `derp.urls: []` so its default public Tailscale DERP map is not used; supply a custom two-region DERP map via `derp.paths` or a controlled DERP-map URL.
- Keep Headscale administration private; maintain least-privilege node/user access policies and scoped advertised routes.
- Use HTTPS/TLS, automated certificate renewal, patched images and locked-down AWS security groups for IPv4 *and* IPv6.
- Back up the Headscale SQLite database consistently and protect its private keys; test recovery onto a replacement instance rather than relying only on snapshots.
- Alert on coordinator failure, DERP verification failures, unexpected relay bandwidth/cost, relay availability and certificate expiry.
- Document expected degraded behavior: if Headscale is down, direct established tunnels may continue; new enrollments and **new fail-closed DERP admissions** may fail.

## Implementation sequence

1. **Provision AWS networking:** dual-stack VPC/subnets, DNS, security groups, instance roles/SSM and TLS issuance method.
2. **Deploy single-active Headscale:** SQLite + durable state, HTTPS, admin access restrictions and automated backups.
3. **Deploy one standalone DERP region:** direct dual-stack connectivity, STUN, custom DERP map, `/verify` authentication with `fail-open=false`.
4. **Deploy second DERP region:** independent hostname/IP, region ID and health checks; confirm selection/failover between regions.
5. **Disable public Tailscale DERP regions:** verify that only the two self-hosted regions appear in the Headscale-delivered map.
6. **Install Tailscale on UDM Pro:** register against Headscale, advertise selected VLAN routes and optional exit-node service; review access policies.
7. **Register remote devices:** macOS/iOS and any other needed clients; test split-tunnel subnet access and exit-node routing.
8. **Validate resilience:** restart Headscale, stop each DERP region in turn, simulate failed `/verify`, and confirm that **new connections are denied** under fail-closed conditions rather than silently admitted.
9. **Harden and monitor:** perform full restore rehearsal; measure direct-versus-relayed traffic and AWS egress costs.

Useful client diagnostics:

```sh
tailscale netcheck
tailscale debug derp-map
tailscale ping <udm-tailnet-hostname>
tailscale status
```

## Open implementation choices

These have **not** yet been fixed and should be selected when building infrastructure:

- **Headscale host:** dedicated EC2 (simpler) versus single-task ECS-on-EC2 (fits an existing ECS estate but adds durable-state/placement work).
- **DERP hosts:** small dedicated EC2 instances (simpler stable public endpoints) versus ECS tasks with explicitly managed endpoint identity.
- **AWS region(s):** `us-east-1` is a practical initial location near the US East Coast; a geographically different second DERP location may improve travel latency at the expense of cost/operations.
- **Headscale ingress:** direct dual-stack instance endpoint versus TCP-passthrough NLB.
- **Actual home IPv4/IPv6 VLAN CIDRs, DNS naming, Headscale ACLs, and whether to advertise an inbound UDP port on the UDM Pro.**
- **Recovery objective:** acceptable coordinator outage duration and backup frequency. The fail-closed DERP policy means this decision also affects new relay admissions.

## References

- [Headscale — Requirements and assumptions](https://headscale.net/stable/setup/requirements/)
- [Headscale — DERP](https://headscale.net/stable/ref/derp/)
- [Headscale — Configuration options](https://headscale.net/stable/ref/configuration-options/)
- [Headscale — FAQ/database recommendations](https://headscale.net/stable/about/faq/)
- [Headscale — Reverse proxy notes](https://headscale.net/stable/ref/integration/reverse-proxy/)
- [Tailscale — DERP servers](https://tailscale.com/docs/reference/derp-servers)
- [Tailscale — Standalone derper deployment notes](https://github.com/tailscale/tailscale/blob/main/cmd/derper/README.md)
- [UniFi community integration — tailscale-unifi](https://github.com/SierraSoftworks/tailscale-unifi)
- [AWS — ECS with EBS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ebs-volumes.html)
- [AWS — NLB listeners and dual-stack UDP targets](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html)
