# Product scope

Ghostline gives Anthony a usable private connection from Dubai for ordinary browsing and video under the filtering on his actual Wi-Fi/mobile networks. It is a personal PoC, with accepted downtime and manual debugging rather than an SLA.

## Selected scope

| Concern | Decision |
| --- | --- |
| Owner/devices | Anthony, macOS and iOS, including concurrent use |
| Exits | Stockholm primary; Cape Town backup |
| Deployment | AWS CDK/TypeScript; one AL2023 ARM64 host/shared ECS gateway task/two EIPs per region |
| Protocols | Xray / VLESS / REALITY TCP 443 and independently credentialed AmneziaWG UDP 443 |
| Clients | Off-the-shelf apps; manual protocol/exit selection |
| Credentials | Regional Parameter Store; separate server/device values; identity-preserving rebuilds |
| Recovery | Protected local copies and owner-mediated LastPass, with vault closeout deferred by Anthony |
| IPv6 | Block client IPv6 while using an IPv4 tunnel; validate actual client/network behavior |
| Cost | Explicit start/stop, retained-IP park and full endpoint release; keep IPs only when useful |

Use the adopted protocol behavior through Ghostline-owned deployment infrastructure. Amnezia remains an off-the-shelf client and source of protocol choices, not a server provisioning dependency. [Architecture](architecture.md) defines runtime ownership.

## Acceptance and privacy

Successful use means both devices connect, browse intended sites and use video normally on the networks available for testing. Record actual exit/HTTPS, reconnect, DNS/IPv6 and sleep/wake evidence separately. A running ECS task or passing synth does not prove these outcomes. Regional launch records own observed protocol/device checks; [Mac stability](mac-client-stability.md) owns the unresolved intermittent client problem.

Prefer full-device routing and available client failure protection. Best-effort mobile behavior is accepted. 4K is a desired workload, not a separate release gate. No sensitive browsing history, destination collection, DNS-query logs or traffic captures are required for acceptance.

Anthony prefers browsing without compulsory signup or disclosure of identity documents, biometrics or identity-linked verification credentials. He accepts testing nearer open-internet exits despite potential site-specific age checks; Cape Town is the slower fallback. [Region assessment](region-selection.md) owns that decision and its limits. A VPN does not guarantee exemption from destination policies.

Keep production-account controls intact. One host per exit, ordinary project separation and existing security controls are sufficient; no HA, rollback framework, custom client or elaborate segmentation is required. Do not silently make deferred hardening a launch prerequisite.

## Later work

Representative throughput/CPU-credit sizing, stable-release automation, optional Bottlerocket evaluation, stronger diagnostic controls and a performance-oriented protocol remain possible follow-ups. Add Windows/Android, independent guest access or phone-accessible launch/expiration only when selected. A third protocol needs explicit port/IP and resource design; shared task budgeting does not promise unlimited capacity.

There is no automatic protocol failover, public service, user portal, automatic credential rotation or expiration controller in the current scope.
