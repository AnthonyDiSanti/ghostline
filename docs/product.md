# Product scope

Read before prioritizing work, choosing acceptance checks, or expanding the PoC. Deployment details live in [architecture](architecture.md); code workflow lives in [development](development.md).

## Objective

Give Anthony a usable, stable private connection from Dubai for browsing blocked sites and ordinary video use. The first question is whether this setup works under the filtering encountered on his actual hotel Wi-Fi and mobile networks.

The PoC is both a useful connection and a reference experiment. Use Amnezia's existing implementation and product choices to discover a good working baseline. If successful, capture those choices in deterministic infrastructure and our own containerized runtime, eventually replacing Amnezia's server installation/management role. Existing community clients can remain useful independently.

## Current scope

| Concern | Decision |
| --- | --- |
| Owner | Anthony; one administrator and one initial user |
| Devices | macOS laptop and iOS phone, including concurrent use; exact OS/client versions recorded at launch |
| Infrastructure | AWS CDK / TypeScript; existing production AWS account; dedicated project resources |
| Region | Stockholm is the authorized primary trial; retain Cape Town as a slower backup; Frankfurt is retired |
| Transport | Preserve Xray / VLESS / REALITY TCP 443; use independently credentialed AmneziaWG UDP 443 as the manual alternative |
| Runtime ownership | Ghostline-managed containers on one Ubuntu host with two EIPs; preserve upstream product choices |
| Routing | Prefer full-device routing; use off-the-shelf clients |
| IPv6 | Want client-side IPv6 blocking while an IPv4 tunnel is active; record actual client support and limitations without building a custom client |
| Failure protection | Enable available client controls where practical; best-effort mobile behavior is accepted |
| Recovery material | Demonstrate restoration of existing Xray credentials on a fresh host; preserve protected local bundles and let Anthony intermediate LastPass |
| Operations | Manual setup and repair; record activities actually performed during launch, with no separate runbook prerequisite |
| Secrets | LastPass for personal/admin material; protected local runtime bundles now; Parameter Store integration deferred |

## Completed runtime checkpoint

Xray was restored onto a fresh server with its original credentials and EIP; Anthony confirmed unchanged macOS/iOS profiles passed. The original host and migration scaffolding are retired. AWG now shares that one host through its own EIP and independent client credentials. Both server runtimes passed reinstall/reboot and distinct egress checks; Anthony confirmed the final iPhone and Mac AWG tests passed on 2026-09-07. Switching remains manual. See the [Cape Town evidence](launch-cape-town.md) for measured checks and owner reports.

## Success evidence

Anthony can connect both devices, browse the intended sites, and use video normally through the saved connection on the networks available for testing. Observe concurrent use and ordinary reconnects after sleep/wake or network changes. Check the exit address and note DNS/IPv6 and disconnect behavior supported by the selected clients.

Keep a short, redacted record of versions, settings needed to connect, necessary launch steps, and results. Capture failures well enough to decide what to try next. This is not a certification matrix, quantified SLA, timed recovery test, or requirement to retain sensitive browsing history. 4K is a desired workload, not a resolution-specific acceptance gate.

Infrastructure and runtime observations are in the [Frankfurt](launch.md) and [Cape Town](launch-cape-town.md) launch records. Anthony reported practical macOS and iOS tests passed for both exits; native Mac switching between them also passed. Cape Town was selected after the Frankfurt age-verification issue. The latest report did not enumerate individual privacy, video, concurrency or IPv6 checks; do not infer those results or a universal exemption from destination-site policies.

## Privacy and accepted limitations

Intended browsing, including adult content, must not require compulsory signup for age verification or disclosure of identity documents, selfies/biometrics or identity-linked verification credentials to destination sites or verification vendors. Anthony made this an explicit requirement after encountering an age check requiring signup through the initial setup. Region choice must account for it; see [region assessment](region-selection.md). A working tunnel alone does not satisfy this requirement.

Privacy remains a product intent: do not add routine browsing, destination, DNS-query, payload, or traffic-capture collection. Use Amnezia's defaults as the reference baseline; a comprehensive audit or custom hardening pass is not a prerequisite to trying the connection. Record relevant settings encountered during launch and avoid stronger no-logging or protection claims than the evidence supports.

Keep production-account controls intact and credentials out of the repository. Separate project resources are sufficient for this phase; high availability and elaborate network segmentation are unnecessary. Runtime hardening belongs with the later deployment architecture, informed by the reference setup.

Loss of the endpoint and AWS management access can leave the PoC unavailable. Manual profile changes, downtime, installer-managed state, changing requirements, and the possibility that the experiment fails are accepted. There is no required disaster-recovery service, monitoring platform, or formal cost-approval framework.

## Later, only when useful

Support explicit named exits with one shared host per region, manual protocol selection and park/redeploy/destroy commands. Retain EIPs only when useful; release disposable PoC exits to avoid idle charges. Automatic switching is neither implemented nor an assumed future capability.

- Add Windows and Android; extend router support to OpenWrt/GL.iNet with third-party packages allowed and UI on/off control as a soft goal.
- Add further exits or another protocol in response to observed need. Keep independent runtime identities for each endpoint.
- Consider ECR image delivery and ECS only if they help. Fargate requires a separate design; it is not a committed destination.
- Add independent friend access or scheduled lifecycle controls if requested.
- Revisit streaming geographic catalogs if desired; no Netflix/catalog acceptance now.

No public service, custom client, user portal, HA deployment, multi-region test program, automatic rotation, or elaborate operational framework is part of the initial experiment.
