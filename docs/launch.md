# PoC launch evidence

Observed 2026-09-07. Infrastructure and the Amnezia XRay runtime are deployed. Native macOS tunnel/reconnect checks pass, and Anthony reported practical macOS browsing passed on 2026-09-07. Anthony also reported the iOS test passed. Video remains unconfirmed; a reported age-verification prompt creates an unresolved destination-privacy issue. This records launch activities, not a general operations manual.

## AWS deployment

| Item | Observed value |
| --- | --- |
| Identity | AWS CLI profile `personal`, account `757999402784` |
| Stack | `GhostlinePoc`, `eu-central-1` |
| Host | `i-0463a0a244a20c540`, `t3.small`, `eu-central-1a` |
| OS | Ubuntu 24.04.4 LTS, x86_64; AMI `ami-03f92a7a8a26c81af` |
| Storage | 20 GiB encrypted gp3, `vol-0b13c36f8a47f85f0`; deleted with host |
| Endpoint | `3.69.128.6`, allocation `eipalloc-050481061628f88c3`; retained independently |
| Access | TCP 443 public; SSH 22 from launch operator address `5.195.76.221/32` |
| Runtime AWS access | No instance profile or runtime IAM role |
| Billing | EC2, EBS and EIP verified: `Project=ghostline`, `Environment=prod`, `System=xray` |

Performed: verify AWS identity, Canonical AMI ownership/availability and AZ; generate a dedicated RSA4096 key; synthesize and review a fresh CDK diff; deploy with normal CDK interactive approval; verify live resources/tags. CloudFormation completed successfully. SSH host keys were retrieved through authenticated EC2 console output and pinned in `.local/known_hosts`; strict SSH succeeded. Cloud-init completed and passwordless sudo is available to `ubuntu`, as required by Amnezia. Amnezia subsequently installed the XRay runtime described below.

The stack uses existing CLI credentials and CDK's built-in `LegacyStackSynthesizer`. With no file/container assets and a small inline template, no Frankfurt `CDKToolkit`, new deployment role, S3 bucket, or ECR repository was necessary. Revisit synthesis when runtime assets enter CDK ownership.

## Local material

- Admin key: `.local/keys/ghostline-poc` (private, ignored), corresponding `.pub`; public fingerprint `SHA256:SMm4OSS9g/BEmGhU3RhhkKpGupawZVBTrAwWixzcAvA`.
- Recovery export: `.local/recovery/ghostline-poc.backup` (7,737 bytes). VPN-only iPhone profile for `Anthony iPhone`: `.local/recovery/ghostline-iphone.vpn` (1,257 bytes). Both are owner-readable only in a mode-700 directory. The `.vpn` was saved from Amnezia’s Copy export without printing its content.
- LastPass saves: **pending owner confirmation**. Anthony will intermediate vault activity; computer-use permission for LastPass was denied. Suggested items: `Ghostline PoC — SSH admin key`, `Ghostline PoC — Amnezia recovery`, `Ghostline PoC — iPhone connection`. Do not treat the local ignored copies as encrypted backup.
- Deployment outputs: `.local/outputs.json`; authenticated console output and known hosts also under `.local/`.
- No application secrets have been created in Parameter Store; none are needed for the reference installer yet.

## Client installation and pending trial

Downloaded [AmneziaVPN 5.0.1.5](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.1.5), the stable macOS package. SHA-256 `8e88c02605375400a7972ee5205cc6bcd223e555757522fbc97fe3c9a4946084` matched the release asset digest. `pkgutil --check-signature` verified the Apple Developer ID Installer certificate for Privacy Technologies OU (`X7UJ388FXK`). The local Mac reports macOS 26.6.2. The graphical installation completed.

Used Amnezia's [self-hosted setup](https://docs.amnezia.org/documentation/instructions/install-vpn-on-server/) with `3.69.128.6`, username `ubuntu`, and the dedicated key. First XRay attempt failed with ErrorCode 1200: the app inherited a deleted package-installer `TMPDIR`. Quitting and relaunching normally fixed local file uploads. The retry selected Automatic and installed AmneziaWG; XRay was then added through protocol management and the unused AmneziaWG installation removed through Amnezia. Only `amnezia-xray` remains.

| Runtime observation | Value |
| --- | --- |
| XRay core | `26.7.28`, commit `5ca6f4b`, Linux amd64 |
| Container image ID | `sha256:8453a572d11c510293861f686361a11fd044b3328ad3fee146f3880e784deb97` (locally built by Amnezia) |
| Transport | VLESS, TCP 443, REALITY |
| Default SNI / target | `www.googletagmanager.com` / `www.googletagmanager.com:443` |
| Lifecycle/log settings | Restart `always`; Docker log driver `none`; XRay loglevel `error` |

These are observed defaults, not a comprehensive logging audit or deterministic rebuild guarantee. Amnezia published TCP and UDP 443 in Docker; the AWS security group permits TCP 443 only, and the VPC has no assigned IPv6 range.

The saved Mac connection uses XRay with split tunneling disabled (full-device routing); Soft KillSwitch is enabled. A VPN-only iPhone profile is exported; Anthony subsequently reported the iOS test passed. Private Relay was left enabled and Proton VPN was observed disconnected. Amnezia documents no built-in iOS KillSwitch, and macOS KillSwitch distinguishes unexpected failure from deliberate disconnect. [Client control documentation](https://docs.amnezia.org/documentation/instructions/killswitch/).

## Connectivity evidence

| Check | Observed result |
| --- | --- |
| macOS connection | Amnezia reports Connected; native `curl --noproxy '*' -4` returns `3.69.128.6` |
| Practical macOS browsing | PASS — Anthony reported success on 2026-09-07; video was not included in this confirmation |
| Basic HTTPS | Wikipedia returns HTTP 200 through the tunnel; response identifies the Frankfurt EIP |
| Deliberate disconnect/reconnect | Disconnect restores `5.195.76.221`; reconnect returns to `3.69.128.6` and HTTPS 200 |
| DNS configuration | Connected: `1.1.1.1` / `1.0.0.1`; disconnected: `8.8.8.8` / `8.8.4.4`. No comprehensive DNS leak test completed |
| IPv6 | IPv6-only hostname resolution fails both connected and disconnected. A dual-stack `curl -6` uses IPv4-mapped addresses, so it is not valid native IPv6 evidence. No leak-protection claim from this network |
| SSH while connected | Times out; disconnecting the tunnel restores administration. Leave the operator `/32` restriction intact |
| iOS practical test | PASS — Anthony reported success on 2026-09-07; exact OS/client version and individual subtests not supplied |
| Destination privacy | Owner reported an age-verification prompt; mandatory identity disclosure is unacceptable. See [region assessment](region-selection.md) |
| Video, concurrent use, sleep/network transitions | Pending owner confirmation |

The client source calls `StopRoutingIpv6` when starting XRay; there is no separate IPv6 switch in the inspected connection settings. Validate on a working IPv6 network before claiming enforcement. Private Relay can affect Safari's visible exit address; native requests provide independent tunnel-exit evidence. The Mac is left connected for owner testing. Basic tunnel success does not yet establish the complete PoC release criteria.
