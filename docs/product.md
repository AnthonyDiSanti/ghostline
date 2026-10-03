# Product scope

Ghostline gives Anthony a usable private connection from Dubai for ordinary browsing and video under the filtering on his actual Wi-Fi/mobile networks. It is a functioning personal connectivity product. This release ends the experimental product phase; public-source release preparation remains separate work. Brief deployment downtime and owner-led debugging remain accepted, with no SLA.

## Selected scope

| Concern | Decision |
| --- | --- |
| Owner/devices | Anthony, macOS and iOS, including concurrent use |
| Exits | Stockholm primary; Cape Town backup |
| Deployment | AWS CDK/TypeScript; one Bottlerocket ARM64 host/shared ECS gateway task/restricted network daemon/two EIPs per region |
| Protocols | Xray / VLESS / REALITY TCP 443 and independently credentialed AmneziaWG UDP 443 |
| Clients | Off-the-shelf apps; manual protocol/exit selection |
| Credentials | Regional Parameter Store; separate server/device values; identity-preserving rebuilds |
| Recovery | Regional Parameter Store and on-demand profile exports; accept new identities/device re-enrolment after total credential loss, without dedicated backups or LastPass integration |
| IPv6 | Block client IPv6 while using an IPv4 tunnel; validate actual client/network behavior |
| Cost | Explicit start/stop, retained-IP park and full endpoint release; keep IPs only when useful |

Use the adopted protocol behavior through Ghostline-owned deployment infrastructure. Amnezia remains an off-the-shelf client and source of protocol choices, not a server provisioning dependency. [Architecture](architecture.md) defines runtime ownership.

## Acceptance and privacy

Successful use means both devices connect, browse intended sites and use video normally on the networks available for testing. Record actual exit/HTTPS, reconnect, DNS/IPv6 and sleep/wake evidence separately. A running ECS task or passing synth does not prove these outcomes. Regional launch records own observed protocol/device checks; [Mac stability](mac-client-stability.md) records the historical Amnezia failure and subsequent OneXraySE acceptance.

September 28 owner acceptance: video is serviceable after substantial practical use; OneXraySE sleep/wake and IPv4/DNS privacy checks pass. Native Chrome WebRTC checks through OneXraySE/Stockholm subsequently passed; IPv6 blocking remains unproven without a working direct IPv6 baseline. Anthony closes current-network performance/privacy testing with these evidence limits. Revisit testing from a new location alongside protocol work; no further cap diagnosis or IPv6 baseline is required for current acceptance. This owner feedback does not establish the cause of the measured throughput plateau.

Prefer full-device routing and available client failure protection. Best-effort mobile behavior is accepted. 4K is a desired workload, not a separate release gate. No sensitive browsing history, destination collection, DNS-query logs or traffic captures are required for acceptance.

GuardDuty is an additional protection layer: enable available capabilities, accept confirmed regional gaps (including complete service absence), and preserve enabled protection through teardown. Enabled GuardDuty is a separate security-telemetry boundary: AWS may receive process, network and DNS metadata through its host agent. This is not a zero-logging guarantee. See [scope and costs](guardduty.md#data-and-cost-boundary).

Anthony prefers browsing without compulsory signup or disclosure of identity documents, biometrics or identity-linked verification credentials. He accepts testing nearer open-internet exits despite potential site-specific age checks; Cape Town is the slower fallback. [Region assessment](region-selection.md) owns that decision and its limits. A VPN does not guarantee exemption from destination policies.

Keep production-account controls intact. One host per exit, ordinary project separation and existing security controls are sufficient; no HA, custom rollback framework, custom client or elaborate segmentation is required. Do not silently make deferred hardening a launch prerequisite.

## Later work

Representative throughput/CPU-credit sizing, blue-green deployment evaluation, stronger diagnostic controls and a performance-oriented protocol remain possible follow-ups. Stable-release automation is implemented; see [images](images.md). Add Windows/Android, independent guest access or phone-accessible launch/expiration only when selected. A third protocol needs explicit port/IP and resource design; shared task budgeting does not promise unlimited capacity.

There is no automatic protocol failover, public service, user portal, automatic credential rotation or expiration controller in the current scope.
